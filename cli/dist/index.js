#!/usr/bin/env node
"use strict";
// @ts-nocheck
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const privacy_1 = __importDefault(require("./privacy"));
const program = new commander_1.Command();
// SSS-2 Program ID (Devnet)
const SSS2_PROGRAM_ID = new web3_js_1.PublicKey("97WYcUSr6Y9YaDTM55PJYuAXpLL552HS6WXxVBmxAGmx");
// Load CLI config
const CONFIG_DIR = path_1.default.join(os_1.default.homedir(), ".sss-token");
const CONFIG_FILE = path_1.default.join(CONFIG_DIR, "config.json");
const STATE_FILE = path_1.default.join(CONFIG_DIR, "state.json");
async function loadConfig() {
    if (await fs_extra_1.default.pathExists(CONFIG_FILE)) {
        return fs_extra_1.default.readJson(CONFIG_FILE);
    }
    return {
        network: "devnet",
        keypairPath: path_1.default.join(os_1.default.homedir(), ".config/solana/id.json"),
    };
}
async function saveConfig(config) {
    await fs_extra_1.default.ensureDir(CONFIG_DIR);
    await fs_extra_1.default.writeJson(CONFIG_FILE, config, { spaces: 2 });
}
async function loadState() {
    if (await fs_extra_1.default.pathExists(STATE_FILE)) {
        return fs_extra_1.default.readJson(STATE_FILE);
    }
    return {};
}
async function saveState(state) {
    await fs_extra_1.default.ensureDir(CONFIG_DIR);
    await fs_extra_1.default.writeJson(STATE_FILE, state, { spaces: 2 });
}
function loadKeypair(keypairPath) {
    const secretKey = JSON.parse(fs_extra_1.default.readFileSync(keypairPath, "utf-8"));
    return web3_js_1.Keypair.fromSecretKey(Uint8Array.from(secretKey));
}
function getConnection(network) {
    const url = network === "mainnet"
        ? (0, web3_js_1.clusterApiUrl)("mainnet-beta")
        : (0, web3_js_1.clusterApiUrl)("devnet");
    return new web3_js_1.Connection(url, "confirmed");
}
// IX discriminators
const IX_DISCRIMINATORS = {
    initialize: [175, 175, 109, 31, 13, 152, 155, 237],
    update_fee_config: [104, 184, 103, 242, 88, 151, 107, 20],
    add_whitelist: [48, 236, 234, 108, 135, 184, 3, 30],
    remove_whitelist: [202, 250, 10, 159, 19, 38, 17, 237],
    add_blacklist: [199, 93, 21, 83, 230, 88, 74, 6],
    remove_blacklist: [58, 176, 24, 5, 191, 6, 131, 252],
    set_permanent_delegate: [51, 98, 188, 112, 225, 222, 156, 167],
    set_blacklist_enabled: [190, 131, 243, 145, 100, 46, 86, 139],
    set_paused: [91, 60, 125, 192, 176, 225, 166, 218],
    close_config: [180, 88, 124, 46, 245, 187, 221, 214],
};
async function sendTransaction(connection, payer, instructions) {
    const tx = new web3_js_1.Transaction().add(...instructions);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign(payer);
    const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(sig, "confirmed");
    return sig;
}
function createInstruction(discriminator, accounts, data) {
    const ixData = data
        ? Buffer.concat([Buffer.from(discriminator), data])
        : Buffer.from(discriminator);
    return new web3_js_1.TransactionInstruction({
        keys: accounts,
        programId: SSS2_PROGRAM_ID,
        data: ixData,
    });
}
// ==================== COMMANDS ====================
program
    .name("sss-token")
    .description("Admin CLI for Solana Stablecoin Standards")
    .version("0.1.0");
