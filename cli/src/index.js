#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const anchor_1 = require("@coral-xyz/anchor");
const sss_token_1 = require("@stbr/sss-token");
// Load default keypair from ~/.config/solana/id.json
function loadKeypair() {
    try {
        const path = require('os').homedir() + '/.config/solana/id.json';
        const secretKeyString = fs.readFileSync(path, { encoding: 'utf8' });
        const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
        return web3_js_1.Keypair.fromSecretKey(secretKey);
    }
    catch (e) {
        console.warn("Failed to load solana keypair. Using ephemeral keypair for demo.");
        return web3_js_1.Keypair.generate();
    }
}
const IDL_PLACEHOLDER = {
    address: "HCzhfNz2Kc2wBfacsWzLsM5EdyUEeypFHRzbpDeMb9RM",
    metadata: {
        name: "sss",
        version: "0.1.0",
        spec: "0.1.0"
    },
    instructions: [],
    accounts: [],
    types: [],
    events: [],
    errors: [],
};
const connection = new web3_js_1.Connection("http://127.0.0.1:8899", "confirmed");
const authority = loadKeypair();
const provider = new anchor_1.AnchorProvider(connection, new anchor_1.Wallet(authority), { commitment: "confirmed" });
const programId = new web3_js_1.PublicKey("HCzhfNz2Kc2wBfacsWzLsM5EdyUEeypFHRzbpDeMb9RM");
const program = new anchor_1.Program(IDL_PLACEHOLDER, provider);
const cli = new commander_1.Command();
cli
    .name('sss-token')
    .description('Solana Stablecoin Standard Operator CLI')
    .version('1.0.0');
cli
    .command('init')
    .description('Initialize a new stablecoin')
    .option('-p, --preset <preset>', 'Preset to use (sss-1, sss-2)')
    .option('-c, --custom <config>', 'Path to custom config file')
    .action(async (options) => {
    let presetEnum;
    if (options.preset === 'sss-1')
        presetEnum = sss_token_1.Presets.SSS_1;
    else if (options.preset === 'sss-2')
        presetEnum = sss_token_1.Presets.SSS_2;
    else {
        console.error('Invalid preset. Must be sss-1 or sss-2');
        process.exit(1);
    }
    try {
        console.log(`Initializing ${options.preset}...`);
        const stablecoin = await sss_token_1.SolanaStablecoin.create(connection, program, {
            preset: presetEnum,
            authority,
        }, {
            name: "SSS Protocol Token",
            symbol: "SSS",
            uri: "",
            decimals: 6
        });
        console.log(`Successfully Initialized Stablecoin!`);
        console.log(`Mint Address: ${stablecoin.mintAccount.toBase58()}`);
        console.log(`Config PDA: ${stablecoin.configPda.toBase58()}`);
    }
    catch (e) {
        console.error("Initialization failed:", e);
    }
});
cli
    .command('mint')
    .argument('<mint_account>', 'Stablecoin mint address')
    .argument('<recipient>', 'Recipient address')
    .argument('<amount>', 'Amount to mint')
    .action(async (mintAccountRaw, recipientRaw, amountRaw) => {
    try {
        const mintAccount = new web3_js_1.PublicKey(mintAccountRaw);
        const recipient = new web3_js_1.PublicKey(recipientRaw);
        const amount = parseInt(amountRaw, 10);
        // Reconstruct SDK instance (normally we fetch Config PDA state)
        const [configPda] = sss_token_1.SolanaStablecoin.getConfigPda(mintAccount, programId);
        // @ts-ignore - hacking the private constructor for CLI reconstruct
        const stablecoin = new sss_token_1.SolanaStablecoin(program, connection, configPda, mintAccount, authority);
        console.log(`Minting ${amount} to ${recipient.toBase58()}...`);
        const tx = await stablecoin.mint({ recipient, amount, minter: authority });
        console.log(`Mint Tx: ${tx}`);
    }
    catch (e) {
        console.error("Mint failed:", e);
    }
});
const blacklist = cli.command('blacklist').description('Manage SSS-2 blacklist');
blacklist
    .command('add')
    .argument('<mint_account>', 'Stablecoin mint address')
    .argument('<address>', 'Address to blacklist')
    .option('-r, --reason <reason>', 'Reason for blacklist')
    .action(async (mintAccountRaw, addressRaw, options) => {
    try {
        const mintAccount = new web3_js_1.PublicKey(mintAccountRaw);
        const address = new web3_js_1.PublicKey(addressRaw);
        const [configPda] = sss_token_1.SolanaStablecoin.getConfigPda(mintAccount, programId);
        // @ts-ignore
        const stablecoin = new sss_token_1.SolanaStablecoin(program, connection, configPda, mintAccount, authority);
        console.log(`Blacklisting ${address.toBase58()}...`);
        const tx = await stablecoin.compliance.blacklistAdd(address, options.reason || "None");
        console.log(`Blacklist Tx: ${tx}`);
    }
    catch (e) {
        console.error("Blacklist failed:", e);
    }
});
cli.parse();
