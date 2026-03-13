import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getConfig } from "../config";
import { StablecoinSDK } from "../../../sdk/src/index";
import { PublicKey } from "@solana/web3.js";

export function registerBurnCommand(program: Command) {
    program
        .command("burn")
        .description("Burn tokens from an address")
        .requiredOption("-m, --mint <address>", "The Mint Address of the stablecoin")
        .requiredOption("-f, --from <address>", "The wallet address to burn from")
        .requiredOption("-a, --amount <number>", "Amount of tokens to burn")
        .action(async (options) => {
            const spinner = ora("Initializing burn process...").start();
            try {
                const config = getConfig();
                const sdk = new StablecoinSDK(
                    config.connection, 
                    config.adminKeypair, 
                    config.programId, 
                    config.hookId
                );

                const mintAddress = new PublicKey(options.mint);
                const fromAddress = new PublicKey(options.from);
                const amount = parseFloat(options.amount);

                spinner.text = `Burning ${amount} tokens from ${options.from}...`;
                
                await sdk.burn(mintAddress, fromAddress, amount);

                spinner.succeed(chalk.green(`Tokens burned successfully!`));
                
            } catch (error: any) {
                spinner.fail(chalk.red("Failed to burn tokens"));
                console.error(chalk.red(error.message));
            }
        });
}