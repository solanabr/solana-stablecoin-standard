import { Command } from "commander";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import {
  resolveUrl,
  loadKeypair,
  getProgram,
  success,
  error,
  printTx,
  TRANSFER_HOOK_PROGRAM_ID,
} from "../utils";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new stablecoin")
    .requiredOption("--preset <preset>", "Preset: sss-1, sss-2, sss-3, custom")
    .requiredOption("--name <name>", "Token name")
    .requiredOption("--symbol <symbol>", "Token symbol")
    .option("--uri <uri>", "Metadata URI", "")
    .option("--decimals <decimals>", "Token decimals", "6")
    .option("--master-minter <pubkey>", "Master minter public key")
    .option("--pauser <pubkey>", "Pauser public key")
    .option("--blacklister <pubkey>", "Blacklister public key")
    .action(async (opts, cmd) => {
      try {
        const globalOpts = cmd.parent.opts();
        const url = resolveUrl(globalOpts.url || "localnet");
        const connection = new Connection(url, "confirmed");
        const wallet = loadKeypair(globalOpts.keypair);
        const prog = getProgram(connection, wallet);

        const presetMap: Record<string, any> = {
          "sss-1": { sss1: {} },
          "sss-2": { sss2: {} },
          "sss-3": { sss3: {} },
          custom: { custom: {} },
        };

        const preset = presetMap[opts.preset];
        if (!preset) {
          error(`Invalid preset: ${opts.preset}. Use sss-1, sss-2, sss-3, or custom`);
          process.exit(1);
        }

        const masterMinter = opts.masterMinter
          ? new PublicKey(opts.masterMinter)
          : wallet.publicKey;
        const pauser = opts.pauser
          ? new PublicKey(opts.pauser)
          : wallet.publicKey;
        const blacklister = opts.blacklister
          ? new PublicKey(opts.blacklister)
          : null;

        const mintKeypair = Keypair.generate();
        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("config"), mintKeypair.publicKey.toBuffer()],
          prog.programId
        );
        const [mintAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from("authority"), mintKeypair.publicKey.toBuffer()],
          prog.programId
        );

        const params = {
          preset,
          name: opts.name,
          symbol: opts.symbol,
          uri: opts.uri,
          decimals: parseInt(opts.decimals),
          enablePermanentDelegate: null,
          enableTransferHook: null,
          enableConfidentialTransfers: null,
          defaultAccountFrozen: null,
          masterMinter,
          pauser,
          blacklister,
          auditorElgamalPubkey: null,
        };

        const accounts: Record<string, any> = {
          authority: wallet.publicKey,
          mint: mintKeypair.publicKey,
          config: configPda,
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        };

        if (opts.preset === "sss-2") {
          accounts.transferHookProgram = TRANSFER_HOOK_PROGRAM_ID;
        }

        const sig = await prog.methods
          .initialize(params)
          .accounts(accounts)
          .signers([mintKeypair])
          .rpc();

        success(`Stablecoin initialized!`);
        console.log(`  Mint: ${mintKeypair.publicKey.toBase58()}`);
        console.log(`  Config: ${configPda.toBase58()}`);
        console.log(`  Preset: ${opts.preset}`);
        printTx(sig, globalOpts.url || "localnet");
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });
}
