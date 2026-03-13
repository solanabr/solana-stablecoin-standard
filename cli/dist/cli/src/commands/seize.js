"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSeizeCommand = registerSeizeCommand;
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const config_1 = require("../config");
const index_1 = require("../../../sdk/src/index");
const web3_js_1 = require("@solana/web3.js");
function registerSeizeCommand(program) {
    program
        .command("seize <from_frozen_address>")
        .description("Forcefully transfer tokens from a frozen/blacklisted account (SSS-2)")
        .requiredOption("-m, --mint <address>", "The Mint Address of the stablecoin")
        .requiredOption("-t, --to <address>", "The treasury wallet address to receive the seized tokens")
        .requiredOption("-a, --amount <number>", "Amount of tokens to seize")
        .action(async (from_frozen_address, options) => {
        const spinner = (0, ora_1.default)("Initializing seize process...").start();
        try {
            const config = (0, config_1.getConfig)();
            const sdk = new index_1.StablecoinSDK(config.connection, config.adminKeypair, config.programId, config.hookId);
            const mintAddress = new web3_js_1.PublicKey(options.mint);
            const fromAddress = new web3_js_1.PublicKey(from_frozen_address);
            const treasuryAddress = new web3_js_1.PublicKey(options.to);
            const amount = parseFloat(options.amount);
            // --- ПРОВЕРКА ОШИБОК: Защита от SSS-1 ---
            const [configPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("config")], sdk.program.programId);
            const state = await sdk.program.account.stablecoinConfig.fetch(configPda);
            if (!state.enablePermanentDelegate) {
                spinner.stop();
                console.log(chalk_1.default.red("\n[Error] Permanent Delegate module is not enabled for this token. (SSS-1 detected)"));
                return;
            }
            // ----------------------------------------
            spinner.text = `Seizing ${amount} tokens from ${fromAddress.toBase58()}...`;
            await sdk.compliance.seize(mintAddress, fromAddress, treasuryAddress, amount);
            spinner.succeed(chalk_1.default.green(`Tokens successfully seized!`));
            console.log(chalk_1.default.cyan(`From:`), fromAddress.toBase58());
            console.log(chalk_1.default.cyan(`Treasury:`), treasuryAddress.toBase58());
            console.log(chalk_1.default.cyan(`Amount:`), amount.toString());
        }
        catch (error) {
            spinner.fail(chalk_1.default.red("Failed to seize tokens"));
            console.error(chalk_1.default.red(error.message));
        }
    });
}
//# sourceMappingURL=seize.js.map