"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConfigCommand = registerConfigCommand;
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const config_1 = require("../config");
const index_1 = require("../../../sdk/src/index");
const web3_js_1 = require("@solana/web3.js");
function registerConfigCommand(program) {
    program
        .command("config")
        .description("Show current configuration of a stablecoin")
        .requiredOption("-m, --mint <address>", "The Mint Address of the stablecoin")
        .action(async (options) => {
        const spinner = (0, ora_1.default)("Fetching configuration from blockchain...").start();
        try {
            const config = (0, config_1.getConfig)();
            const sdk = new index_1.StablecoinSDK(config.connection, config.adminKeypair, config.programId, config.hookId);
            // Вычисляем PDA конфига
            const mintAddress = new web3_js_1.PublicKey(options.mint);
            const [configPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("config")], sdk.program.programId);
            // Читаем данные аккаунта напрямую из Anchor
            const state = await sdk.program.account.stablecoinConfig.fetch(configPda);
            spinner.succeed(chalk_1.default.green(`Configuration Loaded`));
            console.log(chalk_1.default.bold("\n📊 Stablecoin Configuration:"));
            console.log(chalk_1.default.gray("-----------------------------------"));
            console.log(`${chalk_1.default.cyan("Name:")} ${state.name}`);
            console.log(`${chalk_1.default.cyan("Symbol:")} ${state.symbol}`);
            console.log(`${chalk_1.default.cyan("Mint Address:")} ${state.mint.toBase58()}`);
            console.log(`${chalk_1.default.cyan("Decimals:")} ${state.decimals}`);
            console.log(`${chalk_1.default.cyan("Is Paused:")} ${state.isPaused ? chalk_1.default.red("Yes") : chalk_1.default.green("No")}`);
            console.log(chalk_1.default.bold("\n🛡 Compliance Modules (SSS-2):"));
            console.log(chalk_1.default.gray("-----------------------------------"));
            console.log(`${chalk_1.default.cyan("Permanent Delegate:")} ${state.enablePermanentDelegate ? chalk_1.default.green("Enabled") : chalk_1.default.red("Disabled")}`);
            console.log(`${chalk_1.default.cyan("Transfer Hook:")} ${state.enableTransferHook ? chalk_1.default.green("Enabled") : chalk_1.default.red("Disabled")}`);
            console.log(chalk_1.default.bold("\n🔑 Authorities:"));
            console.log(chalk_1.default.gray("-----------------------------------"));
            console.log(`${chalk_1.default.cyan("Master:")} ${state.authority.toBase58()}`);
            console.log(`${chalk_1.default.cyan("Minter:")} ${state.minterAuthority.toBase58()}`);
            console.log(`${chalk_1.default.cyan("Seizer:")} ${state.seizerAuthority.toBase58()}`);
        }
        catch (error) {
            spinner.fail(chalk_1.default.red("Failed to fetch configuration"));
            console.error(chalk_1.default.red(error.message));
        }
    });
}
//# sourceMappingURL=config.js.map