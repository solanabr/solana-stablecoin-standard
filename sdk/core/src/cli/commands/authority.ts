import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

import { resolveCliContext } from "../context";
import { renderKeyValueLines, writeStructuredOutput } from "../output";
import { getConfigAddress } from "../../pda";
import { loadProgram, getProgramId, IDL_NOT_FOUND_MSG } from "../program";

export function registerAuthorityCommands(program: Command): void {
  const authority = program
    .command("authority")
    .description("Two-step authority transfer management");

  authority
    .command("propose <new-authority>")
    .description("Propose a new authority (step 1 of 2)")
    .action(async function (this: Command, newAuthority: string) {
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
        const currentAuthority = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);
        const newAuth = new PublicKey(newAuthority);

        const tx = await anchorProgram.methods
          .proposeAuthority(newAuth)
          .accountsPartial({
            authority: currentAuthority,
            config: configPda,
          })
          .rpc();

        const payload = { command: "authority propose", txSignature: tx, newAuthority };
        const text = [
          "Authority transfer proposed",
          renderKeyValueLines([
            ["tx", tx],
            ["newAuthority", newAuthority],
          ]),
          "",
          "The new authority must call `sss-token authority accept` to complete the transfer.",
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Propose failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  authority
    .command("accept")
    .description("Accept a pending authority transfer (step 2 of 2)")
    .action(async function (this: Command) {
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
        const newAuthority = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);

        const tx = await anchorProgram.methods
          .acceptAuthority()
          .accountsPartial({
            newAuthority,
            config: configPda,
          })
          .rpc();

        const payload = { command: "authority accept", txSignature: tx };
        const text = [
          "Authority transfer accepted",
          renderKeyValueLines([
            ["tx", tx],
            ["newAuthority", newAuthority.toBase58()],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Accept failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  authority
    .command("cancel")
    .description("Cancel a pending authority transfer")
    .action(async function (this: Command) {
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
        const currentAuthority = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);

        const tx = await anchorProgram.methods
          .cancelAuthorityTransfer()
          .accountsPartial({
            authority: currentAuthority,
            config: configPda,
          })
          .rpc();

        const payload = { command: "authority cancel", txSignature: tx };
        const text = [
          "Authority transfer cancelled",
          renderKeyValueLines([["tx", tx]]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Cancel failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  // ---------------------------------------------------------------
  // Metadata update
  // ---------------------------------------------------------------
  program
    .command("set-metadata <field> <value>")
    .description("Update a token metadata field (authority only)")
    .action(async function (this: Command, field: string, value: string) {
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
        const authorityKey = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);

        const tx = await anchorProgram.methods
          .setMetadata({ field, value })
          .accountsPartial({
            authority: authorityKey,
            config: configPda,
            mint,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        const payload = { command: "set-metadata", txSignature: tx, field, value };
        const text = [
          "Metadata updated",
          renderKeyValueLines([
            ["tx", tx],
            ["field", field],
            ["value", value],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Set metadata failed: ${msg}`);
        process.exitCode = 1;
      }
    });
}
