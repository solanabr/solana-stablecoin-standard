import { Command } from "commander";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import {
  resolveUrl,
  loadKeypair,
  getProgram,
  success,
  error,
  warn,
  printTx,
} from "../utils";

export function registerAdminCommands(program: Command): void {
  // Pause
  program
    .command("pause")
    .description("Pause all transfers")
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

        const sig = await prog.methods
          .pause()
          .accounts({ pauser: wallet.publicKey, config: configPda })
          .rpc();

        warn("Token PAUSED — all transfers are now blocked");
        printTx(sig, globalOpts.url || "localnet");
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // Unpause
  program
    .command("unpause")
    .description("Unpause transfers")
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

        const sig = await prog.methods
          .unpause()
          .accounts({ pauser: wallet.publicKey, config: configPda })
          .rpc();

        success("Token UNPAUSED");
        printTx(sig, globalOpts.url || "localnet");
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // Freeze
  program
    .command("freeze <address>")
    .description("Freeze a token account")
    .requiredOption("--mint <address>", "Mint address")
    .action(async (address, opts, cmd) => {
      try {
        const globalOpts = cmd.parent.opts();
        const url = resolveUrl(globalOpts.url || "localnet");
        const connection = new Connection(url, "confirmed");
        const wallet = loadKeypair(globalOpts.keypair);
        const prog = getProgram(connection, wallet);

        const mintPubkey = new PublicKey(opts.mint);
        const targetPubkey = new PublicKey(address);
        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("config"), mintPubkey.toBuffer()],
          prog.programId
        );
        const [mintAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from("authority"), mintPubkey.toBuffer()],
          prog.programId
        );
        const tokenAccount = getAssociatedTokenAddressSync(
          mintPubkey,
          targetPubkey,
          false,
          TOKEN_2022_PROGRAM_ID
        );

        const sig = await prog.methods
          .freezeAccount()
          .accounts({
            authority: wallet.publicKey,
            config: configPda,
            mint: mintPubkey,
            mintAuthority,
            tokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        success(`Froze account for ${address}`);
        printTx(sig, globalOpts.url || "localnet");
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // Thaw
  program
    .command("thaw <address>")
    .description("Thaw a frozen token account")
    .requiredOption("--mint <address>", "Mint address")
    .action(async (address, opts, cmd) => {
      try {
        const globalOpts = cmd.parent.opts();
        const url = resolveUrl(globalOpts.url || "localnet");
        const connection = new Connection(url, "confirmed");
        const wallet = loadKeypair(globalOpts.keypair);
        const prog = getProgram(connection, wallet);

        const mintPubkey = new PublicKey(opts.mint);
        const targetPubkey = new PublicKey(address);
        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("config"), mintPubkey.toBuffer()],
          prog.programId
        );
        const [mintAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from("authority"), mintPubkey.toBuffer()],
          prog.programId
        );
        const tokenAccount = getAssociatedTokenAddressSync(
          mintPubkey,
          targetPubkey,
          false,
          TOKEN_2022_PROGRAM_ID
        );

        const sig = await prog.methods
          .thawAccount()
          .accounts({
            authority: wallet.publicKey,
            config: configPda,
            mint: mintPubkey,
            mintAuthority,
            tokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        success(`Thawed account for ${address}`);
        printTx(sig, globalOpts.url || "localnet");
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // Blacklist subcommand
  const blacklist = program
    .command("blacklist")
    .description("Manage blacklisted addresses");

  blacklist
    .command("add <address>")
    .description("Add address to blacklist")
    .requiredOption("--mint <address>", "Mint address")
    .option("--reason <reason>", "Reason for blacklisting", "Manual blacklist")
    .action(async (address, opts, cmd) => {
      try {
        const globalOpts = cmd.parent.parent.opts();
        const url = resolveUrl(globalOpts.url || "localnet");
        const connection = new Connection(url, "confirmed");
        const wallet = loadKeypair(globalOpts.keypair);
        const prog = getProgram(connection, wallet);

        const mintPubkey = new PublicKey(opts.mint);
        const targetPubkey = new PublicKey(address);
        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("config"), mintPubkey.toBuffer()],
          prog.programId
        );
        const [mintAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from("authority"), mintPubkey.toBuffer()],
          prog.programId
        );
        const [blacklistPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("blacklist"), mintPubkey.toBuffer(), targetPubkey.toBuffer()],
          prog.programId
        );
        const walletTokenAccount = getAssociatedTokenAddressSync(
          mintPubkey,
          targetPubkey,
          false,
          TOKEN_2022_PROGRAM_ID
        );

        const sig = await prog.methods
          .blacklistAdd(opts.reason)
          .accounts({
            blacklister: wallet.publicKey,
            config: configPda,
            mint: mintPubkey,
            wallet: targetPubkey,
            blacklistEntry: blacklistPda,
            mintAuthority,
            walletTokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        warn(`Blacklisted ${address} — reason: ${opts.reason}`);
        printTx(sig, globalOpts.url || "localnet");
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  blacklist
    .command("remove <address>")
    .description("Remove address from blacklist")
    .requiredOption("--mint <address>", "Mint address")
    .action(async (address, opts, cmd) => {
      try {
        const globalOpts = cmd.parent.parent.opts();
        const url = resolveUrl(globalOpts.url || "localnet");
        const connection = new Connection(url, "confirmed");
        const wallet = loadKeypair(globalOpts.keypair);
        const prog = getProgram(connection, wallet);

        const mintPubkey = new PublicKey(opts.mint);
        const targetPubkey = new PublicKey(address);
        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("config"), mintPubkey.toBuffer()],
          prog.programId
        );
        const [blacklistPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("blacklist"), mintPubkey.toBuffer(), targetPubkey.toBuffer()],
          prog.programId
        );

        const sig = await prog.methods
          .blacklistRemove()
          .accounts({
            blacklister: wallet.publicKey,
            config: configPda,
            mint: mintPubkey,
            wallet: targetPubkey,
            blacklistEntry: blacklistPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        success(`Removed ${address} from blacklist`);
        printTx(sig, globalOpts.url || "localnet");
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // Minters subcommand
  const minters = program
    .command("minters")
    .description("Manage minters");

  minters
    .command("add <address>")
    .description("Add a minter")
    .requiredOption("--mint <address>", "Mint address")
    .requiredOption("--allowance <amount>", "Minting allowance")
    .action(async (address, opts, cmd) => {
      try {
        const globalOpts = cmd.parent.parent.opts();
        const url = resolveUrl(globalOpts.url || "localnet");
        const connection = new Connection(url, "confirmed");
        const wallet = loadKeypair(globalOpts.keypair);
        const prog = getProgram(connection, wallet);

        const mintPubkey = new PublicKey(opts.mint);
        const minterPubkey = new PublicKey(address);
        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("config"), mintPubkey.toBuffer()],
          prog.programId
        );
        const [minterPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("minter"), mintPubkey.toBuffer(), minterPubkey.toBuffer()],
          prog.programId
        );

        const sig = await prog.methods
          .addMinter(minterPubkey, new anchor.BN(opts.allowance))
          .accounts({
            authority: wallet.publicKey,
            config: configPda,
            minterAllowance: minterPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        success(`Added minter ${address} with allowance ${opts.allowance}`);
        printTx(sig, globalOpts.url || "localnet");
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  minters
    .command("remove <address>")
    .description("Remove a minter")
    .requiredOption("--mint <address>", "Mint address")
    .action(async (address, opts, cmd) => {
      try {
        const globalOpts = cmd.parent.parent.opts();
        const url = resolveUrl(globalOpts.url || "localnet");
        const connection = new Connection(url, "confirmed");
        const wallet = loadKeypair(globalOpts.keypair);
        const prog = getProgram(connection, wallet);

        const mintPubkey = new PublicKey(opts.mint);
        const minterPubkey = new PublicKey(address);
        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("config"), mintPubkey.toBuffer()],
          prog.programId
        );
        const [minterPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("minter"), mintPubkey.toBuffer(), minterPubkey.toBuffer()],
          prog.programId
        );

        const sig = await prog.methods
          .removeMinter()
          .accounts({
            authority: wallet.publicKey,
            config: configPda,
            minterAllowance: minterPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        success(`Removed minter ${address}`);
        printTx(sig, globalOpts.url || "localnet");
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // Transfer ownership
  program
    .command("transfer-ownership <new-owner>")
    .description("Initiate ownership transfer")
    .requiredOption("--mint <address>", "Mint address")
    .action(async (newOwner, opts, cmd) => {
      try {
        const globalOpts = cmd.parent.opts();
        const url = resolveUrl(globalOpts.url || "localnet");
        const connection = new Connection(url, "confirmed");
        const wallet = loadKeypair(globalOpts.keypair);
        const prog = getProgram(connection, wallet);

        const mintPubkey = new PublicKey(opts.mint);
        const newOwnerPubkey = new PublicKey(newOwner);
        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("config"), mintPubkey.toBuffer()],
          prog.programId
        );

        const sig = await prog.methods
          .transferOwnership(newOwnerPubkey)
          .accounts({ owner: wallet.publicKey, config: configPda })
          .rpc();

        warn(`Ownership transfer initiated to ${newOwner}`);
        console.log("  The new owner must call 'accept-ownership' to complete");
        printTx(sig, globalOpts.url || "localnet");
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // Accept ownership
  program
    .command("accept-ownership")
    .description("Accept pending ownership transfer")
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

        const sig = await prog.methods
          .acceptOwnership()
          .accounts({ newOwner: wallet.publicKey, config: configPda })
          .rpc();

        success("Ownership accepted!");
        printTx(sig, globalOpts.url || "localnet");
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });
}
