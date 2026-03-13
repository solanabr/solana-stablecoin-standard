import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getConfig } from "../config";
import { StablecoinSDK } from "../../../sdk/src/index";
import { PublicKey } from "@solana/web3.js";

export function registerSeizeCommand(program: Command) {
    program
        .command("seize <from_frozen_address>")
        .description("Forcefully transfer tokens from a frozen/blacklisted account (SSS-2)")
        .requiredOption("-m, --mint <address>", "The Mint Address of the stablecoin")
        .requiredOption("-t, --to <address>", "The treasury wallet address to receive the seized tokens")
        .requiredOption("-a, --amount <number>", "Amount of tokens to seize")
        .action(async (from_frozen_address, options) => {
            const spinner = ora("Initializing seize process...").start();
            try {
                const config = getConfig();
                const sdk = new StablecoinSDK(
                    config.connection, 
                    config.adminKeypair, 
                    config.programId, 
                    config.hookId
                );

                const mintAddress = new PublicKey(options.mint);
                const fromAddress = new PublicKey(from_frozen_address);
                const treasuryAddress = new PublicKey(options.to);
                const amount = parseFloat(options.amount);

                // --- ПРОВЕРКА ОШИБОК: Защита от SSS-1 ---
                const [configPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("config")], 
                    sdk.program.programId
                );
                const state = await sdk.program.account.stablecoinConfig.fetch(configPda);
                
                if (!state.enablePermanentDelegate) {
                    spinner.stop();
                    console.log(chalk.red("\n[Error] Permanent Delegate module is not enabled for this token. (SSS-1 detected)"));
                    return;
                }
                // ----------------------------------------

                spinner.text = `Seizing ${amount} tokens from ${fromAddress.toBase58()}...`;
                
                await sdk.compliance.seize(mintAddress, fromAddress, treasuryAddress, amount);

                spinner.succeed(chalk.green(`Tokens successfully seized!`));
                console.log(chalk.cyan(`From:`), fromAddress.toBase58());
                console.log(chalk.cyan(`Treasury:`), treasuryAddress.toBase58());
                console.log(chalk.cyan(`Amount:`), amount.toString());
                
            } catch (error: any) {
                spinner.fail(chalk.red("Failed to seize tokens"));
                console.error(chalk.red(error.message));
            }
        });
}