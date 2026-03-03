#!/usr/bin/env node

import { Command } from "commander";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { SolanaStablecoin, Preset, Role } from "@sss/sdk";

const program = new Command();

function loadKeypair(keypairPath: string): Keypair {
  const resolved = keypairPath.startsWith("~")
    ? path.join(process.env.HOME!, keypairPath.slice(1))
    : keypairPath;
  const secret = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function getProvider(rpcUrl: string, keypairPath: string): AnchorProvider {
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new Wallet(loadKeypair(keypairPath));
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

function loadIdl(): any {
  const idlPath = path.resolve(__dirname, "../../target/idl/sss_core.json");
  if (!fs.existsSync(idlPath)) {
    console.error(chalk.red("IDL not found. Run 'anchor build' first."));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(idlPath, "utf-8"));
}

function getStablecoin(provider: AnchorProvider): SolanaStablecoin {
  return new SolanaStablecoin(provider, loadIdl());
}

function parseRole(s: string): Role {
  switch (s.toLowerCase()) {
    case "minter": return Role.Minter;
    case "burner": return Role.Burner;
    case "seizer": return Role.Seizer;
    case "pauser": return Role.Pauser;
    case "compliance":
    case "complianceofficer": return Role.ComplianceOfficer;
    default: throw new Error("Unknown role: " + s + ". Use: minter, burner, seizer, pauser, compliance");
  }
}

function parsePreset(s: string): Preset {
  switch (s.toLowerCase()) {
    case "sss-1": return Preset.SSS1;
    case "sss-2": return Preset.SSS2;
    case "sss-3": return Preset.SSS3;
    default: throw new Error("Unknown preset: " + s);
  }
}

program
  .name("sss-token")
  .description("CLI for Solana Stablecoin Standard")
  .version("0.1.0")
  .option("-u, --url <string>", "RPC URL", "http://localhost:8899")
  .option("-k, --keypair <string>", "Path to keypair file", "~/.config/solana/id.json");

// === create ===
program
  .command("create")
  .description("Create a new stablecoin mint")
  .requiredOption("--name <string>", "Token name")
  .requiredOption("--symbol <string>", "Token symbol")
  .option("--uri <string>", "Metadata URI", "")
  .option("--decimals <number>", "Decimal places", "6")
  .option("--preset <string>", "Preset: sss-1, sss-2, or sss-3", "sss-1")
  .option("--transfer-hook-program <string>", "Transfer hook program ID (SSS-2/3)")
  .option("--treasury <string>", "Treasury address (SSS-2/3)")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      const preset = parsePreset(opts.preset);
      const transferHookProgram = opts.transferHookProgram ? new PublicKey(opts.transferHookProgram) : undefined;
      const treasury = opts.treasury ? new PublicKey(opts.treasury) : undefined;

      console.log(chalk.blue(`Creating ${opts.preset.toUpperCase()} stablecoin: ${opts.name} (${opts.symbol})`));

      const { signature, mint, config } = await stablecoin.createMint({
        name: opts.name,
        symbol: opts.symbol,
        uri: opts.uri,
        decimals: parseInt(opts.decimals),
        preset,
        transferHookProgram,
        treasury,
      });

      console.log(chalk.green("Mint created successfully"));
      console.log(chalk.green("  Mint:"), mint.toBase58());
      console.log(chalk.green("  Config:"), config.toBase58());
      console.log(chalk.green("  Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === mint ===
program
  .command("mint")
  .description("Mint tokens to an account")
  .requiredOption("--mint <string>", "Mint address")
  .requiredOption("--to <string>", "Destination token account")
  .requiredOption("--amount <string>", "Amount to mint")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue(`Minting ${opts.amount} tokens`));
      const signature = await stablecoin.mintTo({
        mint: new PublicKey(opts.mint),
        to: new PublicKey(opts.to),
        amount: new BN(opts.amount),
      });
      console.log(chalk.green("Tokens minted. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === burn ===
program
  .command("burn")
  .description("Burn tokens from an account (permanent delegate)")
  .requiredOption("--mint <string>", "Mint address")
  .requiredOption("--from <string>", "Source token account")
  .requiredOption("--amount <string>", "Amount to burn")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue(`Burning ${opts.amount} tokens`));
      const signature = await stablecoin.burnFrom({
        mint: new PublicKey(opts.mint),
        from: new PublicKey(opts.from),
        amount: new BN(opts.amount),
      });
      console.log(chalk.green("Tokens burned. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === seize ===
program
  .command("seize")
  .description("Seize tokens via burn+mint (Seizer role)")
  .requiredOption("--mint <string>", "Mint address")
  .requiredOption("--from <string>", "Source token account to seize from")
  .requiredOption("--treasury-ata <string>", "Treasury ATA to receive minted tokens")
  .requiredOption("--amount <string>", "Amount to seize")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue(`Seizing ${opts.amount} tokens`));
      const signature = await stablecoin.seize({
        mint: new PublicKey(opts.mint),
        from: new PublicKey(opts.from),
        treasuryAta: new PublicKey(opts.treasuryAta),
        amount: new BN(opts.amount),
      });
      console.log(chalk.green("Tokens seized. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === grant-role ===
program
  .command("grant-role")
  .description("Grant a role to a wallet")
  .requiredOption("--mint <string>", "Mint address")
  .requiredOption("--holder <string>", "Wallet to grant role to")
  .requiredOption("--role <string>", "Role: minter, burner, seizer, pauser, compliance")
  .option("--allowance <string>", "Allowance for minter role", "0")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      const role = parseRole(opts.role);
      console.log(chalk.blue(`Granting ${opts.role} role`));
      const signature = await stablecoin.grantRole({
        mint: new PublicKey(opts.mint),
        holder: new PublicKey(opts.holder),
        role,
        allowance: new BN(opts.allowance),
      });
      console.log(chalk.green("Role granted. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === revoke-role ===
program
  .command("revoke-role")
  .description("Revoke a role from a wallet")
  .requiredOption("--mint <string>", "Mint address")
  .requiredOption("--holder <string>", "Wallet to revoke role from")
  .requiredOption("--role <string>", "Role to revoke")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      const role = parseRole(opts.role);
      console.log(chalk.blue(`Revoking ${opts.role} role`));
      const signature = await stablecoin.revokeRole(
        new PublicKey(opts.mint),
        new PublicKey(opts.holder),
        role
      );
      console.log(chalk.green("Role revoked. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === increment-allowance ===
program
  .command("increment-allowance")
  .description("Increment minter allowance")
  .requiredOption("--mint <string>", "Mint address")
  .requiredOption("--minter <string>", "Minter wallet address")
  .requiredOption("--amount <string>", "Amount to increment")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue(`Incrementing allowance by ${opts.amount}`));
      const signature = await stablecoin.incrementAllowance(
        new PublicKey(opts.mint),
        new PublicKey(opts.minter),
        new BN(opts.amount)
      );
      console.log(chalk.green("Allowance incremented. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === blacklist ===
program
  .command("blacklist")
  .description("Add wallet to blacklist")
  .requiredOption("--mint <string>", "Mint address")
  .requiredOption("--wallet <string>", "Wallet to blacklist")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue("Blacklisting wallet"));
      const signature = await stablecoin.blacklist({
        mint: new PublicKey(opts.mint),
        wallet: new PublicKey(opts.wallet),
      });
      console.log(chalk.green("Wallet blacklisted. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === unblacklist ===
program
  .command("unblacklist")
  .description("Remove wallet from blacklist")
  .requiredOption("--mint <string>", "Mint address")
  .requiredOption("--wallet <string>", "Wallet to unblacklist")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue("Unblacklisting wallet"));
      const signature = await stablecoin.unblacklist({
        mint: new PublicKey(opts.mint),
        wallet: new PublicKey(opts.wallet),
      });
      console.log(chalk.green("Wallet unblacklisted. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === pause / unpause ===
program
  .command("pause")
  .description("Pause stablecoin")
  .requiredOption("--mint <string>", "Mint address")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue("Pausing stablecoin"));
      const signature = await stablecoin.pause(new PublicKey(opts.mint));
      console.log(chalk.green("Stablecoin paused. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

program
  .command("unpause")
  .description("Unpause stablecoin")
  .requiredOption("--mint <string>", "Mint address")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue("Unpausing stablecoin"));
      const signature = await stablecoin.unpause(new PublicKey(opts.mint));
      console.log(chalk.green("Stablecoin unpaused. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === transfer-admin / accept-admin ===
program
  .command("transfer-admin")
  .description("Initiate admin transfer (two-step)")
  .requiredOption("--mint <string>", "Mint address")
  .requiredOption("--new-admin <string>", "New admin address")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue("Initiating admin transfer"));
      const signature = await stablecoin.transferAdmin(
        new PublicKey(opts.mint),
        new PublicKey(opts.newAdmin)
      );
      console.log(chalk.green("Admin transfer initiated. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

program
  .command("accept-admin")
  .description("Accept pending admin transfer")
  .requiredOption("--mint <string>", "Mint address")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue("Accepting admin transfer"));
      const signature = await stablecoin.acceptAdmin(new PublicKey(opts.mint));
      console.log(chalk.green("Admin transfer accepted. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === freeze / thaw ===
program
  .command("freeze")
  .description("Freeze a token account (ComplianceOfficer)")
  .requiredOption("--mint <string>", "Mint address")
  .requiredOption("--account <string>", "Token account to freeze")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue("Freezing account"));
      const signature = await stablecoin.freezeAccount(
        new PublicKey(opts.mint),
        new PublicKey(opts.account)
      );
      console.log(chalk.green("Account frozen. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

program
  .command("thaw")
  .description("Thaw a token account (ComplianceOfficer)")
  .requiredOption("--mint <string>", "Mint address")
  .requiredOption("--account <string>", "Token account to thaw")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue("Thawing account"));
      const signature = await stablecoin.thawAccount(
        new PublicKey(opts.mint),
        new PublicKey(opts.account)
      );
      console.log(chalk.green("Account thawed. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === init-hook ===
program
  .command("init-hook")
  .description("Initialize transfer hook for SSS-2/SSS-3 mint")
  .requiredOption("--mint <string>", "Mint address")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue("Initializing transfer hook"));
      const signature = await stablecoin.initializeHook(new PublicKey(opts.mint));
      console.log(chalk.green("Transfer hook initialized. Signature:"), signature);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === info ===
program
  .command("info")
  .description("Get stablecoin info")
  .requiredOption("--mint <string>", "Mint address")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue("Fetching stablecoin info"));
      const info = await stablecoin.getStablecoinInfo(new PublicKey(opts.mint));

      const presetName = info.preset === 0 ? "SSS-1" : info.preset === 1 ? "SSS-2" : "SSS-3";
      console.log(chalk.green("Stablecoin info"));
      console.log(chalk.green("  Admin:"), info.admin.toBase58());
      console.log(chalk.green("  Pending Admin:"), info.pendingAdmin.toBase58());
      console.log(chalk.green("  Mint:"), info.mint.toBase58());
      console.log(chalk.green("  Preset:"), presetName);
      console.log(chalk.green("  Paused:"), info.paused);
      console.log(chalk.green("  Total Minted:"), info.totalMinted.toString());
      console.log(chalk.green("  Total Burned:"), info.totalBurned.toString());
      console.log(chalk.green("  Total Seized:"), info.totalSeized.toString());
      if (info.transferHookProgram) {
        console.log(chalk.green("  Transfer Hook:"), info.transferHookProgram.toBase58());
      }
      if (info.treasury) {
        console.log(chalk.green("  Treasury:"), info.treasury.toBase58());
      }
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === set-metadata ===
program
  .command("set-metadata")
  .description("Set token metadata (name, symbol, URI)")
  .requiredOption("--mint <pubkey>", "Mint address")
  .requiredOption("--name <string>", "Token name")
  .requiredOption("--symbol <string>", "Token symbol")
  .requiredOption("--uri <string>", "Token URI")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      console.log(chalk.blue("Setting metadata..."));
      const sig = await stablecoin.setMetadata({
        mint: new PublicKey(opts.mint),
        name: opts.name,
        symbol: opts.symbol,
        uri: opts.uri,
      });
      console.log(chalk.green("Metadata set:"), sig);
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === role-info ===
program
  .command("role-info")
  .description("Get role information for a holder")
  .requiredOption("--mint <pubkey>", "Mint address")
  .requiredOption("--holder <pubkey>", "Role holder address")
  .requiredOption("--role <string>", "Role: minter, burner, seizer, pauser, compliance-officer")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      const roleMap: Record<string, Role> = {
        minter: Role.Minter,
        burner: Role.Burner,
        seizer: Role.Seizer,
        pauser: Role.Pauser,
        "compliance-officer": Role.ComplianceOfficer,
      };
      const role = roleMap[opts.role];
      if (role === undefined) {
        console.error(chalk.red("Invalid role. Use: minter, burner, seizer, pauser, compliance-officer"));
        process.exit(1);
      }
      const info = await stablecoin.getRoleInfo(new PublicKey(opts.mint), new PublicKey(opts.holder), role);
      if (info) {
        console.log(chalk.green("Role info:"));
        console.log(chalk.green("  Holder:"), info.holder.toBase58());
        console.log(chalk.green("  Role:"), opts.role);
        console.log(chalk.green("  Allowance:"), info.allowance.toString());
      } else {
        console.log(chalk.yellow("No role found for this holder"));
      }
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// === is-blacklisted ===
program
  .command("is-blacklisted")
  .description("Check if a wallet is blacklisted")
  .requiredOption("--mint <pubkey>", "Mint address")
  .requiredOption("--wallet <pubkey>", "Wallet address to check")
  .action(async (opts) => {
    const parent = program.opts();
    try {
      const provider = getProvider(parent.url, parent.keypair);
      const stablecoin = getStablecoin(provider);
      const blacklisted = await stablecoin.isBlacklisted(new PublicKey(opts.mint), new PublicKey(opts.wallet));
      if (blacklisted) {
        console.log(chalk.red("Wallet is BLACKLISTED"));
      } else {
        console.log(chalk.green("Wallet is NOT blacklisted"));
      }
    } catch (error: any) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

program.parse();
