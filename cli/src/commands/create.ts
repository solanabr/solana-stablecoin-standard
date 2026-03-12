import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getConfig } from "../config";
// Импортируем наш SDK из соседней папки!
import { StablecoinSDK, Presets } from "../../../sdk/src/index";
import { PublicKey } from "@solana/web3.js";

export function registerCreateCommand(program: Command) {
    program
        .command("init")
        .description("Initialize a new stablecoin")
        .requiredOption("--name <string>", "Token Name (e.g. US Dollar)")
        .requiredOption("--symbol <string>", "Token Symbol (e.g. USD)")
        .option("--preset <string>", "Preset standard: sss-1 or sss-2", "sss-1")
        .option("--decimals <number>", "Number of decimals", "6")
        .action(async (options) => {
            const spinner = ora("Loading configuration...").start();
            try {
                const config = getConfig();
                const sdk = new StablecoinSDK(
                    config.connection, 
                    config.adminKeypair, 
                    config.programId, 
                    config.hookId
                );

                const preset = options.preset === "sss-2" ? Presets.SSS_2 : Presets.SSS_1;
                
                spinner.text = `Creating ${options.name} (${options.symbol}) using preset ${options.preset.toUpperCase()}...`;
                
                const mintAddress = await sdk.create(
                    options.name,
                    options.symbol,
                    "https://example.com/logo.png",
                    parseInt(options.decimals),
                    preset,
                    options.preset === "sss-2" ? new PublicKey(config.hookId) : undefined
                );

                spinner.succeed(chalk.green(`Stablecoin Created Successfully!`));
                console.log(chalk.cyan(`Mint Address:`), chalk.bold(mintAddress.toBase58()));
                console.log(chalk.gray(`Owner:`), config.adminKeypair.publicKey.toBase58());
                
            } catch (error: any) {
                spinner.fail(chalk.red("Failed to create stablecoin"));
                console.error(chalk.red(error.message));
            }
        });
}