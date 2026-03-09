// scripts/test_init_mint2.ts
import { Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, ExtensionType, getMintLen, createInitializeMint2Instruction } from "@solana/spl-token";

async function main() {
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const keypairPath = require('os').homedir() + '/.config/solana/id.json';
  const sk = Uint8Array.from(JSON.parse(require('fs').readFileSync(keypairPath, 'utf8')));
  const payer = Keypair.fromSecretKey(sk);

  const mint = Keypair.generate();

  // compute space using the same helper
  const expectedMintLen = getMintLen([]);
  console.log("expectedMintLen =", expectedMintLen);

  const lamports = await connection.getMinimumBalanceForRentExemption(expectedMintLen);
  const createIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mint.publicKey,
    lamports,
    space: expectedMintLen,
    programId: TOKEN_2022_PROGRAM_ID,
  });

  // send create account
  const tx1 = new Transaction().add(createIx);
  await sendAndConfirmTransaction(connection, tx1, [payer, mint], {commitment: "confirmed"});
  const info = await connection.getAccountInfo(mint.publicKey);
  console.log("after create: owner=", info?.owner.toBase58(), "len=", info?.data.length, "lamports=", info?.lamports);

  // build initialize_mint2 instruction from spl-token helper
  // NOTE: `createInitializeMint2Instruction` accepts args (mintPubkey, decimals, mintAuthority, freezeAuthority, tokenProgram)
  const initializeIx = createInitializeMint2Instruction(
    mint.publicKey,
    6, // decimals example
    payer.publicKey, // mint authority
    payer.publicKey, // freeze authority (or null)
    TOKEN_2022_PROGRAM_ID
  );

  // send tx with direct call to token-2022 program
  const tx2 = new Transaction().add(initializeIx);
  try {
    const sig = await sendAndConfirmTransaction(connection, tx2, [payer], {commitment: "confirmed"});
    console.log("initialize_mint2 succeeded, sig:", sig);
  } catch (err: any) {
    console.error("initialize_mint2 failed:", err);
    if (err.logs) console.error("logs:", err.logs);
    if (err.message) console.error(err.message);
  }
}

main();