import { Connection, Keypair } from "@solana/web3.js";
import { StablecoinSDK } from "../sdk/src/index";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

async function main() {
    console.log("=== SSS-2 Compliant Flow Test (Seize) ===");

    const keypairPath = `${os.homedir()}/.config/solana/id.json`;
    const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8"))));

    const connection = new Connection("http://127.0.0.1:8899", "confirmed");

    // УБЕДИСЬ ЧТО ТУТ ТВОЙ PROGRAM ID!
    const programId = "451UiDzutoMvqZkEj94PSNQTZELV4JqWRdiSoiJB9bxp";
    
    // Передаем Keypair напрямую!
    const sdk = new StablecoinSDK(connection, adminKeypair, programId);

    try {
        // 1. Создаем SSS-2 токен (с включенным Permanent Delegate)
        const mintAddress = await sdk.create(
            "Regulated USD",
            "RUSD",
            "https://example.com/logo.png",
            6,
            true, // enablePermanentDelegate = TRUE
            false // transferHook пока выключен
        );

        // 2. Создаем кошелек "плохого парня" и наш (treasury)
        const badGuy = Keypair.generate();
        const treasury = adminKeypair.publicKey;

        // 3. Печатаем 1000 токенов плохому парню
        console.log("\n--- Minting to Bad Guy ---");
        await sdk.mint(mintAddress, badGuy.publicKey, 1000);

        // Вычисляем ATA адреса
        // Используем импорт прямо из @solana/spl-token
        const { TOKEN_2022_PROGRAM_ID } = require("@solana/spl-token");
        const badGuyAta = getAssociatedTokenAddressSync(mintAddress, badGuy.publicKey, false, TOKEN_2022_PROGRAM_ID);
        const treasuryAta = getAssociatedTokenAddressSync(mintAddress, treasury, false, TOKEN_2022_PROGRAM_ID);
        console.log(`treasuryAta: ${treasuryAta}`)

        // 4. КОНФИСКАЦИЯ!
        console.log("\n--- SEIZING TOKENS ---");
        await sdk.seize(mintAddress, badGuyAta, treasury, 1000);

        console.log("\n✅ Seize completed successfully! Compliance module works!");

    } catch (error) {
        console.error("❌ Error during test:", error);
    }
}

main();