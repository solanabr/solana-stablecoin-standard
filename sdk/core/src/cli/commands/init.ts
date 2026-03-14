import * as fs from "node:fs";
import * as path from "node:path";

import { Command } from "commander";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

import { buildPresetConfig, parsePreset } from "../../presets";
import { Presets } from "../../types";
import { getConfigAddress } from "../../pda";
import { resolveCliContext } from "../context";
import { renderKeyValueLines, writeStructuredOutput } from "../output";
import { loadProgram, getProgramId, IDL_NOT_FOUND_MSG } from "../program";
import { setCliConfigValue } from "../config";
import { collectExtensionOverrides } from "./shared";

const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389",
);

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new stablecoin on-chain")
    .option("--preset <preset>", "Preset to use (sss-1, sss-2)", Presets.SSS_1)
    .option("--name <name>", "Token display name", "My Stablecoin")
    .option("--symbol <symbol>", "Token ticker", "MYST")
    .option("--uri <uri>", "Metadata URI", "")
    .option("--decimals <decimals>", "Decimals", "6")
    .option("--permanent-delegate", "Enable permanent delegate")
    .option("--transfer-hook", "Enable transfer hook")
    .option("--default-account-frozen", "Freeze new token accounts by default")
    .option("--confidential-transfers", "Enable confidential transfer support")
    .option("--dry-run", "Only generate config, do not deploy")
    .option("--write <path>", "Write the generated config JSON to disk")
    .action(async (options, command) => {
      const context = resolveCliContext(command);
      const preset = parsePreset(options.preset as string);
      const config = buildPresetConfig({
        preset,
        name: options.name,
        symbol: options.symbol,
        uri: options.uri,
        decimals: Number(options.decimals),
        extensions: collectExtensionOverrides(options as Record<string, unknown>),
      });

      if (options.write) {
        const filePath = path.resolve(options.write as string);
        fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
      }

      // Dry-run: just show the config
      if (options.dryRun) {
        const payload = {
          command: "init",
          dryRun: true,
          preset,
          config,
          wroteFile: options.write ? path.resolve(options.write as string) : null,
        };
        const text = [
          "Stablecoin init plan (dry-run)",
          renderKeyValueLines([
            ["preset", preset],
            ["name", config.name],
            ["symbol", config.symbol],
            ["decimals", config.decimals],
            ["permanentDelegate", config.extensions.permanentDelegate],
            ["transferHook", config.extensions.transferHook],
            ["defaultAccountFrozen", config.extensions.defaultAccountFrozen],
            ["confidentialTransfers", config.extensions.confidentialTransfers],
          ]),
          options.write ? `\nWrote config: ${path.resolve(options.write as string)}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        writeStructuredOutput(context, payload, text);
        return;
      }

      // Live deploy
      const loaded = loadProgram(context.config);
      if (!loaded) {
        writeStructuredOutput(context, { error: IDL_NOT_FOUND_MSG }, IDL_NOT_FOUND_MSG);
        process.exitCode = 1;
        return;
      }

      try {
        const { program: anchorProgram, provider } = loaded;
        const authority = provider.publicKey;
        const programId = getProgramId(context.config);
        const mintKeypair = Keypair.generate();
        const mintKey = mintKeypair.publicKey;
        const [configPda] = getConfigAddress(programId, mintKey);

        const complianceEnabled =
          config.extensions.permanentDelegate && config.extensions.transferHook;

        const input = {
          name: config.name,
          symbol: config.symbol,
          uri: config.uri ?? "",
          decimals: config.decimals,
          complianceEnabled,
          enableAllowlist: false,
          supplyCap: null as null,
        };

        const tx = await anchorProgram.methods
          .initialize(input)
          .accountsPartial({
            authority,
            mint: mintKey,
            config: configPda,
            transferHookProgram: complianceEnabled ? SSS_TRANSFER_HOOK_PROGRAM_ID : null,
            systemProgram: SystemProgram.programId,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([mintKeypair])
          .rpc();

        // Auto-save mint address to config
        setCliConfigValue("mintAddress", mintKey.toBase58());

        const payload = {
          command: "init",
          txSignature: tx,
          preset,
          mint: mintKey.toBase58(),
          config: configPda.toBase58(),
          complianceEnabled,
        };
        const text = [
          "Stablecoin initialized on-chain",
          renderKeyValueLines([
            ["tx", tx],
            ["preset", preset],
            ["mint", mintKey.toBase58()],
            ["config", configPda.toBase58()],
            ["complianceEnabled", complianceEnabled],
            ["name", config.name],
            ["symbol", config.symbol],
          ]),
          "",
          `Mint address saved to config. Run \`sss-token status\` to verify.`,
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Init failed: ${msg}`);
        process.exitCode = 1;
      }
    });
}
