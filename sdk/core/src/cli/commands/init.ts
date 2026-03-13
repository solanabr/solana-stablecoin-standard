import { Command } from "commander";
import { SolanaStablecoin } from "../../stablecoin";
import { Preset } from "../../types";
import { loadConfig, loadKeypair, getConnection, getProgramId, saveConfig } from "../config";
import { success, error, info, table, header } from "../output";

export const initCommand = new Command("init")
  .description("Initialize a new stablecoin")
  .option("--preset <preset>", "Use preset: sss-1 or sss-2")
  .option("--custom <path>", "Custom config file (TOML/JSON)")
  .option("--name <name>", "Token name")
  .option("--symbol <symbol>", "Token symbol")
  .option("--decimals <decimals>", "Token decimals", "6")
  .option("--uri <uri>", "Metadata URI", "")
  .option("--keypair <path>", "Path to authority keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (opts) => {
    try {
      const config = loadConfig();
      const rpcUrl = opts.rpc || config.rpcUrl;
      const keypairPath = opts.keypair || config.keypairPath;
      const connection = getConnection({ ...config, rpcUrl });
      const authority = loadKeypair(keypairPath);
      const programId = getProgramId(config);

      let preset: Preset | undefined;
      if (opts.preset === "sss-1") preset = Preset.SSS_1;
      else if (opts.preset === "sss-2") preset = Preset.SSS_2;

      if (!opts.name || !opts.symbol) {
        error("--name and --symbol are required");
        process.exit(1);
      }

      info(`Initializing stablecoin with ${preset ? `preset ${opts.preset}` : "custom config"}...`);

      const stable = await SolanaStablecoin.create(
        connection,
        {
          preset,
          name: opts.name,
          symbol: opts.symbol,
          decimals: parseInt(opts.decimals),
          uri: opts.uri,
          authority,
        },
        programId
      );

      // Save mint to config for future commands
      saveConfig({ ...config, rpcUrl, mint: stable.mint.toBase58() });

      header("Stablecoin Created");
      table({
        "Mint": stable.mint.toBase58(),
        "Config PDA": stable.configAddress.toBase58(),
        "Name": opts.name,
        "Symbol": opts.symbol,
        "Decimals": opts.decimals,
        "Preset": preset || "custom",
      });

      success("Stablecoin initialized successfully!");
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });
