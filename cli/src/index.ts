#!/usr/bin/env node
import { Command } from "commander";
import { Connection, Keypair, PublicKey, clusterApiUrl, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const SSS1_PROGRAM_ID = new PublicKey("J4Z8HDQs2VbmSxs1VURkGY5M51SDmiY8K5a1RVuTN6np");
const ROLE_MAP: Record<string, number> = { admin: 0, minter: 1, burner: 2, freezer: 3, blacklister: 4 };

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(resolveTilde(path), "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function resolveTilde(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function getProvider(cluster: string, walletPath: string): AnchorProvider {
  const connection = new Connection(
    cluster === "devnet" ? clusterApiUrl("devnet") : cluster === "mainnet" ? clusterApiUrl("mainnet-beta") : "http://localhost:8899"
  );
  const wallet = new Wallet(loadKeypair(walletPath));
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

function parsePublicKey(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function parseAmount(value: string): BN {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid amount: ${value}. Must be an integer > 0.`);
  }
  const amount = new BN(value, 10);
  if (amount.lte(new BN(0))) {
    throw new Error("Amount must be > 0");
  }
  return amount;
}

function resolveFirstExistingPath(candidates: string[]): string {
  const found = candidates
    .map((candidate) => path.resolve(candidate))
    .find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Unable to find IDL file. Tried: ${candidates.join(", ")}`);
  }
  return found;
}

function loadIdl(defaultFileName: string, explicitPath?: string): any {
  const idlPath = explicitPath
    ? resolveFirstExistingPath([explicitPath])
    : resolveFirstExistingPath([
        `target/idl/${defaultFileName}`,
        `../target/idl/${defaultFileName}`,
        `../../target/idl/${defaultFileName}`,
      ]);
  return JSON.parse(fs.readFileSync(idlPath, "utf-8"));
}

function getSss1Program(provider: AnchorProvider): Program {
  const idl = loadIdl("sss_1.json", process.env.SSS1_IDL_PATH);
  const configuredProgramId = process.env.SSS1_PROGRAM_ID
    ? new PublicKey(process.env.SSS1_PROGRAM_ID)
    : SSS1_PROGRAM_ID;
  return new Program({ ...idl, address: configuredProgramId.toBase58() }, provider);
}

function findConfigPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("config"), mint.toBuffer()], SSS1_PROGRAM_ID)[0];
}

function findRolePda(config: PublicKey, authority: PublicKey, roleType: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("role"), config.toBuffer(), authority.toBuffer(), Buffer.from([roleType])],
    SSS1_PROGRAM_ID
  )[0];
}

function findHookConfigPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("hook_config"), mint.toBuffer()], SSS1_PROGRAM_ID)[0];
}

function findBlacklistPda(hookConfig: PublicKey, address: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), hookConfig.toBuffer(), address.toBuffer()],
    SSS1_PROGRAM_ID
  )[0];
}

const program = new Command();

program
  .name("sss-token")
  .description("Solana Stablecoin Standard CLI")
  .version("0.1.0")
  .option("-c, --cluster <cluster>", "Solana cluster", "devnet")
  .option("-w, --wallet <path>", "Wallet keypair path", "~/.config/solana/id.json");

program
  .command("config <mint>")
  .description("Show stablecoin configuration")
  .action(async (mint: string) => {
    const opts = program.opts();
    const provider = getProvider(opts.cluster, opts.wallet);
    const configPda = findConfigPda(new PublicKey(mint));
    const info = await provider.connection.getAccountInfo(configPda);
    if (!info) { console.log("Config not found"); return; }
    console.log(`Config PDA: ${configPda.toBase58()}`);
    console.log(`Data length: ${info.data.length} bytes`);
    console.log(`Owner: ${info.owner.toBase58()}`);
  });

program
  .command("pause <mint>")
  .description("Pause SSS-1 lifecycle operations")
  .action(async (mint: string) => {
    const opts = program.opts();
    const provider = getProvider(opts.cluster, opts.wallet);
    const sss1Program = getSss1Program(provider);
    const mintPk = parsePublicKey(mint, "mint");
    const config = findConfigPda(mintPk);

    const tx = await sss1Program.methods
      .pause()
      .accounts({
        admin: provider.wallet.publicKey,
        config,
      })
      .rpc();
    console.log(`Paused ${mintPk.toBase58()} tx=${tx}`);
  });

program
  .command("unpause <mint>")
  .description("Unpause SSS-1 lifecycle operations")
  .action(async (mint: string) => {
    const opts = program.opts();
    const provider = getProvider(opts.cluster, opts.wallet);
    const sss1Program = getSss1Program(provider);
    const mintPk = parsePublicKey(mint, "mint");
    const config = findConfigPda(mintPk);

    const tx = await sss1Program.methods
      .unpause()
      .accounts({
        admin: provider.wallet.publicKey,
        config,
      })
      .rpc();
    console.log(`Unpaused ${mintPk.toBase58()} tx=${tx}`);
  });

program
  .command("transfer-admin <mint> <newAdmin>")
  .description("Transfer SSS-1 admin authority")
  .action(async (mint: string, newAdmin: string) => {
    const opts = program.opts();
    const provider = getProvider(opts.cluster, opts.wallet);
    const sss1Program = getSss1Program(provider);
    const mintPk = parsePublicKey(mint, "mint");
    const newAdminPk = parsePublicKey(newAdmin, "newAdmin");
    const config = findConfigPda(mintPk);

    const tx = await sss1Program.methods
      .transferAdmin()
      .accounts({
        admin: provider.wallet.publicKey,
        config,
        newAdmin: newAdminPk,
      })
      .rpc();
    console.log(`Transferred admin for ${mintPk.toBase58()} to ${newAdminPk.toBase58()} tx=${tx}`);
  });

