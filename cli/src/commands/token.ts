import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { PublicKey } from "@solana/web3.js";
import { getStablecoinContext } from "../lib/context";
import { failSpinner } from "../lib/output";

export function registerTokenCommands(program: Command): void {
  program
    .command("mint <recipient> <amount>")
    .description("Mint tokens to a recipient")
    .action(async (recipient, amount, _opts, cmd) => {
      const { config, stable } = await getStablecoinContext(cmd);
      const spinner = ora(`Minting ${amount} tokens to ${recipient}...`).start();
      try {
        const sig = await stable.mintTokens({
          recipient: new PublicKey(recipient),
          amount: BigInt(amount),
          minter: config.keypair,
        });
        spinner.succeed(chalk.green(`✓ Minted ${amount} tokens\n`) + `  Tx: ${chalk.cyan(sig)}`);
      } catch (error) {
        failSpinner(spinner, error);
      }
    });

  program
    .command("burn <amount>")
    .description("Burn tokens from an account")
    .option("-f, --from <address>", "Source wallet address (defaults to your keypair)")
    .action(async (amount, opts, cmd) => {
      const { config, stable } = await getStablecoinContext(cmd);
      let sourceAddress: PublicKey;
      if (opts.from) {
        try {
          sourceAddress = new PublicKey(opts.from);
        } catch {
          console.error(chalk.red(`Invalid source address: ${opts.from}`));
          process.exit(1);
        }
      } else {
        sourceAddress = config.keypair.publicKey;
      }

      const spinner = ora(`Burning ${amount} tokens from ${sourceAddress.toBase58().slice(0, 8)}...`).start();
      try {
        const sig = await stable.burn(sourceAddress, BigInt(amount));
        spinner.succeed(
          chalk.green(`✓ Burned ${amount} tokens from ${chalk.cyan(sourceAddress.toBase58())}\n`) +
            `  Tx: ${chalk.cyan(sig)}`,
        );
      } catch (error) {
        failSpinner(spinner, error);
      }
    });

  program
    .command("transfer <recipient> <amount>")
    .description(
      "Transfer tokens to a recipient. Handles SSS-2 transfer-hook resolution correctly (creates ATA first, then transfers). Use this instead of 'spl-token transfer --fund-recipient' for SSS-2 mints.",
    )
    .action(async (recipient, amount, _opts, cmd) => {
      const { config, stable } = await getStablecoinContext(cmd);
      const spinner = ora(`Transferring ${amount} tokens to ${recipient}...`).start();
      try {
        const sig = await stable.transfer({
          from: config.keypair,
          to: new PublicKey(recipient),
          amount: BigInt(amount),
        });
        spinner.succeed(
          chalk.green(`✓ Transferred ${amount} tokens\n`) +
            `  To:  ${chalk.cyan(recipient)}\n` +
            `  Tx:  ${chalk.cyan(sig)}`,
        );
      } catch (error) {
        failSpinner(spinner, error);
      }
    });

  for (const [name, label, method] of [
    ["freeze", "Freezing", "freeze"],
    ["thaw", "Thawing", "thaw"],
  ] as const) {
    program
      .command(`${name} <address>`)
      .description(name === "freeze" ? "Freeze a token account" : "Thaw a frozen token account")
      .action(async (address, _opts, cmd) => {
        const { stable } = await getStablecoinContext(cmd);
        const spinner = ora(`${label} ${address}...`).start();
        try {
          const sig = await stable[method](new PublicKey(address));
          spinner.succeed(
            chalk.green(name === "freeze" ? "✓ Account frozen\n" : "✓ Account thawed\n") +
              `  Tx: ${chalk.cyan(sig)}`,
          );
        } catch (error) {
          failSpinner(spinner, error);
        }
      });
  }

  program
    .command("pause")
    .description("Pause the protocol (halts minting and burning)")
    .action(async (_opts, cmd) => {
      const { stable } = await getStablecoinContext(cmd);
      const spinner = ora("Pausing protocol...").start();
      try {
        const sig = await stable.pause();
        spinner.succeed(chalk.yellow("⏸ Protocol paused\n") + `  Tx: ${chalk.cyan(sig)}`);
      } catch (error) {
        failSpinner(spinner, error);
      }
    });

  program
    .command("unpause")
    .description("Unpause the protocol")
    .action(async (_opts, cmd) => {
      const { stable } = await getStablecoinContext(cmd);
      const spinner = ora("Unpausing protocol...").start();
      try {
        const sig = await stable.unpause();
        spinner.succeed(chalk.green("▶ Protocol unpaused\n") + `  Tx: ${chalk.cyan(sig)}`);
      } catch (error) {
        failSpinner(spinner, error);
      }
    });
}
