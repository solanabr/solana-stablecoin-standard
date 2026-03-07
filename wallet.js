const solanaWeb3 = require("@solana/web3.js");

const  connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl("devnet"), "confirmed");

async function createWallet(){
    const keypair = solanaWeb3.Keypair.generate();

    console.log("Public Key:", keypair.publicKey.toString());
    console.log("Secret Key:", keypair.secretKey.toString());

    await getBalance(keypair.publicKey.toString());
}

async function getBalance(address) {

    const pubKey = new solanaWeb3.PublicKey(address);
    const balance = await connection.getBalance(pubKey);

    console.log(`Balance for ${address}: ${balance} lamports`);
    
}

createWallet();