"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMintCommand = registerMintCommand;
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const config_1 = require("../config");
const index_1 = require("../../../sdk/src/index");
const web3_js_1 = require("@solana/web3.js");
function registerMintCommand(program) {
    program
        .command("mint")
        .description("Mint tokens to a specific address")
        .requiredOption("-m, --mint <address>", "The Mint Address of the stablecoin")
        .requiredOption("-t, --to <address>", "The recipient wallet address")
        .requiredOption("-a, --amount <number>", "Amount of tokens to mint")
        .action(async (options) => {
        const spinner = (0, ora_1.default)("Initializing mint process...").start();
        try {
            const config = (0, config_1.getConfig)();
            const sdk = new index_1.StablecoinSDK(config.connection, config.adminKeypair, config.programId, config.hookId);
            const mintAddress = new web3_js_1.PublicKey(options.mint);
            const toAddress = new web3_js_1.PublicKey(options.to);
            const amount = parseFloat(options.amount);
            spinner.text = `Minting ${amount} tokens to ${options.to}...`;
            await sdk.mint(mintAddress, toAddress, amount);
            spinner.succeed(chalk_1.default.green(`Tokens minted successfully!`));
            console.log(chalk_1.default.cyan(`Recipient:`), toAddress.toBase58());
            console.log(chalk_1.default.cyan(`Amount:`), amount.toString());
        }
        catch (error) {
            spinner.fail(chalk_1.default.red("Failed to mint tokens"));
            console.error(chalk_1.default.red(error.message));
        }
    });
}
//# sourceMappingURL=mint.js.map