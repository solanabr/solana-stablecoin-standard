import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getConfig } from "../config";
import { StablecoinSDK } from "../../../sdk/src/index";
import { PublicKey } from "@solana/web3.js";

export function registerConfigCommand(program: Command) {
    program
        .command("config")
        .description("Show current configuration of a stablecoin")
        .requiredOption("-m, --mint <address>", "The Mint Address of the stablecoin")
        .action(async (options) => {
            const spinner = ora("Fetching configuration from blockchain...").start();
            try {
                const config = getConfig();
                const sdk = new StablecoinSDK(
                    config.connection, 
                    config.adminKeypair, 
                    config.programId, 
                    config.hookId
                );

                // Вычисляем PDA конфига
                const mintAddress = new PublicKey(options.mint);
                const [configPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("config")], 
                    sdk.program.programId
                );

                // Читаем данные аккаунта напрямую из Anchor
                const state = await sdk.program.account.stablecoinConfig.fetch(configPda);

                spinner.succeed(chalk.green(`Configuration Loaded`));
                
                console.log(chalk.bold("\n📊 Stablecoin Configuration:"));
                console.log(chalk.gray("-----------------------------------"));
                console.log(`${chalk.cyan("Name:")} ${state.name}`);
                console.log(`${chalk.cyan("Symbol:")} ${state.symbol}`);
                console.log(`${chalk.cyan("Mint Address:")} ${state.mint.toBase58()}`);
                console.log(`${chalk.cyan("Decimals:")} ${state.decimals}`);
                console.log(`${chalk.cyan("Is Paused:")} ${state.isPaused ? chalk.red("Yes") : chalk.green("No")}`);
                
                console.log(chalk.bold("\n🛡 Compliance Modules (SSS-2):"));
                console.log(chalk.gray("-----------------------------------"));
                console.log(`${chalk.cyan("Permanent Delegate:")} ${state.enablePermanentDelegate ? chalk.green("Enabled") : chalk.red("Disabled")}`);
                console.log(`${chalk.cyan("Transfer Hook:")} ${state.enableTransferHook ? chalk.green("Enabled") : chalk.red("Disabled")}`);
                
                console.log(chalk.bold("\n🔑 Authorities:"));
                console.log(chalk.gray("-----------------------------------"));
                console.log(`${chalk.cyan("Master:")} ${state.authority.toBase58()}`);
                console.log(`${chalk.cyan("Minter:")} ${state.minterAuthority.toBase58()}`);
                console.log(`${chalk.cyan("Seizer:")} ${state.seizerAuthority.toBase58()}`);

            } catch (error: any) {
                spinner.fail(chalk.red("Failed to fetch configuration"));
                console.error(chalk.red(error.message));
            }
        });
}