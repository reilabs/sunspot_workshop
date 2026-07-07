# OFAC checking token web client

Browser demo of the full OFAC-checking-token flow using [sunspotJS](https://www.npmjs.com/package/@reilabs/sunspot_js):

1. Connect a **Solana wallet** (Phantom / Solflare / Backpack — anything
   Wallet-Standard compliant).
2. Run the `sanction_checker` Noir circuit in-browser via
   [`@reilabs/sunspot_js`](../../../sunspot_js/js) to produce a Groth16
   proof + public witness.
3. Build a devnet transaction — `ComputeBudget` + idempotent-ATA-create
   + the mint program's `verify + mint_to` instruction — and hand it to
   the wallet's `signAndSendTransaction`.

Same on-chain program + mint as [`client/invokeProgram.ts`](../client/invokeProgram.ts):

- Program: `6Yh5yNsCHmzAgHDqRQzrGZv5m1Vbmvvvp7TY822g5KcX`
- Mint: `DayYyJgDX8TptmUi5Zh5cyU5Dht2icw5bdjbUmYki2Sa` (Token-2022, non-transferable, on-chain metadata "OFAC checked" / `OFAC`)
- Cluster: devnet

The mint program refuses to mint if the destination token account
already has a positive balance, so each wallet can only mint the token
once.

## Prerequisites

### 1. Build circuit artifacts

The `.pk` is hundreds of MB and not checked in. Build the three files
this demo serves from `public/artifacts/`:

```bash
cd ../sanction_checker_circuit
nargo compile                                    # → target/sanction_checker.json
sunspot compile target/sanction_checker.json     # → target/sanction_checker.ccs
sunspot setup   target/sanction_checker.ccs      # → target/sanction_checker.pk

cd ../web_demo
cp ../sanction_checker_circuit/target/sanction_checker.{json,ccs,pk} public/artifacts/
```

### 2. Install + bake circuit inputs

```bash
yarn install                     # pulls @reilabs/sunspot_js from npm
yarn gen-inputs                  # Prover.toml → public/artifacts/inputs.json
```

`yarn gen-inputs` reads
[`../sanction_checker_circuit/Prover.toml`](../sanction_checker_circuit/Prover.toml),
so a valid `Prover.toml` must be provided there before running it.

## Run

```bash
yarn dev                         # http://localhost:5173
```

Then in the page:

1. **Connect a wallet** in section 1 (make sure it's set to devnet and
   holds a little SOL for tx fees — grab some from
   <https://faucet.solana.com>).
2. Adjust `current_date` if desired (defaults to the value baked into
   `Prover.toml`).
3. Click **Prove and mint (1 token)** — the page runs the ~n-second
   Noir + Groth16 prove, then pops the wallet for signature. On
   success it shows a Solana Explorer link for the tx.

The token appears in the wallet automatically once the ATA has a
positive balance.

## Prove without minting

The **Prove only (offline / download)** button skips the wallet and
just offers `sanction_checker.proof` + `sanction_checker.pw` as
downloads.
