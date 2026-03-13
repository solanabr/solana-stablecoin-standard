import express from 'express';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, Idl } from '@coral-xyz/anchor';
import { SolanaStablecoin, Sss } from '@stbr/sss-token';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8899';
const PROGRAM_ID = new PublicKey(process.env.STABLECOIN_PROGRAM_ID || 'HCzhfNz2Kc2wBfacsWzLsM5EdyUEeypFHRzbpDeMb9RM');

// Basic load mechanism to mimic typical prod secret management
function loadKeypair(): Keypair {
    try {
        const path = process.env.KEYPAIR_PATH || require('os').homedir() + '/.config/solana/id.json';
        const secretKeyString = fs.readFileSync(path, { encoding: 'utf8' });
        const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
        return Keypair.fromSecretKey(secretKey);
    } catch (e) {
        console.warn("Using ephemeral keypair for API demo.");
        return Keypair.generate();
    }
}

const connection = new Connection(RPC_URL, "confirmed");
const authority = loadKeypair();
const provider = new AnchorProvider(connection, new Wallet(authority), { commitment: "confirmed" });

// Dummy IDL
const IDL_PLACEHOLDER = {
    address: PROGRAM_ID.toBase58(),
    metadata: { name: "sss", version: "0.1.0", spec: "0.1.0" },
    instructions: [], accounts: [], types: [], events: [], errors: [],
};
const program = new Program(IDL_PLACEHOLDER as unknown as Idl, provider) as Program<Sss>;

// Middleware resolving stablecoin instances dynamically from mint addresses
app.post('/api/compliance/:action', async (req, res) => {
    const { action } = req.params;
    const { mint, account, amount, reason, destination } = req.body;

    if (!mint || !account) {
        return res.status(400).json({ error: "Missing mint or account parameters" });
    }

    try {
        const mintAccount = new PublicKey(mint);
        const targetAccount = new PublicKey(account);
        const [configPda] = SolanaStablecoin.getConfigPda(mintAccount, PROGRAM_ID);
        
        // @ts-ignore
        const stablecoin = new SolanaStablecoin(program, connection, configPda, mintAccount, authority);

        let txSignature = "";

        switch (action) {
            case 'freeze':
                console.log(`[API] Freezing ${account} for mint ${mint}`);
                txSignature = await stablecoin.compliance.freezeAccount(mintAccount, targetAccount);
                break;
            case 'thaw':
                console.log(`[API] Thawing ${account} for mint ${mint}`);
                txSignature = await stablecoin.compliance.thawAccount(mintAccount, targetAccount);
                break;
            case 'blacklist':
                console.log(`[API] Blacklisting ${account} for mint ${mint}. Reason: ${reason}`);
                txSignature = await stablecoin.compliance.blacklistAdd(targetAccount, reason || "API Request");
                break;
            case 'unblacklist':
                console.log(`[API] Unblacklisting ${account} for mint ${mint}`);
                txSignature = await stablecoin.compliance.blacklistRemove(targetAccount);
                break;
            case 'seize':
                if (!destination || !amount) {
                    return res.status(400).json({ error: "Missing destination or amount for seizure" });
                }
                const destAccount = new PublicKey(destination);
                console.log(`[API] Seizing ${amount} from ${account} to ${destination} for mint ${mint}`);
                txSignature = await stablecoin.compliance.seize(mintAccount, targetAccount, destAccount, parseInt(amount));
                break;
            default:
                return res.status(400).json({ error: "Invalid compliance action" });
        }

        return res.json({ success: true, txSignature, action, account: targetAccount.toBase58() });

    } catch (error: any) {
        console.error(`[API Error]`, error);
        return res.status(500).json({ error: error.message || "Internal RPC Error" });
    }
});

app.listen(PORT, () => {
    console.log(`SSS Compliance API listening on port ${PORT}`);
});
