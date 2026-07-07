// Browser entry: end-to-end OFAC-checking-token flow.
//
//   1. Detects Wallet-Standard Solana wallets (Phantom, Solflare, Backpack, …)
//      and lets the user connect one.
//   2. Runs the Noir sanction_checker circuit via @reilabs/sunspot_js to
//      produce the proof + public witness.
//   3. Builds a devnet transaction — [ComputeBudget, CreateATA-idempotent,
//      mint-program ix] — with proof ‖ pw as the mint ix's instruction data,
//      and hands it to the connected wallet for signAndSendTransaction.
//
// The mint program checks the destination token account has balance 0, so
// each wallet can only mint once.
import './buffer-polyfill';
import { Buffer } from 'buffer';

import {
  init,
  getVariant,
  Noir,
  Witness,
  ZKey,
  prove,
  type Circuit,
  type InputMap,
} from '@reilabs/sunspot_js';
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { StandardConnect, type StandardConnectFeature } from '@wallet-standard/features';
import {
  SolanaSignAndSendTransaction,
  type SolanaSignAndSendTransactionFeature,
} from '@solana/wallet-standard-features';
import { SOLANA_DEVNET_CHAIN } from '@solana/wallet-standard-chains';
import bs58 from 'bs58';

// ---------------------------------------------------------------------------
// Constants — mirror client/invokeProgram.ts
// ---------------------------------------------------------------------------
const PROGRAM_ID = new PublicKey('6Yh5yNsCHmzAgHDqRQzrGZv5m1Vbmvvvp7TY822g5KcX');
const MINT = new PublicKey('DayYyJgDX8TptmUi5Zh5cyU5Dht2icw5bdjbUmYki2Sa');
const RPC_URL = 'https://api.devnet.solana.com';
const CHAIN = SOLANA_DEVNET_CHAIN;

const [MINT_AUTHORITY_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('ofac_check_mint_auth')],
  PROGRAM_ID,
);
const connection = new Connection(RPC_URL, 'confirmed');

const ART = '/artifacts/sanction_checker';
const INPUTS = '/artifacts/inputs.json';

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const dateInput = document.getElementById('current-date') as HTMLInputElement;
const goBtn = document.getElementById('go') as HTMLButtonElement;
const proveOnlyBtn = document.getElementById('prove-only') as HTMLButtonElement;
const walletListEl = document.getElementById('wallet-list') as HTMLDivElement;
const walletStatusEl = document.getElementById('wallet-status') as HTMLDivElement;
const log = document.getElementById('log') as HTMLDivElement;
const downloads = document.getElementById('downloads') as HTMLDivElement;

function line(msg: string, cls: '' | 'ok' | 'err' | 'dim' = ''): void {
  const el = document.createElement('div');
  if (cls) el.className = cls;
  el.textContent = msg;
  log.appendChild(el);
}
function downloadLink(name: string, bytes: Uint8Array): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/octet-stream' }));
  a.download = name;
  a.textContent = `⬇ ${name} (${bytes.byteLength} B)`;
  return a;
}
function shortenAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

// ---------------------------------------------------------------------------
// Wallet-standard: discover, render, connect
// ---------------------------------------------------------------------------
let connectedWallet: Wallet | null = null;
let connectedAccount: WalletAccount | null = null;

function supportsFlow(wallet: Wallet): boolean {
  // Some wallets only advertise `solana:mainnet` in `chains` but happily sign
  // for devnet when the chain is passed to signAndSendTransaction, so we only
  // require a Solana chain of any kind here.
  return (
    StandardConnect in wallet.features &&
    SolanaSignAndSendTransaction in wallet.features &&
    wallet.chains.some((c) => c.startsWith('solana:'))
  );
}

function renderWallets(): void {
  const wallets = getWallets().get().filter(supportsFlow);
  walletListEl.replaceChildren();
  if (wallets.length === 0) {
    const s = document.createElement('span');
    s.className = 'dim';
    s.textContent = 'no wallet-standard Solana wallets detected — install Phantom / Solflare / Backpack';
    walletListEl.appendChild(s);
    return;
  }
  for (const w of wallets) {
    const b = document.createElement('button');
    if (w.icon) {
      const img = document.createElement('img');
      img.src = w.icon;
      img.width = 16;
      img.height = 16;
      img.style.verticalAlign = 'middle';
      img.style.marginRight = '0.3rem';
      b.appendChild(img);
    }
    b.appendChild(document.createTextNode(w.name));
    b.onclick = () => connectWallet(w);
    walletListEl.appendChild(b);
  }
}

