const solanaWeb3 = require("@solana/web3.js");
const { createMint, transfer, mintTo, getOrCreateAssociatedTokenAccount, burn } = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

const connection = new solanaWeb3.Connection("http://127.0.0.1:8899", "confirmed");

function loadMyKeypair() {
    const configPath = path.join(process.env.HOME, ".config", "solana", "id.json");
    const secret = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return solanaWeb3.Keypair.fromSecretKey(Uint8Array.from(secret));
}

const wallet = loadMyKeypair();

async function main() {
  const mint = await createToken();
  const tokenAccount = await createTokenAccount(mint);
  await mintTokens(mint, tokenAccount.address);

  let supply = await getSupply(mint);
  console.log("Total Supply:", supply);

  await burnTokens(tokenAccount.address, mint);

  supply = await getSupply(mint);
  console.log("Total Supply:", supply);

  const accounts = await getTokenAccounts(mint.toString());
  console.log("Token Accounts:", accounts);

  const holders = await getHolders(mint.toString());
  console.log("Token Holders:", holders);

    

}

main().catch((err) => {
    console.error("Error:", err);
});

const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");

async function getTokenAccounts(mint) {

  const accounts =
    await connection.getProgramAccounts(
      TOKEN_PROGRAM_ID,
      {
        filters: [
          { dataSize: 165 },
          {
            memcmp: {
              offset: 0,
              bytes: mint
            }
          }
        ]
      }
    );

  return accounts;
}

async function getHolders(mint) {

  const accounts =
    await connection.getParsedProgramAccounts(
      TOKEN_PROGRAM_ID,
      {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: mint
            }
          }
        ]
      }
    );

  const holders = accounts.map(acc => {

    const data = acc.account.data.parsed.info;

    return {
      owner: data.owner,
      balance: data.tokenAmount.uiAmount
    };

  });

  return holders;
}

async function getSupply(mint) {

  const pubkey = (mint instanceof solanaWeb3.PublicKey) ? mint : new solanaWeb3.PublicKey(mint);

  const supply = await connection.getTokenSupply(pubkey);

  return supply.value.uiAmount;
}

async function getTransactions(address) {

  const signatures =
    await connection.getSignaturesForAddress(
      new solanaWeb3.PublicKey(address)
    );

  return signatures;
}

async function createToken(){

    const mint = await createMint(
        connection,
        wallet,
        wallet.publicKey,
        wallet.publicKey, // Freeze authority (optional)
        9

    );

    console.log("Token Mint Address:", mint.toString());
    return mint;
}

async function createTokenAccount(mint){
    const account = await getOrCreateAssociatedTokenAccount(
        connection,
        wallet,
        mint,
        wallet.publicKey
    );
    console.log("Token Account Address:", account.address.toString());
    return account;
}

async function mintTokens(mint, tokenAccount){

    await mintTo(
        connection,
        wallet,
        mint,
        tokenAccount,
        wallet.publicKey,
        100000000000 // Mint 1000 tokens (considering 9 decimals)
    );

    console.log("Minted 1000 tokens to", tokenAccount.toString());
}

async function transferTokens(senderTokenAccount, recTokenAccount){

    await transfer(
        connection,
        wallet,
        senderTokenAccount,
        recTokenAccount,
        wallet.publicKey,
        500000000 // Transfer 500 tokens (considering 9 decimals
        
    )

    console.log("Transferred 500 tokens from", senderTokenAccount.toString(), "to", recTokenAccount.toString());
}

async function burnTokens(tokenAccount, mint){
    
    await burn(
        connection,
        wallet,
        tokenAccount,
        mint,
        wallet.publicKey,
        20000000000 // Burn 200 tokens (considering 9 decimals)
    );

    console.log("Burned 200 tokens from", tokenAccount.toString());
}
