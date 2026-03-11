const solanaWeb3 = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const connection = new solanaWeb3.Connection("http://127.0.0.1:8899", "confirmed");


function loadCliKeypair() {
    const configPath = path.join(process.env.HOME, ".config", "solana", "id.json");
    const secret = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return solanaWeb3.Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function createWallet(){
    const keypair = solanaWeb3.Keypair.generate();
    const recKeypair = solanaWeb3.Keypair.generate();

    console.log("Public Key:", keypair.publicKey.toString());
    console.log("Secret Key:", keypair.secretKey.toString());

    console.log("Recipient Public Key:", recKeypair.publicKey.toString());
    console.log("Recipient Secret Key:", recKeypair.secretKey.toString());


   
  
    await getBalance(keypair.publicKey.toString());
    const mywall = loadCliKeypair();
    console.log("CLI Wallet Public Key:", mywall.publicKey.toString());
    await getBalance(mywall.publicKey.toString());

    try {
       await fundKeypair(mywall, keypair.publicKey, 2); 
    } catch (error) {
        console.error("Error funding wallet:", error);
    }

    await fundKeypair(mywall, recKeypair.publicKey, 2);

    await getBalance(keypair.publicKey.toString());
    await getBalance(recKeypair.publicKey.toString());
    await sendSol(keypair, recKeypair.publicKey, 1); 

    await getTransactions(keypair.publicKey.toString());
}

async function getTransactions(address) {

  const pubkey = new solanaWeb3.PublicKey(address);

  const signatures = await connection.getSignaturesForAddress(pubkey);

  console.log(signatures);
}

async function fundKeypair(funderKeypair, targetPubKey, solAmount) {
    const minLamports = solAmount * solanaWeb3.LAMPORTS_PER_SOL;
    let balance = await connection.getBalance(targetPubKey);
    if (balance >= minLamports) {
        console.log(`Wallet ${targetPubKey.toString()} already funded: ${balance} lamports`);
        return;
    }
    console.log(`Funding ${targetPubKey.toString()} from ${funderKeypair.publicKey.toString()}...`);
    const tx = new solanaWeb3.Transaction().add(
        solanaWeb3.SystemProgram.transfer({
            fromPubkey: funderKeypair.publicKey,
            toPubkey: targetPubKey,
            lamports: minLamports
        })
    );

    console.log("Sending transaction...");
    
    const sig = await solanaWeb3.sendAndConfirmTransaction(
        connection,
        tx,
        [funderKeypair]
    );
    console.log("Transaction Signature:", sig);
   
}

async function getBalance(address) {

    const pubKey = new solanaWeb3.PublicKey(address);
    const balance = await connection.getBalance(pubKey);

    console.log(`Balance for ${address}: ${balance} lamports`);
    
}

async function sendSol(sender, rec, amount){

    const tx = new solanaWeb3.Transaction().add(
        solanaWeb3.SystemProgram.transfer({
            fromPubkey: sender.publicKey,
            toPubkey: rec,
            lamports: amount * solanaWeb3.LAMPORTS_PER_SOL,

        })
    );

    const sig = await solanaWeb3.sendAndConfirmTransaction(
        connection,
        tx,
        [sender]
    )

    console.log("Transaction Signature:", sig);

}

createWallet();