import { Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import dotenv from "dotenv";
import path from "path";

// Загружаем .env из папки cli
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export function getConfig() {
    const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8899";
    const programId = process.env.PROGRAM_ID;
    const hookId = process.env.HOOK_PROGRAM_ID;
    
    let keypairPath = process.env.KEYPAIR_PATH || "~/.config/solana/id.json";
    if (keypairPath.startsWith("~")) {
        keypairPath = path.join(os.homedir(), keypairPath.slice(1));
    }

    if (!fs.existsSync(keypairPath)) {
        throw new Error(`Keypair not found at ${keypairPath}. Please generate one using 'solana-keygen new'.`);
    }

    const secretKeyString = fs.readFileSync(keypairPath, "utf8");
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    const adminKeypair = Keypair.fromSecretKey(secretKey);

    const connection = new Connection(rpcUrl, "confirmed");

    return {
        connection,
        adminKeypair,
        programId: programId!,
        hookId: hookId!
    };
}