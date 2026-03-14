import type { Command } from "commander";

import { loadCliConfig, type CliOutputFormat, type LoadedCliConfig } from "./config";

export interface CliContext {
  config: LoadedCliConfig;
  output: CliOutputFormat;
}

function collectOptions(command: Command): Record<string, unknown> {
  const chain: Command[] = [];
  let current: Command | null = command;

  while (current) {
    chain.unshift(current);
    current = current.parent ?? null;
  }

  return chain.reduce<Record<string, unknown>>((acc, next) => ({ ...acc, ...next.opts() }), {});
}

export function resolveCliContext(command: Command): CliContext {
  const loaded = loadCliConfig();
  const options = collectOptions(command);

  const config: LoadedCliConfig = {
    ...loaded,
    rpcUrl: (options.url as string | undefined) ?? loaded.rpcUrl,
    keypairPath: (options.keypair as string | undefined) ?? loaded.keypairPath,
    cluster: (options.cluster as LoadedCliConfig["cluster"] | undefined) ?? loaded.cluster,
    output: (options.output as CliOutputFormat | undefined) ?? loaded.output,
    mintAddress: (options.mint as string | undefined) ?? loaded.mintAddress,
    programId: (options.program as string | undefined) ?? loaded.programId
  };

  return {
    config,
    output: config.output
  };
}

