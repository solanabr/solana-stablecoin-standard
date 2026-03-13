"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCreateCommand = registerCreateCommand;
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const config_1 = require("../config");
// Импортируем наш SDK из соседней папки!
const index_1 = require("../../../sdk/src/index");
const web3_js_1 = require("@solana/web3.js");
function registerCreateCommand(program) {
    program
        .command("init")
        .description("Initialize a new stablecoin")
        .requiredOption("--name <string>", "Token Name (e.g. US Dollar)")
        .requiredOption("--symbol <string>", "Token Symbol (e.g. USD)")
        .option("--preset <string>", "Preset standard: sss-1 or sss-2", "sss-1")
        .option("--decimals <number>", "Number of decimals", "6")
        .action(async (options) => {
        const spinner = (0, ora_1.default)("Loading configuration...").start();
        try {
            const config = (0, config_1.getConfig)();
            const sdk = new index_1.StablecoinSDK(config.connection, config.adminKeypair, config.programId, config.hookId);
            const preset = options.preset === "sss-2" ? index_1.Presets.SSS_2 : index_1.Presets.SSS_1;
            spinner.text = `Creating ${options.name} (${options.symbol}) using preset ${options.preset.toUpperCase()}...`;
            const mintAddress = await sdk.create(options.name, options.symbol, "https://example.com/logo.png", parseInt(options.decimals), preset, options.preset === "sss-2" ? new web3_js_1.PublicKey(config.hookId) : undefined);
            spinner.succeed(chalk_1.default.green(`Stablecoin Created Successfully!`));
            console.log(chalk_1.default.cyan(`Mint Address:`), chalk_1.default.bold(mintAddress.toBase58()));
            console.log(chalk_1.default.gray(`Owner:`), config.adminKeypair.publicKey.toBase58());
        }
        catch (error) {
            spinner.fail(chalk_1.default.red("Failed to create stablecoin"));
            console.error(chalk_1.default.red(error.message));
        }
    });
}
//# sourceMappingURL=create.js.map