program
  .command("update-minter <mint> <oldMinter> <newMinter>")
  .description("Rotate minter role by granting new minter then revoking old minter")
  .action(async (mint: string, oldMinter: string, newMinter: string) => {
    const opts = program.opts();
    const provider = getProvider(opts.cluster, opts.wallet);
    const sss1Program = getSss1Program(provider);
    const mintPk = parsePublicKey(mint, "mint");
    const oldMinterPk = parsePublicKey(oldMinter, "oldMinter");
    const newMinterPk = parsePublicKey(newMinter, "newMinter");
    const config = findConfigPda(mintPk);
    const oldRole = findRolePda(config, oldMinterPk, ROLE_MAP.minter);
    const newRole = findRolePda(config, newMinterPk, ROLE_MAP.minter);

    const grantTx = await sss1Program.methods
      .grantRole(ROLE_MAP.minter)
      .accounts({
        admin: provider.wallet.publicKey,
        config,
        authority: newMinterPk,
        role: newRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const revokeTx = await sss1Program.methods
      .revokeRole()
      .accounts({
        admin: provider.wallet.publicKey,
        config,
        authority: oldMinterPk,
        role: oldRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(
      `Updated minter for ${mintPk.toBase58()} old=${oldMinterPk.toBase58()} new=${newMinterPk.toBase58()} grantTx=${grantTx} revokeTx=${revokeTx}`
    );
  });

program
  .command("seize <mint> <fromTokenAccount> <toTokenAccount> <amount>")
  .description("Seize funds using SSS-1 PermanentDelegate path")
  .action(async (mint: string, fromTokenAccount: string, toTokenAccount: string, amount: string) => {
    const opts = program.opts();
    const provider = getProvider(opts.cluster, opts.wallet);
    const sss1Program = getSss1Program(provider);
    const mintPk = parsePublicKey(mint, "mint");
    const fromPk = parsePublicKey(fromTokenAccount, "fromTokenAccount");
    const toPk = parsePublicKey(toTokenAccount, "toTokenAccount");
    const amountBn = parseAmount(amount);
    const config = findConfigPda(mintPk);

    const tx = await sss1Program.methods
      .seizeTokens(amountBn)
      .accounts({
        admin: provider.wallet.publicKey,
        config,
        mint: mintPk,
        from: fromPk,
        to: toPk,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    console.log(`Seized ${amountBn.toString()} on ${mintPk.toBase58()} tx=${tx}`);
  });

program
  .command("set-compliance <mint> <enabled>")
  .description("Enable or disable SSS-2 compliance gating")
  .action(async (mint: string, enabled: string) => {
    const opts = program.opts();
    const provider = getProvider(opts.cluster, opts.wallet);
    const sss1Program = getSss1Program(provider);
    const mintPk = parsePublicKey(mint, "mint");
    const hookConfig = findHookConfigPda(mintPk);
    const normalized = enabled.toLowerCase();
    if (normalized !== "true" && normalized !== "false") {
      throw new Error(`Invalid enabled value: ${enabled}. Use true or false.`);
    }
    const enabledBool = normalized === "true";

    const tx = await sss1Program.methods
      .setComplianceMode(enabledBool)
      .accounts({
        authority: provider.wallet.publicKey,
        hookConfig,
      })
      .rpc();
    console.log(`Compliance set to ${enabledBool} for ${mintPk.toBase58()} tx=${tx}`);
  });

program
  .command("transfer-hook-authority <mint> <newAuthority>")
  .description("Transfer SSS-2 hook authority")
  .action(async (mint: string, newAuthority: string) => {
    const opts = program.opts();
    const provider = getProvider(opts.cluster, opts.wallet);
    const sss1Program = getSss1Program(provider);
    const mintPk = parsePublicKey(mint, "mint");
    const newAuthorityPk = parsePublicKey(newAuthority, "newAuthority");
    const hookConfig = findHookConfigPda(mintPk);

    const tx = await sss1Program.methods
      .transferHookAuthority()
      .accounts({
        authority: provider.wallet.publicKey,
        hookConfig,
        newAuthority: newAuthorityPk,
      })
      .rpc();
    console.log(`Transferred hook authority for ${mintPk.toBase58()} to ${newAuthorityPk.toBase58()} tx=${tx}`);
  });

program
  .command("derive-pda <type> <mint> [extra1] [extra2]")
  .description("Derive PDA addresses (config, role, hook_config, blacklist)")
  .action(async (type: string, mint: string, extra1?: string, extra2?: string) => {
    const mintPk = new PublicKey(mint);
    switch (type) {
      case "config":
        console.log(findConfigPda(mintPk).toBase58());
        break;
      case "role":
        if (!extra1 || !extra2) { console.log("Usage: derive-pda role <mint> <authority> <role_type>"); return; }
        console.log(findRolePda(findConfigPda(mintPk), new PublicKey(extra1), ROLE_MAP[extra2] ?? parseInt(extra2)).toBase58());
        break;
      case "hook_config":
        console.log(findHookConfigPda(mintPk).toBase58());
        break;
      case "blacklist":
        if (!extra1) { console.log("Usage: derive-pda blacklist <mint> <address>"); return; }
        console.log(findBlacklistPda(findHookConfigPda(mintPk), new PublicKey(extra1)).toBase58());
        break;
      default:
        console.log("Unknown PDA type. Use: config, role, hook_config, blacklist");
    }
  });

program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
