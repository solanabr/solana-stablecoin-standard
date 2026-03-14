import { Command } from "commander";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

import { resolveCliContext } from "../context";
import { renderKeyValueLines, writeStructuredOutput } from "../output";
import {
  getConfigAddress,
  getOracleConfigAddress,
} from "../../pda";
import { loadProgram, getProgramId, IDL_NOT_FOUND_MSG } from "../program";

export function registerOracleCommands(program: Command): void {
  program
    .command("configure-oracle")
    .description("Configure oracle price feed (authority only)")
    .requiredOption("--price-feed <address>", "Oracle price feed account address")
    .requiredOption("--max-deviation <bps>", "Max deviation from $1 in basis points (e.g. 100 = 1%)")
    .requiredOption("--max-staleness <seconds>", "Max staleness in seconds")
    .option("--disable", "Disable oracle validation")
    .action(async function (this: Command, options: {
      priceFeed: string;
      maxDeviation: string;
      maxStaleness: string;
      disable?: boolean;
    }) {
      const context = resolveCliContext(this);
      const loaded = loadProgram(context.config);

      if (!loaded) {
        writeStructuredOutput(context, { error: IDL_NOT_FOUND_MSG }, IDL_NOT_FOUND_MSG);
        process.exitCode = 1;
        return;
      }

      if (!context.config.mintAddress) {
        const msg = "No mint address set. Use: sss-token config set mintAddress <address>";
        writeStructuredOutput(context, { error: msg }, msg);
        process.exitCode = 1;
        return;
      }

      try {
        const { program: anchorProgram, provider } = loaded;
        const authority = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);
        const [oracleConfig] = getOracleConfigAddress(programId, configPda);

        const input = {
          priceFeed: new PublicKey(options.priceFeed),
          maxDeviationBps: Number(options.maxDeviation),
          maxStalenessSecs: new BN(options.maxStaleness),
          enabled: !options.disable,
        };

        const tx = await anchorProgram.methods
          .configureOracle(input)
          .accountsPartial({
            authority,
            config: configPda,
            oracleConfig,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const payload = {
          command: "configure-oracle",
          txSignature: tx,
          priceFeed: options.priceFeed,
          maxDeviationBps: input.maxDeviationBps,
          maxStalenessSecs: options.maxStaleness,
          enabled: input.enabled,
        };
        const text = [
          "Oracle configured",
          renderKeyValueLines([
            ["tx", tx],
            ["priceFeed", options.priceFeed],
            ["maxDeviationBps", input.maxDeviationBps],
            ["maxStalenessSecs", options.maxStaleness],
            ["enabled", input.enabled],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Configure oracle failed: ${msg}`);
        process.exitCode = 1;
      }
    });
}
