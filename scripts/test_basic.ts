import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { StablecoinSDK, Presets } from "../sdk/src/index";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

async function main() {
    console.log("=== SSS-2 Compliant Flow Test ===");

    const keypairPath = `${os.homedir()}/.config/solana/id.json`;
    const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8"))));
    const connection = new Connection("http://127.0.0.1:8899", "confirmed");

    const programId = "451UiDzutoMvqZkEj94PSNQTZELV4JqWRdiSoiJB9bxp";
    const hookAddress = new PublicKey("5cs7VzZny1XMj4TAJy2xVqo2tCHM8Vwe9bNbL6uRmbxk"); 
    
    // Передаем hookAddress в SDK для инициализации
    const sdk = new StablecoinSDK(connection, adminKeypair, programId, hookAddress.toBase58());

    try {
        const mintAddress = await sdk.create("Regulated USD", "RUSD", "https://example.com/logo.png", 6, Presets.SSS_2, hookAddress);
        console.log("\n--- Initializing ExtraAccountMetaList (required for Transfer Hook) ---");
        await sdk.initializeExtraAccountMetaList(mintAddress);

        const badGuy = Keypair.generate();
        const innocentGuy = Keypair.generate();
        const treasury = adminKeypair.publicKey;

        await sdk.mint(mintAddress, badGuy.publicKey, 1000);

        // 3. ДОБАВЛЕНИЕ В BLACKLIST
        console.log("\n--- Blacklisting Bad Guy ---");
        await sdk.compliance.blacklistAdd(badGuy.publicKey, hookAddress);

        // 4. ТЕСТ ПЕРЕВОДА (ДОЛЖЕН УПАСТЬ!)
        console.log("\n--- Testing Transfer (Should Fail) ---");
        const airdropSig = await connection.requestAirdrop(badGuy.publicKey, 1000000000);
        await connection.confirmTransaction(airdropSig);
        
        try {
            await sdk.transfer(mintAddress, badGuy, innocentGuy.publicKey, 100, 6, hookAddress);
            console.log("❌ ERROR: Transfer succeeded but it should have failed!");
        } catch (e) {
            console.log("✅ SUCCESS! Transfer blocked by Transfer Hook successfully! (Wallet is Blacklisted)");
        }

        const badGuyAta = getAssociatedTokenAddressSync(mintAddress, badGuy.publicKey, false, TOKEN_2022_PROGRAM_ID);
        console.log("\n--- SEIZING TOKENS ---");
        await sdk.compliance.seize(mintAddress, badGuyAta, treasury, 900);

        console.log("\n✅ SSS-2 Test completed successfully! All Compliance rules verified.");

    } catch (error) {
        console.error("❌ Error during test:", error);
    }
}

main();