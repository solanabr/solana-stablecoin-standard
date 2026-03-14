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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const table_1 = require("table");
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const toml = __importStar(require("toml"));
const sss_token_1 = require("solana-stablecoin-sdk");
const config_1 = require("./config");
const program = new commander_1.Command();
program
    .name("sss-token")
    .description("Solana Stablecoin Standard — operator CLI")
    .version("0.1.0")
    .option("-k, --keypair <path>", "Path to keypair file")
    .option("-u, --url <url>", "RPC URL (overrides config)")
    .option("-m, --mint <address>", "Stablecoin mint address");
// ─── init ──────────────────────────────────────────────────────────────────────
const initCmd = program.command("init").description("Initialize a new stablecoin");
initCmd
    .option("--preset <preset>", "Preset: sss-1 | sss-2", "sss-1")
    .option("--custom <path>", "Path to TOML/JSON config file (overrides preset)")
    .option("--name <name>", "Token name", "My Stablecoin")
    .option("--symbol <symbol>", "Token symbol", "MYUSD")
    .option("--uri <uri>", "Metadata URI", "")
    .option("--decimals <decimals>", "Decimal places", "6")
    .option("--alias <alias>", "Alias for this token (for easy reference)")
    .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
    });
    let createOpts;
    if (opts.custom) {
        // Load from file
        const raw = fs.readFileSync(opts.custom, "utf-8");
        const fileConf = opts.custom.endsWith(".toml")
            ? toml.parse(raw)
            : JSON.parse(raw);
        createOpts = {
            connection: config.connection,
            authority: config.keypair,
            name: fileConf.name,
            symbol: fileConf.symbol,
            uri: fileConf.uri ?? "",
            decimals: fileConf.decimals ?? 6,
            extensions: {
                permanentDelegate: fileConf.permanent_delegate ?? false,
                transferHook: fileConf.transfer_hook ?? false,
                defaultAccountFrozen: fileConf.default_account_frozen ?? false,
            },
        };
    }
    else {
        const preset = opts.preset === "sss-2" ? sss_token_1.Preset.SSS_2 : sss_token_1.Preset.SSS_1;
        createOpts = {
            connection: config.connection,
            authority: config.keypair,
            preset,
            name: opts.name,
            symbol: opts.symbol,
            uri: opts.uri,
            decimals: parseInt(opts.decimals),
        };
    }
    const spinner = (0, ora_1.default)(`Initializing ${createOpts.name} (${opts.preset ?? "custom"})...`).start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.create(createOpts);
        (0, config_1.saveMintToConfig)(stable.mint);
        spinner.succeed(chalk_1.default.green(`✓ Stablecoin initialized!\n`) +
            `  Alias:   ${chalk_1.default.cyan(opts.alias || `token${config.mints.size + 1}`)}\n` +
            `  Mint:    ${chalk_1.default.cyan(stable.mint.toBase58())}\n` +
            `  State:   ${chalk_1.default.cyan(stable.statePDA.toBase58())}\n` +
            `  Cluster: ${chalk_1.default.yellow(config.cluster)}`);
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(`Failed: ${e.message}`));
        process.exit(1);
    }
});
// ─── mint ──────────────────────────────────────────────────────────────────────
program
    .command("mint <recipient> <amount>")
    .description("Mint tokens to a recipient")
    .action(async (recipient, amount, opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    const spinner = (0, ora_1.default)(`Minting ${amount} tokens to ${recipient}...`).start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const sig = await stable.mintTokens({
            recipient: new web3_js_1.PublicKey(recipient),
            amount: BigInt(amount),
            minter: config.keypair,
        });
        spinner.succeed(chalk_1.default.green(`✓ Minted ${amount} tokens\n`) +
            `  Tx: ${chalk_1.default.cyan(sig)}`);
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
// ─── burn ──────────────────────────────────────────────────────────────────────
program
    .command("burn <amount>")
    .description("Burn tokens from an account")
    .option("-f, --from <address>", "Source wallet address (defaults to your keypair)")
    .action(async (amount, opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    // Determine source address
    let sourceAddress;
    if (opts.from) {
        try {
            sourceAddress = new web3_js_1.PublicKey(opts.from);
        }
        catch {
            console.error(chalk_1.default.red(`Invalid source address: ${opts.from}`));
            process.exit(1);
        }
    }
    else {
        sourceAddress = config.keypair.publicKey;
    }
    const spinner = (0, ora_1.default)(`Burning ${amount} tokens from ${sourceAddress.toBase58().slice(0, 8)}...`).start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const sig = await stable.burn(sourceAddress, BigInt(amount));
        spinner.succeed(chalk_1.default.green(`✓ Burned ${amount} tokens from ${chalk_1.default.cyan(sourceAddress.toBase58())}\n`) +
            `  Tx: ${chalk_1.default.cyan(sig)}`);
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
// ─── freeze ────────────────────────────────────────────────────────────────────
program
    .command("freeze <address>")
    .description("Freeze a token account")
    .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    const spinner = (0, ora_1.default)(`Freezing ${address}...`).start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const sig = await stable.freeze(new web3_js_1.PublicKey(address));
        spinner.succeed(chalk_1.default.green(`✓ Account frozen\n`) + `  Tx: ${chalk_1.default.cyan(sig)}`);
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
// ─── thaw ──────────────────────────────────────────────────────────────────────
program
    .command("thaw <address>")
    .description("Thaw a frozen token account")
    .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    const spinner = (0, ora_1.default)(`Thawing ${address}...`).start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const sig = await stable.thaw(new web3_js_1.PublicKey(address));
        spinner.succeed(chalk_1.default.green(`✓ Account thawed\n`) + `  Tx: ${chalk_1.default.cyan(sig)}`);
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
// ─── pause / unpause ───────────────────────────────────────────────────────────
program
    .command("pause")
    .description("Pause the protocol (halts minting and burning)")
    .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    const spinner = (0, ora_1.default)("Pausing protocol...").start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const sig = await stable.pause();
        spinner.succeed(chalk_1.default.yellow(`⏸ Protocol paused\n`) + `  Tx: ${chalk_1.default.cyan(sig)}`);
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
program
    .command("unpause")
    .description("Unpause the protocol")
    .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    const spinner = (0, ora_1.default)("Unpausing protocol...").start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const sig = await stable.unpause();
        spinner.succeed(chalk_1.default.green(`▶ Protocol unpaused\n`) + `  Tx: ${chalk_1.default.cyan(sig)}`);
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
// ─── list ────────────────────────────────────────────────────────────────────
program
    .command("list")
    .description("List all configured stablecoins")
    .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
    });
    if (config.mints.size === 0) {
        console.log(chalk_1.default.yellow("No stablecoins configured. Create one with 'sss-token init'"));
        return;
    }
    const rows = [["Alias", "Mint Address", "Default"]];
    for (const [alias, address] of config.mints.entries()) {
        const isDefault = config.currentMint?.toBase58() === address;
        rows.push([
            alias,
            address,
            isDefault ? chalk_1.default.green("✓") : "",
        ]);
    }
    console.log((0, table_1.table)(rows));
});
// ─── use ─────────────────────────────────────────────────────────────────────
program
    .command("use <alias-or-address>")
    .description("Set default stablecoin by alias or address")
    .action(async (aliasOrAddress, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
    });
    (0, config_1.setDefaultMint)(aliasOrAddress);
});
// ─── status (modified) ───────────────────────────────────────────────────────
program
    .command("status [mint]")
    .description("Show stablecoin status (optionally specify mint address or alias)")
    .action(async (mintArg, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: mintArg ? undefined : globalOpts.mint, // Don't use global mint if arg provided
    });
    const mint = (0, config_1.requireMint)(config, mintArg);
    const spinner = (0, ora_1.default)("Fetching status...").start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const state = await stable.getState();
        const supply = await stable.getTotalSupply();
        spinner.stop();
        // Find alias for this mint
        let alias = "";
        for (const [a, addr] of config.mints.entries()) {
            if (addr === mint.toBase58()) {
                alias = a;
                break;
            }
        }
        const rows = [
            ["Alias", alias || "(unnamed)"],
            ["Name", state.name],
            ["Symbol", state.symbol],
            ["Mint", mint.toBase58()],
            ["Decimals", state.decimals.toString()],
            ["Total Supply", supply.toLocaleString()],
            ["Paused", state.paused ? chalk_1.default.red("YES") : chalk_1.default.green("NO")],
            ["Compliance (SSS-2)", state.complianceEnabled ? chalk_1.default.cyan("Enabled") : "Disabled"],
            ["Transfer Hook", state.transferHookEnabled ? chalk_1.default.cyan("Enabled") : "Disabled"],
            ["Master Authority", state.masterAuthority.toBase58()],
        ];
        console.log((0, table_1.table)(rows));
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
// ─── supply ────────────────────────────────────────────────────────────────────
program
    .command("supply [mint]")
    .description("Show current token supply (optionally specify mint address or alias)")
    .action(async (mintArg, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: mintArg ? undefined : globalOpts.mint, // Don't use global mint if arg provided
    });
    const mint = (0, config_1.requireMint)(config, mintArg);
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const supply = await stable.getTotalSupply();
        // Find alias for this mint (if any)
        let alias = "";
        for (const [a, addr] of config.mints.entries()) {
            if (addr === mint.toBase58()) {
                alias = a;
                break;
            }
        }
        if (alias) {
            console.log(`Supply (${chalk_1.default.cyan(alias)}): ${chalk_1.default.cyan(supply.toLocaleString())} tokens`);
            console.log(`Mint: ${chalk_1.default.dim(mint.toBase58())}`);
        }
        else {
            console.log(`Supply: ${chalk_1.default.cyan(supply.toLocaleString())} tokens`);
            console.log(`Mint: ${chalk_1.default.dim(mint.toBase58())}`);
        }
    }
    catch (e) {
        console.error(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
// ─── minters ───────────────────────────────────────────────────────────────────
const mintersCmd = program
    .command("minters")
    .description("Manage minters");
mintersCmd
    .command("add <address>")
    .option("--quota <quota>", "Quota limit (0 = unlimited)", "0")
    .description("Add or update a minter")
    .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    const spinner = (0, ora_1.default)(`Adding minter ${address}...`).start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const sig = await stable.addMinter(new web3_js_1.PublicKey(address), BigInt(opts.quota));
        spinner.succeed(chalk_1.default.green(`✓ Minter added\n`) + `  Tx: ${chalk_1.default.cyan(sig)}`);
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
mintersCmd
    .command("remove <address>")
    .description("Deactivate a minter")
    .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    const spinner = (0, ora_1.default)(`Removing minter ${address}...`).start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const sig = await stable.removeMinter(new web3_js_1.PublicKey(address));
        spinner.succeed(chalk_1.default.green(`✓ Minter deactivated\n`) + `  Tx: ${chalk_1.default.cyan(sig)}`);
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
mintersCmd
    .command("list")
    .description("List all minters for this stablecoin")
    .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    const spinner = (0, ora_1.default)("Fetching minters...").start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const minters = await stable.listMinters();
        spinner.stop();
        if (minters.length === 0) {
            console.log(chalk_1.default.yellow("No minters found."));
            return;
        }
        const rows = [["Address", "Quota", "Minted (epoch)", "Active"]];
        for (const m of minters) {
            rows.push([
                m.address.toBase58(),
                m.quota === 0n ? "unlimited" : m.quota.toLocaleString(),
                m.mintedThisEpoch.toLocaleString(),
                m.active ? chalk_1.default.green("YES") : chalk_1.default.red("NO"),
            ]);
        }
        console.log((0, table_1.table)(rows));
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
// ─── holders ───────────────────────────────────────────────────────────────────
program
    .command("holders")
    .option("--limit <n>", "Max holders to display", "20")
    .description("List token holders for this stablecoin")
    .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    const spinner = (0, ora_1.default)("Fetching holders...").start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const holders = await stable.getHolders();
        spinner.stop();
        if (holders.length === 0) {
            console.log(chalk_1.default.yellow("No holders found."));
            return;
        }
        const limit = parseInt(opts.limit);
        const display = holders.slice(0, limit);
        const rows = [["#", "Owner", "Balance"]];
        display.forEach((h, i) => {
            rows.push([
                (i + 1).toString(),
                h.owner.toBase58(),
                h.balance.toLocaleString(),
            ]);
        });
        console.log((0, table_1.table)(rows));
        if (holders.length > limit) {
            console.log(chalk_1.default.dim(`  ... and ${holders.length - limit} more holders`));
        }
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
// ─── blacklist (SSS-2) ─────────────────────────────────────────────────────────
const blacklistCmd = program
    .command("blacklist")
    .description("Blacklist management (SSS-2 only)");
blacklistCmd
    .command("add <address>")
    .option("--reason <reason>", "Reason for blacklisting", "Compliance action")
    .description("Add an address to the blacklist")
    .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    const spinner = (0, ora_1.default)(`Blacklisting ${address}...`).start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const sig = await stable.compliance.blacklistAdd(new web3_js_1.PublicKey(address), opts.reason);
        spinner.succeed(chalk_1.default.green(`✓ Address blacklisted\n`) + `  Tx: ${chalk_1.default.cyan(sig)}`);
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
blacklistCmd
    .command("remove <address>")
    .option("--reason <reason>", "Reason for removal", "Compliance cleared")
    .description("Remove an address from the blacklist")
    .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    const spinner = (0, ora_1.default)(`Removing ${address} from blacklist...`).start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const sig = await stable.compliance.blacklistRemove(new web3_js_1.PublicKey(address), opts.reason);
        spinner.succeed(chalk_1.default.green(`✓ Address removed from blacklist\n`) +
            `  Tx: ${chalk_1.default.cyan(sig)}`);
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
blacklistCmd
    .command("check <address>")
    .description("Check if an address is blacklisted")
    .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const blacklisted = await stable.compliance.isBlacklisted(new web3_js_1.PublicKey(address));
        if (blacklisted) {
            console.log(chalk_1.default.red(`🚫 ${address} IS blacklisted`));
        }
        else {
            console.log(chalk_1.default.green(`✓ ${address} is NOT blacklisted`));
        }
    }
    catch (e) {
        console.error(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
// ─── seize (SSS-2) ─────────────────────────────────────────────────────────────
program
    .command("seize <address>")
    .option("--to <treasury>", "Treasury address to receive seized tokens")
    .description("Seize tokens from a blacklisted address (SSS-2)")
    .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    if (!opts.to) {
        console.error(chalk_1.default.red("--to <treasury> is required"));
        process.exit(1);
    }
    const spinner = (0, ora_1.default)(`Seizing tokens from ${address}...`).start();
    try {
        const stable = await sss_token_1.SolanaStablecoin.load(config.connection, mint, config.keypair);
        const sig = await stable.compliance.seize(new web3_js_1.PublicKey(address), new web3_js_1.PublicKey(opts.to));
        spinner.succeed(chalk_1.default.green(`✓ Tokens seized\n`) + `  Tx: ${chalk_1.default.cyan(sig)}`);
    }
    catch (e) {
        spinner.fail(chalk_1.default.red(e.message));
        process.exit(1);
    }
});
// ─── audit-log ─────────────────────────────────────────────────────────────────
program
    .command("audit-log")
    .option("--action <type>", "Filter by action type (e.g. Mint, Burn, Pause, Freeze, BlacklistAdd, Seize)")
    .option("--limit <n>", "Max entries to show", "20")
    .description("Show on-chain audit log (from event history)")
    .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = (0, config_1.loadConfig)({
        keypair: globalOpts.keypair,
        url: globalOpts.url,
        mint: globalOpts.mint,
    });
    const mint = (0, config_1.requireMint)(config);
    const actionFilter = opts.action?.toLowerCase();
    const limit = parseInt(opts.limit);
    const fetchLimit = actionFilter ? limit * 5 : limit; // fetch more when filtering
    console.log(chalk_1.default.yellow(`Fetching audit log for mint ${mint.toBase58()}...\n` +
        (actionFilter ? `  Filtering by action: ${opts.action}\n` : "") +
        `(Shows recent on-chain events via getSignaturesForAddress)\n`));
    const signatures = await config.connection.getSignaturesForAddress(mint, { limit: fetchLimit });
    // If action filter is set, fetch full transactions and parse logs
    const rows = [["Signature", "Slot", "Time", "Status", "Action"]];
    let count = 0;
    for (const sig of signatures) {
        if (count >= limit)
            break;
        let action = "-";
        if (actionFilter) {
            try {
                const tx = await config.connection.getTransaction(sig.signature, {
                    maxSupportedTransactionVersion: 0,
                });
                const logs = tx?.meta?.logMessages ?? [];
                // Anchor events are logged as "Program data: ..." or contain instruction names
                const logText = logs.join(" ").toLowerCase();
                // Check for event/instruction keywords
                const eventPatterns = {
                    mint: ["tokensminted", "mint_token", "mint"],
                    burn: ["tokensburned", "burn"],
                    pause: ["stablecoinpaused", "pause"],
                    unpause: ["stablecoinunpaused", "unpause"],
                    freeze: ["accountfrozen", "freeze_account"],
                    thaw: ["accountthawed", "thaw_account"],
                    blacklistadd: ["addressblacklisted", "add_to_blacklist"],
                    blacklistremove: ["addressunblacklisted", "remove_from_blacklist"],
                    seize: ["tokensseized", "seize"],
                    addminter: ["minteradded", "add_minter"],
                    removeminter: ["minterremoved", "remove_minter"],
                    updateroles: ["rolesupdated", "update_roles"],
                };
                const patterns = eventPatterns[actionFilter] ?? [actionFilter];
                const matches = patterns.some((p) => logText.includes(p));
                if (!matches)
                    continue;
                // Determine action from all patterns
                for (const [name, pats] of Object.entries(eventPatterns)) {
                    if (pats.some((p) => logText.includes(p))) {
                        action = name.charAt(0).toUpperCase() + name.slice(1);
                        break;
                    }
                }
            }
            catch {
                continue; // skip transactions we can't parse
            }
        }
        else {
            // No filter - try to detect action from a quick log scan
            try {
                const tx = await config.connection.getTransaction(sig.signature, {
                    maxSupportedTransactionVersion: 0,
                });
                const logs = tx?.meta?.logMessages ?? [];
                const logText = logs.join(" ").toLowerCase();
                const quickPatterns = [
                    ["mint", "Mint"], ["burn", "Burn"], ["pause", "Pause"],
                    ["unpause", "Unpause"], ["freeze", "Freeze"], ["thaw", "Thaw"],
                    ["blacklist", "Blacklist"], ["seize", "Seize"],
                    ["minter", "Minter"], ["role", "Roles"],
                ];
                for (const [pat, label] of quickPatterns) {
                    if (logText.includes(pat)) {
                        action = label;
                        break;
                    }
                }
            }
            catch {
                // ignore parse errors for display
            }
        }
        rows.push([
            sig.signature.slice(0, 20) + "...",
            sig.slot.toString(),
            sig.blockTime
                ? new Date(sig.blockTime * 1000).toISOString()
                : "unknown",
            sig.err ? chalk_1.default.red("FAILED") : chalk_1.default.green("OK"),
            action,
        ]);
        count++;
    }
    if (rows.length <= 1) {
        console.log(chalk_1.default.yellow("No matching transactions found."));
    }
    else {
        console.log((0, table_1.table)(rows));
    }
});
program.parse();