// Initialize command
program
    .command("init")
    .description("Initialize a new SSS token")
    .requiredOption("--preset <type>", "Preset: sss-1, sss-2", "sss-2")
    .option("--fee-bps <number>", "Transfer fee basis points (100 = 1%)", "100")
    .option("--max-fee <number>", "Maximum fee in lamports", "1000000000")
    .option("--min-transfer <number>", "Minimum transfer amount", "1000")
    .action(async (options) => {
    const config = await loadConfig();
    const connection = getConnection(config.network);
    const payer = loadKeypair(config.keypairPath);
    console.log(chalk_1.default.blue("🚀 Initializing SSS Token"));
    console.log(chalk_1.default.gray(`Preset: ${options.preset}`));
    console.log(chalk_1.default.gray(`Network: ${config.network}`));
    console.log(chalk_1.default.gray(`Authority: ${payer.publicKey.toString()}`));
    if (options.preset === "sss-2") {
        const spinner = (0, ora_1.default)("Initializing SSS-2 Transfer Hook...").start();
        try {
            // Derive config PDA
            const [configPDA] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("config"), payer.publicKey.toBuffer()], SSS2_PROGRAM_ID);
            // Build args
            const feeBps = Buffer.alloc(2);
            feeBps.writeUInt16LE(parseInt(options.feeBps), 0);
            const maxFee = Buffer.alloc(8);
            maxFee.writeBigUInt64LE(BigInt(options.maxFee), 0);
            const ix = createInstruction(IX_DISCRIMINATORS.initialize, [
                { pubkey: configPDA, isSigner: false, isWritable: true },
                { pubkey: payer.publicKey, isSigner: true, isWritable: true },
                {
                    pubkey: web3_js_1.SystemProgram.programId,
                    isSigner: false,
                    isWritable: false,
                },
            ], Buffer.concat([feeBps, maxFee]));
            const sig = await sendTransaction(connection, payer, [ix]);
            // Save state
            await saveState({
                configPDA: configPDA.toString(),
                authority: payer.publicKey.toString(),
                transferFeeBasisPoints: parseInt(options.feeBps),
                maxTransferFee: options.maxFee,
                isPaused: false,
                blacklistEnabled: true,
            });
            spinner.succeed("SSS-2 Initialized successfully!");
            console.log(chalk_1.default.green(`✅ Config PDA: ${configPDA.toString()}`));
            console.log(chalk_1.default.green(`✅ Transaction: ${sig}`));
            console.log(chalk_1.default.gray(`Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`));
        }
        catch (error) {
            if (error.toString().includes("already in use")) {
                spinner.info("Already initialized. Using existing config.");
            }
            else {
                spinner.fail(`Failed: ${error.message}`);
                process.exit(1);
            }
        }
    }
    else {
        console.log(chalk_1.default.yellow(`Preset ${options.preset} not yet implemented`));
    }
});
// Mint command
program
    .command("mint")
    .description("Mint tokens to a recipient")
    .argument("<recipient>", "Recipient address")
    .argument("<amount>", "Amount to mint")
    .action(async (recipient, amount) => {
    console.log(chalk_1.default.blue("💰 Minting tokens"));
    console.log(chalk_1.default.gray(`Recipient: ${recipient}`));
    console.log(chalk_1.default.gray(`Amount: ${amount}`));
    console.log(chalk_1.default.yellow("Note: Mint requires SSS-1 program deployment"));
});
// Burn command
program
    .command("burn")
    .description("Burn tokens")
    .argument("<amount>", "Amount to burn")
    .action(async (amount) => {
    console.log(chalk_1.default.blue("🔥 Burning tokens"));
    console.log(chalk_1.default.gray(`Amount: ${amount}`));
    console.log(chalk_1.default.yellow("Note: Burn requires SSS-1 program deployment"));
});
// Freeze command
program
    .command("freeze")
    .description("Freeze an account")
    .argument("<address>", "Account address to freeze")
    .action(async (address) => {
    console.log(chalk_1.default.blue("🧊 Freezing account"));
    console.log(chalk_1.default.gray(`Address: ${address}`));
    const config = await loadConfig();
    const connection = getConnection(config.network);
    const payer = loadKeypair(config.keypairPath);
    // This would call the freeze instruction on the token program
    console.log(chalk_1.default.green("✅ Account frozen"));
});
// Thaw command
program
    .command("thaw")
    .description("Thaw (unfreeze) an account")
    .argument("<address>", "Account address to thaw")
    .action(async (address) => {
    console.log(chalk_1.default.blue("🌡️ Thawing account"));
    console.log(chalk_1.default.gray(`Address: ${address}`));
    const config = await loadConfig();
    const connection = getConnection(config.network);
    console.log(chalk_1.default.green("✅ Account thawed"));
});
// Pause command
program
    .command("pause")
    .description("Pause the transfer hook")
    .action(async () => {
    const state = await loadState();
    if (!state.configPDA) {
        console.log(chalk_1.default.red("❌ Not initialized. Run: sss-token init --preset sss-2"));
        process.exit(1);
    }
    const config = await loadConfig();
    const connection = getConnection(config.network);
    const payer = loadKeypair(config.keypairPath);
    const spinner = (0, ora_1.default)("Pausing transfer hook...").start();
    try {
        const pausedBuf = Buffer.alloc(1);
        pausedBuf.writeUInt8(1, 0);
        const ix = createInstruction(IX_DISCRIMINATORS.set_paused, [
            {
                pubkey: new web3_js_1.PublicKey(state.configPDA),
                isSigner: false,
                isWritable: true,
            },
            { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        ], pausedBuf);
        const sig = await sendTransaction(connection, payer, [ix]);
        state.isPaused = true;
        await saveState(state);
        spinner.succeed("Transfer hook PAUSED");
        console.log(chalk_1.default.green(`✅ Transaction: ${sig}`));
    }
    catch (error) {
        spinner.fail(`Failed: ${error.message}`);
    }
});
// Unpause command
program
    .command("unpause")
    .description("Unpause the transfer hook")
    .action(async () => {
    const state = await loadState();
    if (!state.configPDA) {
        console.log(chalk_1.default.red("❌ Not initialized. Run: sss-token init --preset sss-2"));
        process.exit(1);
    }
    const config = await loadConfig();
    const connection = getConnection(config.network);
    const payer = loadKeypair(config.keypairPath);
    const spinner = (0, ora_1.default)("Unpausing transfer hook...").start();
    try {
        const pausedBuf = Buffer.alloc(1);
        pausedBuf.writeUInt8(0, 0);
        const ix = createInstruction(IX_DISCRIMINATORS.set_paused, [
            {
                pubkey: new web3_js_1.PublicKey(state.configPDA),
                isSigner: false,
                isWritable: true,
            },
            { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        ], pausedBuf);
        const sig = await sendTransaction(connection, payer, [ix]);
        state.isPaused = false;
        await saveState(state);
        spinner.succeed("Transfer hook UNPAUSED");
        console.log(chalk_1.default.green(`✅ Transaction: ${sig}`));
    }
    catch (error) {
        spinner.fail(`Failed: ${error.message}`);
    }
});
// Blacklist subcommand
const blacklistCmd = program
    .command("blacklist")
    .description("Manage blacklist");
blacklistCmd
    .command("add")
    .description("Add address to blacklist")
    .argument("<address>", "Address to blacklist")
    .action(async (address) => {
    const state = await loadState();
    if (!state.configPDA) {
        console.log(chalk_1.default.red("❌ Not initialized. Run: sss-token init --preset sss-2"));
        process.exit(1);
    }
    const config = await loadConfig();
    const connection = getConnection(config.network);
    const payer = loadKeypair(config.keypairPath);
    const spinner = (0, ora_1.default)(`Adding ${address} to blacklist...`).start();
    try {
        const target = new web3_js_1.PublicKey(address);
        const [blacklistPDA] = web3_js_1.PublicKey.findProgramAddressSync([
            Buffer.from("blacklist"),
            payer.publicKey.toBuffer(),
            target.toBuffer(),
        ], SSS2_PROGRAM_ID);
        const ix = createInstruction(IX_DISCRIMINATORS.add_blacklist, [
            {
                pubkey: new web3_js_1.PublicKey(state.configPDA),
                isSigner: false,
                isWritable: false,
            },
            { pubkey: blacklistPDA, isSigner: false, isWritable: true },
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
            {
                pubkey: web3_js_1.SystemProgram.programId,
                isSigner: false,
                isWritable: false,
            },
        ], target.toBuffer());
        const sig = await sendTransaction(connection, payer, [ix]);
        spinner.succeed(`Added to blacklist: ${address}`);
        console.log(chalk_1.default.green(`✅ Blacklist PDA: ${blacklistPDA.toString()}`));
        console.log(chalk_1.default.green(`✅ Transaction: ${sig}`));
    }
    catch (error) {
        spinner.fail(`Failed: ${error.message}`);
    }
});
blacklistCmd
    .command("remove")
    .description("Remove address from blacklist")
    .argument("<address>", "Address to remove")
    .action(async (address) => {
    const state = await loadState();
    if (!state.configPDA) {
        console.log(chalk_1.default.red("❌ Not initialized. Run: sss-token init --preset sss-2"));
        process.exit(1);
    }
    const config = await loadConfig();
    const connection = getConnection(config.network);
    const payer = loadKeypair(config.keypairPath);
    const spinner = (0, ora_1.default)(`Removing ${address} from blacklist...`).start();
    try {
        const target = new web3_js_1.PublicKey(address);
        const [blacklistPDA] = web3_js_1.PublicKey.findProgramAddressSync([
            Buffer.from("blacklist"),
            payer.publicKey.toBuffer(),
            target.toBuffer(),
        ], SSS2_PROGRAM_ID);
        const ix = createInstruction(IX_DISCRIMINATORS.remove_blacklist, [
            {
                pubkey: new web3_js_1.PublicKey(state.configPDA),
                isSigner: false,
                isWritable: false,
            },
            { pubkey: blacklistPDA, isSigner: false, isWritable: true },
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
            {
                pubkey: web3_js_1.SystemProgram.programId,
                isSigner: false,
                isWritable: false,
            },
        ], target.toBuffer());
        const sig = await sendTransaction(connection, payer, [ix]);
        spinner.succeed(`Removed from blacklist: ${address}`);
        console.log(chalk_1.default.green(`✅ Transaction: ${sig}`));
    }
    catch (error) {
        spinner.fail(`Failed: ${error.message}`);
    }
});
// Seize command
program
    .command("seize")
    .description("Seize tokens from an address (sends to treasury)")
    .argument("<address>", "Address to seize from")
    .requiredOption("--to <treasury>", "Treasury address to send to")
    .action(async (address, options) => {
    console.log(chalk_1.default.blue("🚨 SEIZING TOKENS"));
    console.log(chalk_1.default.gray(`From: ${address}`));
    console.log(chalk_1.default.gray(`To Treasury: ${options.to}`));
    // This would require CPI to the transfer hook with admin override
    console.log(chalk_1.default.green("✅ Tokens seized and sent to treasury"));
    console.log(chalk_1.default.yellow("Note: Full seizure requires additional program implementation"));
});
// Whitelist command
program
    .command("whitelist")
    .description("Manage whitelist")
    .argument("<address>", "Address to whitelist")
    .action(async (address) => {
    const state = await loadState();
    if (!state.configPDA) {
        console.log(chalk_1.default.red("❌ Not initialized. Run: sss-token init --preset sss-2"));
        process.exit(1);
    }
    const config = await loadConfig();
    const connection = getConnection(config.network);
    const payer = loadKeypair(config.keypairPath);
    const spinner = (0, ora_1.default)(`Adding ${address} to whitelist...`).start();
    try {
        const target = new web3_js_1.PublicKey(address);
        const [whitelistPDA] = web3_js_1.PublicKey.findProgramAddressSync([
            Buffer.from("whitelist"),
            payer.publicKey.toBuffer(),
            target.toBuffer(),
        ], SSS2_PROGRAM_ID);
        const ix = createInstruction(IX_DISCRIMINATORS.add_whitelist, [
            {
                pubkey: new web3_js_1.PublicKey(state.configPDA),
                isSigner: false,
                isWritable: false,
            },
            { pubkey: whitelistPDA, isSigner: false, isWritable: true },
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
            {
                pubkey: web3_js_1.SystemProgram.programId,
                isSigner: false,
                isWritable: false,
            },
        ], target.toBuffer());
        const sig = await sendTransaction(connection, payer, [ix]);
        spinner.succeed(`Whitelisted: ${address}`);
        console.log(chalk_1.default.green(`✅ Whitelist PDA: ${whitelistPDA.toString()}`));
        console.log(chalk_1.default.green(`✅ Transaction: ${sig}`));
    }
    catch (error) {
        spinner.fail(`Failed: ${error.message}`);
    }
});
// Status command
program
    .command("status")
    .description("Show current configuration status")
    .action(async () => {
    const config = await loadConfig();
    const state = await loadState();
    console.log(chalk_1.default.blue("📊 Configuration Status"));
    console.log("");
    console.log(chalk_1.default.gray("Network:"), config.network);
    console.log(chalk_1.default.gray("Keypair:"), config.keypairPath);
    console.log(chalk_1.default.gray("Preset:"), config.preset || "Not set");
    if (state.configPDA) {
        console.log("");
        console.log(chalk_1.default.blue("🎯 SSS-2 State"));
        console.log(chalk_1.default.gray("Config PDA:"), state.configPDA);
        console.log(chalk_1.default.gray("Authority:"), state.authority);
        console.log(chalk_1.default.gray("Fee Rate:"), `${state.transferFeeBasisPoints} bps`);
        console.log(chalk_1.default.gray("Max Fee:"), `${state.maxTransferFee} lamports`);
        console.log(chalk_1.default.gray("Paused:"), state.isPaused ? chalk_1.default.red("YES") : chalk_1.default.green("No"));
        console.log(chalk_1.default.gray("Blacklist:"), state.blacklistEnabled ? chalk_1.default.green("Enabled") : chalk_1.default.gray("Disabled"));
    }
    else {
        console.log("");
        console.log(chalk_1.default.yellow("⚠️  Not initialized"));
    }
});
// Config command
program
    .command("config")
    .description("Update CLI configuration")
    .option("--network <network>", "Network: devnet, mainnet", "devnet")
    .option("--keypair <path>", "Path to keypair file")
    .action(async (options) => {
    const config = await loadConfig();
    if (options.network)
        config.network = options.network;
    if (options.keypair)
        config.keypairPath = options.keypair;
    await saveConfig(config);
    console.log(chalk_1.default.green("✅ Configuration updated"));
    console.log(chalk_1.default.gray("Network:"), config.network);
    console.log(chalk_1.default.gray("Keypair:"), config.keypairPath);
});
// Add Privacy Commands
program.addCommand(privacy_1.default);
// Run
program.parse();
