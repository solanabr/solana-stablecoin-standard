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
exports.loadConfig = loadConfig;
exports.requireMint = requireMint;
exports.saveMintToConfig = saveMintToConfig;
exports.setDefaultMint = setDefaultMint;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const web3_js_1 = require("@solana/web3.js");
const toml = __importStar(require("toml"));
const dotenv_1 = __importDefault(require("dotenv"));
const chalk_1 = __importDefault(require("chalk"));
dotenv_1.default.config();
const DEFAULT_CONFIG_PATH = path.join(process.env.HOME || "~", ".config", "sss-token", "config.toml");
function loadConfig(overrides = {}) {
    // Load config file if it exists
    let fileConfig = {};
    const configPath = process.env.SSS_CONFIG || DEFAULT_CONFIG_PATH;
    if (fs.existsSync(configPath)) {
        try {
            fileConfig = toml.parse(fs.readFileSync(configPath, "utf-8"));
        }
        catch (_) {
            // ignore parse errors — env/flags take priority
        }
    }
    // Resolve cluster/RPC URL
    const clusterUrl = overrides.url ||
        process.env.SSS_RPC_URL ||
        fileConfig.rpc_url ||
        "https://api.devnet.solana.com";
    const cluster = clusterUrl.includes("mainnet")
        ? "mainnet-beta"
        : clusterUrl.includes("devnet")
            ? "devnet"
            : "localnet";
    const connection = new web3_js_1.Connection(clusterUrl, "confirmed");
    // Resolve keypair
    const keypairPath = overrides.keypair ||
        process.env.SSS_KEYPAIR ||
        fileConfig.keypair ||
        path.join(process.env.HOME || "~", ".config", "solana", "id.json");
    if (!fs.existsSync(keypairPath)) {
        console.error(chalk_1.default.red(`Keypair not found: ${keypairPath}`));
        console.error(chalk_1.default.yellow("Set SSS_KEYPAIR env var or pass --keypair flag"));
        process.exit(1);
    }
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
    const keypair = web3_js_1.Keypair.fromSecretKey(secretKey);
    // Build mints map
    const mints = new Map();
    if (fileConfig.mints) {
        Object.entries(fileConfig.mints).forEach(([alias, address]) => {
            mints.set(alias, address);
        });
    }
    // Resolve current mint (priority: flag > env > config default)
    const mintStr = overrides.mint || process.env.SSS_MINT || fileConfig.default_mint;
    const currentMint = mintStr ? new web3_js_1.PublicKey(mintStr) : undefined;
    return { connection, keypair, currentMint, mints, cluster };
}
function requireMint(config, mintArg) {
    // If mint arg provided, use it directly
    if (mintArg) {
        try {
            return new web3_js_1.PublicKey(mintArg);
        }
        catch {
            // If it's not a valid pubkey, try as alias
            const aliasMint = config.mints.get(mintArg);
            if (aliasMint) {
                return new web3_js_1.PublicKey(aliasMint);
            }
            console.error(chalk_1.default.red(`Invalid mint address or alias: ${mintArg}`));
            process.exit(1);
        }
    }
    // Fall back to current mint
    if (!config.currentMint) {
        console.error(chalk_1.default.red("No mint address configured."));
        console.error(chalk_1.default.yellow("Options:\n" +
            "  1. Set SSS_MINT env var\n" +
            "  2. Add 'default_mint' to your config file\n" +
            "  3. Pass --mint flag with address or alias\n" +
            "  4. Use 'sss-token use <alias>' to set default"));
        process.exit(1);
    }
    return config.currentMint;
}
function saveMintToConfig(mint, alias) {
    const configDir = path.dirname(process.env.SSS_CONFIG || DEFAULT_CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    const configPath = process.env.SSS_CONFIG || DEFAULT_CONFIG_PATH;
    let existing = {};
    if (fs.existsSync(configPath)) {
        try {
            existing = toml.parse(fs.readFileSync(configPath, "utf-8"));
        }
        catch (_) { }
    }
    // Initialize mints object if it doesn't exist
    if (!existing.mints) {
        existing.mints = {};
    }
    // Generate alias if not provided
    const mintAlias = alias || `token${Object.keys(existing.mints).length + 1}`;
    // Add new mint
    existing.mints[mintAlias] = mint.toBase58();
    // Set as default if it's the first one
    if (!existing.default_mint) {
        existing.default_mint = mint.toBase58();
    }
    // Write as TOML
    const content = [];
    if (existing.rpc_url)
        content.push(`rpc_url = "${existing.rpc_url}"`);
    if (existing.keypair)
        content.push(`keypair = "${existing.keypair}"`);
    if (existing.default_mint)
        content.push(`default_mint = "${existing.default_mint}"`);
    content.push("\n[mints]");
    Object.entries(existing.mints).forEach(([alias, address]) => {
        content.push(`${alias} = "${address}"`);
    });
    fs.writeFileSync(configPath, content.join("\n") + "\n");
    console.log(chalk_1.default.green(`✓ Saved mint ${mintAlias} (${mint.toBase58()}) to config`));
}
function setDefaultMint(aliasOrAddress) {
    const configPath = process.env.SSS_CONFIG || DEFAULT_CONFIG_PATH;
    if (!fs.existsSync(configPath)) {
        console.error(chalk_1.default.red("No config file found."));
        process.exit(1);
    }
    let existing = toml.parse(fs.readFileSync(configPath, "utf-8"));
    // Check if it's an alias
    if (existing.mints && existing.mints[aliasOrAddress]) {
        existing.default_mint = existing.mints[aliasOrAddress];
        console.log(chalk_1.default.green(`✓ Default mint set to ${aliasOrAddress} (${existing.mints[aliasOrAddress]})`));
    }
    else {
        // Try as direct address
        try {
            new web3_js_1.PublicKey(aliasOrAddress);
            existing.default_mint = aliasOrAddress;
            console.log(chalk_1.default.green(`✓ Default mint set to ${aliasOrAddress}`));
        }
        catch {
            console.error(chalk_1.default.red(`No mint found with alias or address: ${aliasOrAddress}`));
            process.exit(1);
        }
    }
    // Write back to file
    const content = [];
    if (existing.rpc_url)
        content.push(`rpc_url = "${existing.rpc_url}"`);
    if (existing.keypair)
        content.push(`keypair = "${existing.keypair}"`);
    content.push(`default_mint = "${existing.default_mint}"`);
    if (existing.mints) {
        content.push("\n[mints]");
        Object.entries(existing.mints).forEach(([alias, address]) => {
            content.push(`${alias} = "${address}"`);
        });
    }
    fs.writeFileSync(configPath, content.join("\n") + "\n");
}
