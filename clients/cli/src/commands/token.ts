import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import {
  resolveUrl,
  loadKeypair,
  getProgram,
  success,
  error,
  printTx,
} from "../utils";

export function registerTokenCommands(program: Command): void {
  // Mint
  program
    .command("mint <recipient> <amount>")
    .description("Mint tokens to a recipient")
    .requiredOption("--mint <address>", "Mint address")
    .action(async (recipient, amount, opts, cmd) => {
      try {
        const globalOpts = cmd.parent.opts();
        const url = resolveUrl(globalOpts.url || "localnet");
        const connection = new Connection(url, "confirmed");
        const wallet = loadKeypair(globalOpts.keypair);
        const prog = getProgram(connection, wallet);

        const mintPubkey = new PublicKey(opts.mint);
        const recipientPubkey = new PublicKey(recipient);
        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("config"), mintPubkey.toBuffer()],
          prog.programId
        );
        const [mintAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from("authority"), mintPubkey.toBuffer()],
          prog.programId
        );
        const [minterPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("minter"), mintPubkey.toBuffer(), wallet.publicKey.toBuffer()],
          prog.programId
        );
        const recipientAta = getAssociatedTokenAddressSync(
          mintPubkey,
          recipientPubkey,
          false,
          TOKEN_2022_PROGRAM_ID
        );

        // Create ATA if needed
        const ataInfo = await connection.getAccountInfo(recipientAta);
        if (!ataInfo) {
          const ix = createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            recipientAta,
            recipientPubkey,
            mintPubkey,
            TOKEN_2022_PROGRAM_ID
          );
          const tx = new anchor.web3.Transaction().add(ix);
          await (prog.provider as anchor.AnchorProvider).sendAndConfirm(tx);
        }

        const sig = await prog.methods
          .mintTokens(new anchor.BN(amount))
          .accounts({
            minter: wallet.publicKey,
            config: configPda,
            minterAllowance: minterPda,
            mint: mintPubkey,
            mintAuthority,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        success(`Minted ${amount} tokens to ${recipient}`);
        printTx(sig, globalOpts.url || "localnet");
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // Burn
  program
    .command("burn <amount>")
    .description("Burn tokens from your account")
    .requiredOption("--mint <address>", "Mint address")
    .action(async (amount, opts, cmd) => {
      try {
        const globalOpts = cmd.parent.opts();
        const url = resolveUrl(globalOpts.url || "localnet");
        const connection = new Connection(url, "confirmed");
        const wallet = loadKeypair(globalOpts.keypair);
        const prog = getProgram(connection, wallet);

        const mintPubkey = new PublicKey(opts.mint);
        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("config"), mintPubkey.toBuffer()],
          prog.programId
        );
        const [minterPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("minter"), mintPubkey.toBuffer(), wallet.publicKey.toBuffer()],
          prog.programId
        );
        const burnerAta = getAssociatedTokenAddressSync(
          mintPubkey,
          wallet.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        );

        const sig = await prog.methods
          .burnTokens(new anchor.BN(amount))
          .accounts({
            burner: wallet.publicKey,
            config: configPda,
            minterAllowance: minterPda,
            mint: mintPubkey,
            burnerTokenAccount: burnerAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        success(`Burned ${amount} tokens`);
        printTx(sig, globalOpts.url || "localnet");
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // Info
  program
    .command("info")
    .description("Show stablecoin configuration")
    .requiredOption("--mint <address>", "Mint address")
    .action(async (opts, cmd) => {
      try {
        const globalOpts = cmd.parent.opts();
        const url = resolveUrl(globalOpts.url || "localnet");
        const connection = new Connection(url, "confirmed");
        const wallet = loadKeypair(globalOpts.keypair);
        const prog = getProgram(connection, wallet);

        const mintPubkey = new PublicKey(opts.mint);
        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("config"), mintPubkey.toBuffer()],
          prog.programId
        );

        const config = await (prog.account as any).stablecoinConfig.fetch(configPda);
        const output = globalOpts.output === "json" ? JSON.stringify(config, null, 2) : `
Stablecoin Configuration
========================
Mint:               ${config.mint.toBase58()}
Preset:             ${Object.keys(config.preset)[0]}
Name:               ${config.name}
Symbol:             ${config.symbol}
Decimals:           ${config.decimals}
Owner:              ${config.owner.toBase58()}
Master Minter:      ${config.masterMinter.toBase58()}
Pauser:             ${config.pauser.toBase58()}
Blacklister:        ${config.blacklister.toBase58()}
Paused:             ${config.isPaused}
Total Minted:       ${config.totalMinted.toString()}
Total Burned:       ${config.totalBurned.toString()}
Transfer Hook:      ${config.enableTransferHook}
Permanent Delegate: ${config.enablePermanentDelegate}
Confidential:       ${config.enableConfidentialTransfers}
`.trim();

        console.log(output);
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });
}