async function connectWallet(wallet: Wallet): Promise<void> {
  walletStatusEl.textContent = '';
  try {
    const feature = wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect];
    const { accounts } = await feature.connect();
    const account = accounts.find((a) => a.chains.includes(CHAIN)) ?? accounts[0];
    if (!account) throw new Error('wallet returned no accounts');
    connectedWallet = wallet;
    connectedAccount = account;
    walletStatusEl.innerHTML = `<span class="ok">connected: ${wallet.name}</span> <code class="addr">${shortenAddr(account.address)}</code>`;
  } catch (e) {
    walletStatusEl.innerHTML = `<span class="err">connect failed: ${(e as Error).message}</span>`;
  }
}

const { on: onWalletsChange } = getWallets();
onWalletsChange('register', renderWallets);
onWalletsChange('unregister', renderWallets);
renderWallets();

// ---------------------------------------------------------------------------
// Assets + sunspot init
// ---------------------------------------------------------------------------
const assetsPromise = (async () => {
  await init();
  line(`sunspot_js variant: ${getVariant()}`, 'dim');
  const [circuit, inputs, zkey] = await Promise.all([
    fetch(`${ART}.json`).then((r) => r.json() as Promise<Circuit>),
    fetch(INPUTS).then((r) => r.json() as Promise<InputMap>),
    ZKey.fromUnchecked(fetch(`${ART}.pk`), fetch(`${ART}.ccs`)),
  ]);
  dateInput.value = String(inputs.current_date ?? '');
  line('artifacts + inputs loaded', 'dim');
  return { circuit, inputs, zkey };
})().catch((e: Error) => {
  line(`asset load failed: ${e.message}`, 'err');
  throw e;
});

// ---------------------------------------------------------------------------
// Prove (cached by current_date so we don't re-prove on the mint click)
// ---------------------------------------------------------------------------
type Proven = { proofBytes: Uint8Array; publicBytes: Uint8Array; dateUsed: string };
let cached: Proven | null = null;

async function runProve(inputs: InputMap): Promise<Omit<Proven, 'dateUsed'>> {
  const { circuit, zkey } = await assetsPromise;
  line('solving witness…');
  const tSolve = performance.now();
  const { witness: witnessStack } = await new Noir(circuit).execute(inputs);
  const gnarkWitness = new Witness(circuit, witnessStack);
  let publicBytes: Uint8Array;
  try {
    publicBytes = gnarkWitness.publicBytes();
  } finally {
    gnarkWitness.free();
  }
  line(`  solved in ${(performance.now() - tSolve).toFixed(0)} ms`, 'dim');
  line('proving…');
  const tProve = performance.now();
  const proof = await prove(inputs, circuit, zkey);
  const proofBytes = proof.asBytes();
  line(`  proved in ${(performance.now() - tProve).toFixed(0)} ms`, 'dim');
  if (!proof.isValid()) throw new Error('proof self-check failed');
  return { proofBytes, publicBytes };
}

