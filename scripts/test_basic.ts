import { Connection, Keypair } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { StablecoinSDK } from "../sdk/src/index";
import * as fs from "fs";
import * as os from "os";

async function main() {
    console.log("=== SSS-1 Basic Flow Test ===");

    const keypairPath = `${os.homedir()}/.config/solana/id.json`;
    const secretKeyString = fs.readFileSync(keypairPath, "utf8");
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));

    const adminKeypair = Keypair.fromSecretKey(secretKey);
    const wallet = new Wallet(adminKeypair);

    const connection = new Connection("http://127.0.0.1:8899", "confirmed");

    const programId = "451UiDzutoMvqZkEj94PSNQTZELV4JqWRdiSoiJB9bxp";

    const sdk = new StablecoinSDK(connection, wallet, programId);

    try {
        console.log("\n--- Creating Token ---");

        const mintAddress = await sdk.create(
            "Super USD",
            "SUSD",
            "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png"
        );

        console.log("Mint address:", mintAddress.toBase58());

        // 🔎 ДИАГНОСТИКА
        const info = await connection.getAccountInfo(mintAddress);

        if (info) {
            console.log("Mint owner:", info.owner.toBase58());
            console.log("Mint data length:", info.data.length);
            console.log("Mint lamports:", info.lamports);
        } else {
            console.log("Mint account not found");
        }

        console.log("\n--- Minting Tokens ---");

        await sdk.mint(mintAddress, adminKeypair.publicKey, 1000);

        console.log("\n✅ Test completed successfully!");

    } catch (error) {
        console.error("❌ Error during test:", error);
    }
}

main();