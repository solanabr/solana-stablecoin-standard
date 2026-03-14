import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as fs from "fs";
import * as toml from "toml";
import { Preset, SolanaStablecoin } from "solana-stablecoin-sdk";
import { saveMintToConfig } from "../config";
import { getCliConfig, getStablecoinContext } from "../lib/context";
import { failSpinner } from "../lib/output";

export function registerInitCommands(program: Command): void {
  program
    .command("init")
    .description("Initialize a new stablecoin")
    .option("--preset <preset>", "Preset: sss-1 | sss-2", "sss-1")
    .option("--custom <path>", "Path to TOML/JSON config file (overrides preset)")
    .option("--name <name>", "Token name", "My Stablecoin")
    .option("--symbol <symbol>", "Token symbol", "MYUSD")
    .option("--uri <uri>", "Metadata URI", "")
    .option("--decimals <decimals>", "Decimal places", "6")
    .option("--alias <alias>", "Alias for this token (for easy reference)")
    .action(async (opts, cmd) => {
      const config = getCliConfig(cmd);

      let createOpts: Parameters<typeof SolanaStablecoin.create>[0];
      if (opts.custom) {
        const raw = fs.readFileSync(opts.custom, "utf-8");
        const fileConf = opts.custom.endsWith(".toml") ? toml.parse(raw) : JSON.parse(raw);
        createOpts = {
          connection: config.connection,
          authority: config.keypair,
          name: fileConf.name,
          symbol: fileConf.symbol,
          uri: fileConf.uri ?? "",
          decimals: fileConf.decimals ?? 6,
          extensions: {
            permanentDelegate: fileConf.permanent_delegate ?? false,
            transferHook: fileConf.transfer_hook ?? false,
            defaultAccountFrozen: fileConf.default_account_frozen ?? false,
          },
        };
      } else {
        createOpts = {
          connection: config.connection,
          authority: config.keypair,
          preset: opts.preset === "sss-2" ? Preset.SSS_2 : Preset.SSS_1,
          name: opts.name,
          symbol: opts.symbol,
          uri: opts.uri,
          decimals: parseInt(opts.decimals, 10),
        };
      }

      const spinner = ora(`Initializing ${createOpts.name} (${opts.preset ?? "custom"})...`).start();
      try {
        const stable = await SolanaStablecoin.create(createOpts);
        const alias = opts.alias || `token${config.mints.size + 1}`;
        saveMintToConfig(stable.mint, alias);
        spinner.succeed(
          chalk.green("✓ Stablecoin initialized!\n") +
            `  Alias:   ${chalk.cyan(alias)}\n` +
            `  Mint:    ${chalk.cyan(stable.mint.toBase58())}\n` +
            `  State:   ${chalk.cyan(stable.statePDA.toBase58())}\n` +
            `  Cluster: ${chalk.yellow(config.cluster)}`,
        );
      } catch (error) {
        failSpinner(spinner, error);
      }
    });

  program
    .command("init-hook")
    .description(
      "Initialize the transfer-hook extra-account-metas PDA for an existing SSS-2 mint. Run this once per mint if transfers are failing with AccountNotFound.",
    )
    .action(async (_opts, cmd) => {
      const { mint, stable } = await getStablecoinContext(cmd);
      const spinner = ora(`Initializing transfer-hook accounts for ${mint.toBase58().slice(0, 8)}...`).start();
      try {
        const sig = await stable.initializeTransferHook();
        spinner.succeed(chalk.green("✓ Transfer-hook initialized\n") + `  Tx: ${chalk.cyan(sig)}`);
      } catch (error) {
        failSpinner(spinner, error);
      }
    });
}