async function proofFor(dateValue: string): Promise<Proven> {
  if (cached?.dateUsed === dateValue) {
    line('reusing cached proof', 'dim');
    return cached;
  }
  const { inputs } = await assetsPromise;
  const runInputs: InputMap = { ...inputs, current_date: dateValue };
  const { proofBytes, publicBytes } = await runProve(runInputs);
  cached = { proofBytes, publicBytes, dateUsed: dateValue };
  return cached;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
proveOnlyBtn.addEventListener('click', async () => {
  proveOnlyBtn.disabled = true;
  goBtn.disabled = true;
  downloads.replaceChildren();
  try {
    const { proofBytes, publicBytes } = await proofFor(dateInput.value);
    downloads.appendChild(downloadLink('sanction_checker.proof', proofBytes));
    downloads.appendChild(downloadLink('sanction_checker.pw', publicBytes));
    line('use both files with `client/invokeProgram.ts <dest-ATA> proof.bin pw.bin`', 'dim');
  } catch (e) {
    line((e as Error).message, 'err');
  } finally {
    proveOnlyBtn.disabled = false;
    goBtn.disabled = false;
  }
});

goBtn.addEventListener('click', async () => {
  goBtn.disabled = true;
  proveOnlyBtn.disabled = true;
  downloads.replaceChildren();
  try {
    if (!connectedWallet || !connectedAccount) {
      line('connect a wallet first (section 1)', 'err');
      return;
    }
    const walletPubkey = new PublicKey(connectedAccount.address);

    const { proofBytes, publicBytes } = await proofFor(dateInput.value);

    line('building mint transaction…');
    const ata = getAssociatedTokenAddressSync(MINT, walletPubkey, false, TOKEN_2022_PROGRAM_ID);
    line(`  destination ATA: ${shortenAddr(ata.toBase58())}`, 'dim');

    // proof ‖ public witness — same layout as invokeProgram.ts.
    // sunspot_js's publicBytes() emits raw 32-byte limbs; the on-chain parser
    // expects gnark's 12-byte witness header first (nb_public, nb_secret,
    // vector_len as u32 BE). CLI .pw files include it; we synthesize it here.
    const nPublic = publicBytes.byteLength / 32;
    const header = Buffer.alloc(12);
    header.writeUInt32BE(nPublic, 0);   // nb_public
    header.writeUInt32BE(0, 4);          // nb_secret
    header.writeUInt32BE(nPublic, 8);    // vector length
    const data = Buffer.concat([Buffer.from(proofBytes), header, Buffer.from(publicBytes)]);
    const mintIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: MINT, isSigner: false, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: MINT_AUTHORITY_PDA, isSigner: false, isWritable: false },
      ],
      data,
    });

    const { blockhash } = await connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: walletPubkey,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 520_000 }),
        createAssociatedTokenAccountIdempotentInstruction(
          walletPubkey,
          ata,
          walletPubkey,
          MINT,
          TOKEN_2022_PROGRAM_ID,
        ),
        mintIx,
      ],
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);
    const serialized = tx.serialize();

    line('requesting wallet signature…');
    const feature = connectedWallet.features[
      SolanaSignAndSendTransaction
    ] as SolanaSignAndSendTransactionFeature[typeof SolanaSignAndSendTransaction];
    // skipPreflight so Phantom doesn't swallow the real program error behind
    // "Unexpected error" — we surface it ourselves from the on-chain logs.
    const [{ signature }] = await feature.signAndSendTransaction({
      account: connectedAccount,
      transaction: serialized,
      chain: CHAIN,
      options: { skipPreflight: true, commitment: 'confirmed' },
    });
    const sig = bs58.encode(signature);
    line(`sent: ${sig}`, 'dim');
    const link = document.createElement('a');
    link.className = 'link';
    link.href = `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
    link.textContent = 'view on Solana Explorer ↗';
    link.target = '_blank';
    link.rel = 'noopener';
    downloads.appendChild(link);

    // getTransaction can lag briefly behind commitment. Poll for the record.
    let txInfo: Awaited<ReturnType<typeof connection.getTransaction>> = null;
    for (let i = 0; i < 10 && !txInfo; i++) {
      txInfo = await connection.getTransaction(sig, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (!txInfo) await new Promise((r) => setTimeout(r, 500));
    }

    const logs = txInfo?.meta?.logMessages ?? [];
    // Program prints `Minted <n> token to <pubkey>` on the mint-to CPI success.
    // Absence of that line — regardless of tx-level success — means no token.
    const mintedLine = logs.find((l) => l.startsWith('Program log: Minted '));
    if (mintedLine) {
      line(mintedLine.replace(/^Program log: /, ''), 'ok');
    } else {
      line('mint did not complete', 'err');
      if (txInfo?.meta?.err) line(`tx error: ${JSON.stringify(txInfo.meta.err)}`, 'err');
      if (!txInfo) line('  transaction not indexed yet — check the explorer link', 'dim');
      for (const l of logs) line(`  ${l}`, 'dim');
    }
  } catch (e) {
    line((e as Error).message, 'err');
  } finally {
    goBtn.disabled = false;
    proveOnlyBtn.disabled = false;
  }
});
