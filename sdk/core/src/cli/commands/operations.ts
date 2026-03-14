import { Command } from "commander";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program, BN, Wallet } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "node:fs";

import { resolveCliContext } from "../context";
import { renderKeyValueLines, writeStructuredOutput } from "../output";
import {
  getConfigAddress,
  getRoleAddress,
  getQuotaAddress,
  ROLE_MINTER,
  ROLE_FREEZER,
} from "../../pda";
import { loadProgram, createProvider, getProgramId, IDL_NOT_FOUND_MSG } from "../program";

export function registerOperationCommands(program: Command): void {
  program
    .command("mint <recipient> <amount>")
    .description("Mint tokens to a recipient")
    .action(async function (this: Command, recipient: string, amount: string) {
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
        const minter = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);
        const [minterRole] = getRoleAddress(programId, ROLE_MINTER, configPda, minter);
        const [minterQuota] = getQuotaAddress(programId, configPda, minter);

        const recipientPubkey = new PublicKey(recipient);
        const recipientAta = getAssociatedTokenAddressSync(
          mint,
          recipientPubkey,
          false,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );

        const mintAmount = new BN(amount);
        const tx = await anchorProgram.methods
          .mintTokens(mintAmount)
          .accountsPartial({
            minter,
            config: configPda,
            minterRole,
            minterQuota,
            mint,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        const payload = { command: "mint", txSignature: tx, recipient, amount };
        const text = [
          "Minted successfully",
          renderKeyValueLines([
            ["tx", tx],
            ["recipient", recipient],
            ["amount", amount],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Mint failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  program
    .command("burn <amount>")
    .description("Burn tokens from the caller's account")
    .action(async function (this: Command, amount: string) {
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
        const burner = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);

        const burnerAta = getAssociatedTokenAddressSync(
          mint,
          burner,
          false,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );

        const burnAmount = new BN(amount);
        const tx = await anchorProgram.methods
          .burnTokens(burnAmount)
          .accountsPartial({
            burner,
            config: configPda,
            mint,
            burnerTokenAccount: burnerAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        const payload = { command: "burn", txSignature: tx, amount };
        const text = [
          "Burned successfully",
          renderKeyValueLines([
            ["tx", tx],
            ["amount", amount],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Burn failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  program
    .command("freeze <address>")
    .description("Freeze a token account")
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
        const freezer = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);
        const [freezerRole] = getRoleAddress(programId, ROLE_FREEZER, configPda, freezer);

        const targetTokenAccount = new PublicKey(address);

        const tx = await anchorProgram.methods
          .freezeAccount()
          .accountsPartial({
            freezer,
            config: configPda,
            freezerRole,
            mint,
            targetTokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        const payload = { command: "freeze", txSignature: tx, target: address };
        const text = [
          "Account frozen",
          renderKeyValueLines([
            ["tx", tx],
            ["target", address],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Freeze failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  program
    .command("thaw <address>")
    .description("Thaw a frozen token account")
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
        const freezer = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);
        const [freezerRole] = getRoleAddress(programId, ROLE_FREEZER, configPda, freezer);

        const targetTokenAccount = new PublicKey(address);

        const tx = await anchorProgram.methods
          .thawAccount()
          .accountsPartial({
            freezer,
            config: configPda,
            freezerRole,
            mint,
            targetTokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        const payload = { command: "thaw", txSignature: tx, target: address };
        const text = [
          "Account thawed",
          renderKeyValueLines([
            ["tx", tx],
            ["target", address],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Thaw failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  program
    .command("pause")
    .description("Pause the stablecoin (authority only)")
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
        const authority = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);

        const tx = await anchorProgram.methods
          .pause()
          .accountsPartial({
            authority,
            config: configPda,
          })
          .rpc();

        const payload = { command: "pause", txSignature: tx };
        const text = ["Stablecoin paused", renderKeyValueLines([["tx", tx]])].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Pause failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  program
    .command("unpause")
    .description("Unpause the stablecoin (authority only)")
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
        const authority = provider.publicKey;
        const mint = new PublicKey(context.config.mintAddress);
        const programId = getProgramId(context.config);
        const [configPda] = getConfigAddress(programId, mint);

        const tx = await anchorProgram.methods
          .unpause()
          .accountsPartial({
            authority,
            config: configPda,
          })
          .rpc();

        const payload = { command: "unpause", txSignature: tx };
        const text = ["Stablecoin unpaused", renderKeyValueLines([["tx", tx]])].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Unpause failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  program
    .command("status")
    .description("Show stablecoin status")
    .action(async function (this: Command) {
      const context = resolveCliContext(this);

      if (!context.config.mintAddress) {
        const text = "No mint address set. Use: sss-token config set mintAddress <address>";
        writeStructuredOutput(context, { error: "no mint address" }, text);
        process.exitCode = 1;
        return;
      }

      try {
        const provider = createProvider(context.config);
        const programId = getProgramId(context.config);
        const mint = new PublicKey(context.config.mintAddress);
        const [configAddress] = getConfigAddress(programId, mint);

        const accountInfo = await provider.connection.getAccountInfo(configAddress);
        if (!accountInfo) {
          writeStructuredOutput(context, { error: "config not found" }, "Config account not found on-chain.");
          process.exitCode = 1;
          return;
        }

        // Try to load the program for decoded status
        const loaded = loadProgram(context.config);
        if (loaded) {
          const configAccount = await loaded.program.account.stablecoinConfig.fetch(configAddress);
          const totalMinted = configAccount.totalMinted as BN;
          const totalBurned = configAccount.totalBurned as BN;
          const netSupply = totalMinted.sub(totalBurned);
          const pendingAuth = configAccount.pendingAuthority as PublicKey;
          const hasPending = !pendingAuth.equals(PublicKey.default);

          const payload = {
            command: "status",
            mint: mint.toBase58(),
            config: configAddress.toBase58(),
            authority: (configAccount.authority as PublicKey).toBase58(),
            pendingAuthority: hasPending ? pendingAuth.toBase58() : null,
            paused: configAccount.paused,
            complianceEnabled: configAccount.complianceEnabled,
            totalMinted: totalMinted.toString(),
            totalBurned: totalBurned.toString(),
            netSupply: netSupply.toString(),
          };
          const text = [
            "Stablecoin status",
            renderKeyValueLines([
              ["mint", mint.toBase58()],
              ["config", configAddress.toBase58()],
              ["authority", (configAccount.authority as PublicKey).toBase58()],
              ["pendingAuthority", hasPending ? pendingAuth.toBase58() : "(none)"],
              ["paused", configAccount.paused],
              ["complianceEnabled", configAccount.complianceEnabled],
              ["totalMinted", totalMinted.toString()],
              ["totalBurned", totalBurned.toString()],
              ["netSupply", netSupply.toString()],
            ]),
          ].join("\n");
          writeStructuredOutput(context, payload, text);
        } else {
          // Fallback: raw account info without decoding
          const payload = {
            command: "status",
            mint: mint.toBase58(),
            config: configAddress.toBase58(),
            dataLength: accountInfo.data.length,
            owner: accountInfo.owner.toBase58(),
          };
          const text = [
            "Stablecoin status (raw — IDL not found for full decode)",
            renderKeyValueLines([
              ["mint", mint.toBase58()],
              ["config", configAddress.toBase58()],
              ["programOwner", accountInfo.owner.toBase58()],
              ["dataLength", accountInfo.data.length],
            ]),
          ].join("\n");
          writeStructuredOutput(context, payload, text);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Error: ${msg}`);
        process.exitCode = 1;
      }
    });

  program
    .command("supply")
    .description("Show current supply (totalMinted - totalBurned)")
    .action(async function (this: Command) {
      const context = resolveCliContext(this);

      if (!context.config.mintAddress) {
        const text = "No mint address set. Use: sss-token config set mintAddress <address>";
        writeStructuredOutput(context, { error: "no mint address" }, text);
        process.exitCode = 1;
        return;
      }

      try {
        const programId = getProgramId(context.config);
        const mint = new PublicKey(context.config.mintAddress);
        const [configAddress] = getConfigAddress(programId, mint);

        const loaded = loadProgram(context.config);
        if (!loaded) {
          writeStructuredOutput(context, { error: IDL_NOT_FOUND_MSG }, IDL_NOT_FOUND_MSG);
          process.exitCode = 1;
          return;
        }

        const configAccount = await loaded.program.account.stablecoinConfig.fetch(configAddress);
        const totalMinted = configAccount.totalMinted as BN;
        const totalBurned = configAccount.totalBurned as BN;
        const netSupply = totalMinted.sub(totalBurned);

        const payload = {
          command: "supply",
          mint: mint.toBase58(),
          totalMinted: totalMinted.toString(),
          totalBurned: totalBurned.toString(),
          netSupply: netSupply.toString(),
        };
        const text = [
          "Supply info",
          renderKeyValueLines([
            ["mint", mint.toBase58()],
            ["totalMinted", totalMinted.toString()],
            ["totalBurned", totalBurned.toString()],
            ["netSupply", netSupply.toString()],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Error: ${msg}`);
        process.exitCode = 1;
      }
    });
}
