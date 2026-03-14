import type { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "solana-stablecoin-sdk";
import { CliConfig, loadConfig, requireMint } from "../config";

export interface GlobalCliOptions {
  keypair?: string;
  url?: string;
  mint?: string;
}

function getRootCommand(cmd: Command): Command {
  let current = cmd;
  while (current.parent) {
    current = current.parent;
  }
  return current;
}

export function getGlobalOptions(cmd: Command): GlobalCliOptions {
  return (getRootCommand(cmd).opts?.() ?? {}) as GlobalCliOptions;
}

export function getCliConfig(cmd: Command): CliConfig {
  const globalOpts = getGlobalOptions(cmd);
  return loadConfig({
    keypair: globalOpts.keypair,
    url: globalOpts.url,
    mint: globalOpts.mint,
  });
}

export function getMintContext(cmd: Command, mintArg?: string): { config: CliConfig; mint: PublicKey } {
  const config = getCliConfig(cmd);
  const mint = requireMint(config, mintArg);
  return { config, mint };
}

export async function getStablecoinContext(cmd: Command, mintArg?: string): Promise<{
  config: CliConfig;
  mint: PublicKey;
  stable: SolanaStablecoin;
}> {
  const { config, mint } = getMintContext(cmd, mintArg);
  const stable = await SolanaStablecoin.load(config.connection, mint, config.keypair);
  return { config, mint, stable };
}
