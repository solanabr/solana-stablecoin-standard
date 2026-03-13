"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBurnCommand = registerBurnCommand;
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const config_1 = require("../config");
const index_1 = require("../../../sdk/src/index");
const web3_js_1 = require("@solana/web3.js");
function registerBurnCommand(program) {
    program
        .command("burn")
        .description("Burn tokens from an address")
        .requiredOption("-m, --mint <address>", "The Mint Address of the stablecoin")
        .requiredOption("-f, --from <address>", "The wallet address to burn from")
        .requiredOption("-a, --amount <number>", "Amount of tokens to burn")
        .action(async (options) => {
        const spinner = (0, ora_1.default)("Initializing burn process...").start();
        try {
            const config = (0, config_1.getConfig)();
            const sdk = new index_1.StablecoinSDK(config.connection, config.adminKeypair, config.programId, config.hookId);
            const mintAddress = new web3_js_1.PublicKey(options.mint);
            const fromAddress = new web3_js_1.PublicKey(options.from);
            const amount = parseFloat(options.amount);
            spinner.text = `Burning ${amount} tokens from ${options.from}...`;
            await sdk.burn(mintAddress, fromAddress, amount);
            spinner.succeed(chalk_1.default.green(`Tokens burned successfully!`));
        }
        catch (error) {
            spinner.fail(chalk_1.default.red("Failed to burn tokens"));
            console.error(chalk_1.default.red(error.message));
        }
    });
}
//# sourceMappingURL=burn.js.map