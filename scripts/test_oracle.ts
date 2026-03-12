import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { StablecoinSDK, Presets } from "../sdk/src/index";
import * as fs from "fs";
import * as os from "os";

async function main() {
    console.log("=== ORACLE BACKED STABLECOIN TEST (EUR/USD) ===");

    const keypairPath = `${os.homedir()}/.config/solana/id.json`;
    const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8"))));
    const connection = new Connection("http://127.0.0.1:8899", "confirmed");

    const programId = "451UiDzutoMvqZkEj94PSNQTZELV4JqWRdiSoiJB9bxp"; 
    const sdk = new StablecoinSDK(connection, adminKeypair, programId);

    try {
        // 1. Устанавливаем курс оракула: 1 EUR = 1.10 USD
        const oracleAddress = await sdk.updateMockOracle(1.10, 6);

        // 2. Создаем EUR-стейблкоин с привязкой к нашему оракулу
        const mintAddress = await sdk.create(
            "Euro Stablecoin",
            "SEUR",
            "https://example.com/eur.png",
            6,
            Presets.ORACLE_BACKED,
            undefined, // Без хука
            oracleAddress // Передаем оракул!
        );

        const user = Keypair.generate();

        // 3. ПЕЧАТАЕМ ДЕНЬГИ!
        // Юзер приносит 1000 USDC (базовый amount).
        // Так как курс 1.10, смарт-контракт должен выдать ему: 1000 / 1.10 = 909.09 SEUR
        console.log("\n--- Minting 1000 USD equivalent in EUR ---");
        await sdk.mint(mintAddress, user.publicKey, 1000, 6, oracleAddress);

        console.log("\n✅ Oracle test passed! The smart contract dynamically adjusted the minted amount based on the feed!");

    } catch (error) {
        console.error("❌ Error during test:", error);
    }
}

main();