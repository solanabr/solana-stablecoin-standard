import { Command } from "commander";
import { PublicKey, SystemProgram } from "@solana/web3.js";

import { resolveCliContext } from "../context";
import { renderKeyValueLines, writeStructuredOutput } from "../output";
import {
  getAllowlistAddress,
  getConfigAddress,
} from "../../pda";
import { loadProgram, getProgramId, IDL_NOT_FOUND_MSG } from "../program";

export function registerAllowlistCommands(program: Command): void {
  const allowlist = program
    .command("allowlist")
    .description("Allowlist management (SSS-3 only)");

  allowlist
    .command("add <address>")
    .description("Add an address to the allowlist")
    .action(async function (this: Command, address: string) {
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
        const targetPubkey = new PublicKey(address);
        const [allowlistEntry] = getAllowlistAddress(programId, configPda, targetPubkey);

        const tx = await anchorProgram.methods
          .addToAllowlist(targetPubkey)
          .accountsPartial({
            authority,
            config: configPda,
            allowlistEntry,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const payload = { command: "allowlist add", txSignature: tx, address };
        const text = [
          "Address added to allowlist",
          renderKeyValueLines([
            ["tx", tx],
            ["address", address],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Allowlist add failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  allowlist
    .command("remove <address>")
    .description("Remove an address from the allowlist")
    .action(async function (this: Command, address: string) {
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
        const targetPubkey = new PublicKey(address);
        const [allowlistEntry] = getAllowlistAddress(programId, configPda, targetPubkey);

        const tx = await anchorProgram.methods
          .removeFromAllowlist(targetPubkey)
          .accountsPartial({
            authority,
            config: configPda,
            allowlistEntry,
          })
          .rpc();

        const payload = { command: "allowlist remove", txSignature: tx, address };
        const text = [
          "Address removed from allowlist",
          renderKeyValueLines([
            ["tx", tx],
            ["address", address],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Allowlist remove failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  allowlist
    .command("check <address>")
    .description("Check if an address is on the allowlist")
    .action(async function (this: Command, address: string) {
      const context = resolveCliContext(this);

      if (!context.config.mintAddress) {
        writeStructuredOutput(
          context,
          { error: "no mint" },
          "No mint address set. Use: sss-token config set mintAddress <address>",
        );
        process.exitCode = 1;
        return;
      }

      try {
        const programId = getProgramId(context.config);
        const mint = new PublicKey(context.config.mintAddress);
        const target = new PublicKey(address);
        const [configAddress] = getConfigAddress(programId, mint);
        const [allowlistPda] = getAllowlistAddress(programId, configAddress, target);

        const loaded = loadProgram(context.config);
        let isAllowlisted = false;

        if (loaded) {
          try {
            await loaded.program.account.allowlistEntry.fetch(allowlistPda);
            isAllowlisted = true;
          } catch {
            isAllowlisted = false;
          }
        } else {
          const { createProvider: cp } = await import("../program");
          const provider = cp(context.config);
          const info = await provider.connection.getAccountInfo(allowlistPda);
          isAllowlisted = info !== null;
        }

        const payload = {
          command: "allowlist check",
          address,
          allowlisted: isAllowlisted,
          allowlistPda: allowlistPda.toBase58(),
        };
        const text = [
          `Allowlist status: ${isAllowlisted ? "ALLOWLISTED" : "NOT allowlisted"}`,
          renderKeyValueLines([
            ["address", address],
            ["allowlisted", isAllowlisted],
            ["allowlistPda", allowlistPda.toBase58()],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Check failed: ${msg}`);
        process.exitCode = 1;
      }
    });
}
