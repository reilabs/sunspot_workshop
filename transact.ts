import { 
  Connection, 
  PublicKey, 
  TransactionInstruction, 
  Transaction, 
  Keypair, 
  sendAndConfirmTransaction, 
  clusterApiUrl 
} from '@solana/web3.js';
import * as fs from 'fs';

async function run() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log("Usage: tsx transact.ts <PROGRAM_ADDRESS> <FILE1> <FILE2> ...");
    process.exit(1);
  }

  const programId = new PublicKey(args[0]);
  const files = args.slice(1);

  // 1. Concatenate bytes from files
  const byteArrays = files.map(file => fs.readFileSync(file));
  const combinedData = Buffer.concat(byteArrays);

  console.log(`Sending ${combinedData.length} bytes to ${programId.toBase58()}...`);

  // 2. Set up Connection and Payer (using local config or a new key)
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  // Load your local Solana CLI wallet keypair
  const secretKey = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/solana/id.json', 'utf8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  // 3. Create the Instruction
  const instruction = new TransactionInstruction({
    keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }],
    programId: programId,
    data: combinedData, // Your concatenated bytes
  });

  // 4. Send Transaction
  const transaction = new Transaction().add(instruction);
  const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);

  console.log("Transaction confirmed!");
  console.log(`Signature: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

run().catch(console.error);