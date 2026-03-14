import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import { resolveCliContext } from "../context";
import { renderKeyValueLines, writeStructuredOutput } from "../output";
import {
  getBlacklistAddress,
  getConfigAddress,
  getRoleAddress,
  ROLE_BLACKLISTER,
  ROLE_SEIZER,
} from "../../pda";
import { loadProgram, getProgramId, IDL_NOT_FOUND_MSG } from "../program";

export function registerComplianceCommands(program: Command): void {
  const blacklist = program
    .command("blacklist")
    .description("Blacklist management (SSS-2 only)");

  blacklist
    .command("add <address>")
    .description("Add an address to the blacklist")
    .option("--reason <reason>", "Reason for blacklisting")
    .action(async function (this: Command, address: string, options: { reason?: string }) {
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
        const blacklister = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);
        const [blacklisterRole] = getRoleAddress(programId, ROLE_BLACKLISTER, configPda, blacklister);
        const targetPubkey = new PublicKey(address);
        const [blacklistEntry] = getBlacklistAddress(programId, configPda, targetPubkey);

        const reason = options.reason ?? "";
        const tx = await anchorProgram.methods
          .addToBlacklist(targetPubkey, reason)
          .accountsPartial({
            blacklister,
            config: configPda,
            blacklisterRole,
            blacklistEntry,
            systemProgram: PublicKey.default,
          })
          .rpc();

        const payload = { command: "blacklist add", txSignature: tx, address, reason: options.reason ?? null };
        const text = [
          "Address blacklisted",
          renderKeyValueLines([
            ["tx", tx],
            ["address", address],
            ["reason", options.reason ?? "(none)"],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Blacklist add failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  blacklist
    .command("remove <address>")
    .description("Remove an address from the blacklist")
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
        const blacklister = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);
        const [blacklisterRole] = getRoleAddress(programId, ROLE_BLACKLISTER, configPda, blacklister);
        const targetPubkey = new PublicKey(address);
        const [blacklistEntry] = getBlacklistAddress(programId, configPda, targetPubkey);

        const tx = await anchorProgram.methods
          .removeFromBlacklist(targetPubkey)
          .accountsPartial({
            blacklister,
            config: configPda,
            blacklisterRole,
            blacklistEntry,
          })
          .rpc();

        const payload = { command: "blacklist remove", txSignature: tx, address };
        const text = [
          "Address removed from blacklist",
          renderKeyValueLines([
            ["tx", tx],
            ["address", address],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Blacklist remove failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  blacklist
    .command("check <address>")
    .description("Check if an address is blacklisted")
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
        const [blacklistPda] = getBlacklistAddress(programId, configAddress, target);

        const loaded = loadProgram(context.config);
        let isBlacklisted = false;

        if (loaded) {
          try {
            const entry = await loaded.program.account.blacklistEntry.fetch(blacklistPda);
            isBlacklisted = entry.active as boolean;
          } catch {
            isBlacklisted = false;
          }
        } else {
          // Fallback: check if account exists
          const provider = (await import("../program")).createProvider(context.config);
          const info = await provider.connection.getAccountInfo(blacklistPda);
          isBlacklisted = info !== null;
        }

        const payload = {
          command: "blacklist check",
          address,
          blacklisted: isBlacklisted,
          blacklistPda: blacklistPda.toBase58(),
        };
        const text = [
          `Blacklist status: ${isBlacklisted ? "BLACKLISTED" : "NOT blacklisted"}`,
          renderKeyValueLines([
            ["address", address],
            ["blacklisted", isBlacklisted],
            ["blacklistPda", blacklistPda.toBase58()],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Check failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  program
    .command("seize <from-owner>")
    .description("Seize tokens from a blacklisted address to treasury (SSS-2 only)")
    .requiredOption("--to <treasury-owner>", "Treasury wallet owner address")
    .requiredOption("--amount <amount>", "Amount to seize (in base units)")
    .action(async function (
      this: Command,
      fromOwner: string,
      options: { to: string; amount: string },
    ) {
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
        const seizer = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);
        const [seizerRole] = getRoleAddress(programId, ROLE_SEIZER, configPda, seizer);
        const targetOwner = new PublicKey(fromOwner);
        const treasuryOwner = new PublicKey(options.to);
        const [blacklistEntry] = getBlacklistAddress(programId, configPda, targetOwner);

        const sourceAta = getAssociatedTokenAddressSync(
          mint, targetOwner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
        );
        const treasuryAta = getAssociatedTokenAddressSync(
          mint, treasuryOwner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
        );

        const seizeAmount = new BN(options.amount);
        const tx = await anchorProgram.methods
          .seize(seizeAmount)
          .accountsPartial({
            seizer,
            config: configPda,
            seizerRole,
            blacklistEntry,
            targetOwner,
            mint,
            sourceTokenAccount: sourceAta,
            treasuryTokenAccount: treasuryAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        const payload = {
          command: "seize",
          txSignature: tx,
          from: fromOwner,
          to: options.to,
          amount: options.amount,
        };
        const text = [
          "Tokens seized successfully",
          renderKeyValueLines([
            ["tx", tx],
            ["from", fromOwner],
            ["to", options.to],
            ["amount", options.amount],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Seize failed: ${msg}`);
        process.exitCode = 1;
      }
    });
}
