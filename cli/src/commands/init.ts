import { Presets, SolanaStablecoin } from "@solana-stablecoin/sdk";
import { getProvider } from "./utils";
import fs from "fs";
import path from "path";

export async function initCommand(opts: any) {
  const parent = opts.parent || opts._parent || {};
  const cluster = parent.cluster || opts.cluster || "http://localhost:8899";
  const keypair = parent.keypair || opts.keypair || "~/.config/solana/id.json";

  console.log(`\n🪙  Initializing stablecoin...`);
  console.log(`   Cluster: ${cluster}`);
  console.log(`   Preset:  ${opts.preset}`);
  console.log(`   Name:    ${opts.name}`);
  console.log(`   Symbol:  ${opts.symbol}`);
  console.log(`   Decimals: ${opts.decimals}`);
  console.log(`   Default frozen: ${opts.defaultFrozen ? "yes" : "no"}`);

  let preset: Presets;
  let customFeatures = undefined;

  switch (opts.preset.toLowerCase()) {
    case "sss-1": case "sss1":
      preset = Presets.SSS_1;
      break;
    case "sss-2": case "sss2":
      preset = Presets.SSS_2;
      break;
    case "custom":
      preset = Presets.Custom;
      if (!opts.config) {
        console.error("❌ --config <path> is required for custom preset (JSON or TOML)");
        process.exit(1);
      }
      const configPath = opts.config.replace("~", process.env.HOME || "");
      if (!fs.existsSync(configPath)) {
        console.error(`❌ Config file not found: ${configPath}`);
        process.exit(1);
      }
      const raw = fs.readFileSync(configPath, "utf8");
      const ext = path.extname(configPath).toLowerCase();
      try {
        let parsed: any;
        if (ext === ".toml") {
          const toml = require("toml");
          parsed = toml.parse(raw);
        } else {
          parsed = JSON.parse(raw);
        }
        customFeatures = {
          freezeAuthority: parsed.freeze_authority ?? true,
          permanentDelegate: parsed.permanent_delegate ?? false,
          transferHook: parsed.transfer_hook ?? false,
          confidentialTransfers: parsed.confidential_transfers ?? false,
        };
        console.log(`   Custom config loaded from: ${configPath}`);
        console.log(`   Features: ${JSON.stringify(customFeatures)}`);
      } catch (e) {
        console.error(`❌ Failed to parse config file (${ext || "json"}): ${e}`);
        process.exit(1);
      }
      break;
    default:
      console.error(`❌ Invalid preset: ${opts.preset}. Use sss-1, sss-2, or custom`);
      process.exit(1);
  }

  try {
    const provider = await getProvider(cluster, keypair);

    const stablecoin = await SolanaStablecoin.create(provider, {
      preset,
      name: opts.name,
      symbol: opts.symbol,
      uri: opts.uri || "",
      decimals: parseInt(opts.decimals),
      defaultAccountFrozen: !!opts.defaultFrozen,
      customFeatures,
    });

    console.log(`\n✅ Stablecoin initialized!`);
    console.log(`   Mint:   ${stablecoin.mint.toBase58()}`);
    console.log(`   Config: ${stablecoin.configPDA.toBase58()}`);
    console.log(`   Preset: ${preset}`);
    console.log(`\n   Save the mint address above — you'll need it for all other commands.`);
  } catch (err: any) {
    console.error(`\n❌ Initialization failed: ${err.message}`);
    if (opts.verbose || parent.verbose) console.error(err);
    process.exit(1);
  }
}
