#!/usr/bin/env node

import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import chalk from "chalk";
import {
  createSdk,
  parseRole,
  logSuccess,
  logError,
  formatAmount,
  formatPubkey,
  getConnectionAndKeypair,
} from "./utils";

const program = new Command();

program
  .name("sss")
  .description("CLI for Solana Stablecoin Standard")
  .version("0.1.0")
  .option("--rpc-url <url>", "Solana RPC URL", "https://api.devnet.solana.com")
  .option("--keypair <path>", "Path to keypair file", "~/.config/solana/id.json");

// Helper: get global opts
function globalOpts() {
  const opts = program.opts<{ rpcUrl: string; keypair: string }>();
  return opts;
}

// ─── info <mint> ────────────────────────────────────────────────────────────
program
  .command("info <mint>")
  .description("Get stablecoin info")
  .action(async (mintStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const mint = new PublicKey(mintStr);
      const info = await sdk.getStablecoinInfo(mint);

      const presetName =
        info.preset === 0 ? "SSS-1" : info.preset === 1 ? "SSS-2" : "SSS-3";

      console.log("");
      console.log("  Stablecoin Info");
      console.log("  ─────────────────────────────────────────────────────");
      console.log(`  Admin            : ${info.admin.toBase58()}`);
      console.log(`  Pending Admin    : ${info.pendingAdmin.toBase58()}`);
      console.log(`  Mint             : ${info.mint.toBase58()}`);
      console.log(`  Preset           : ${presetName}`);
      console.log(`  Paused           : ${info.paused ? "YES" : "no"}`);
      console.log(`  Treasury         : ${info.treasury ? info.treasury.toBase58() : "(none)"}`);
      console.log(`  Total Minted     : ${formatAmount(info.totalMinted)}`);
      console.log(`  Total Burned     : ${formatAmount(info.totalBurned)}`);
      console.log(`  Total Seized     : ${formatAmount(info.totalSeized)}`);
      console.log(
        `  Transfer Hook    : ${info.transferHookProgram ? info.transferHookProgram.toBase58() : "(none)"}`
      );
      console.log("  ─────────────────────────────────────────────────────");
      console.log("");
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── mint-to <mint> <to-ata> <amount> ───────────────────────────────────────
program
  .command("mint-to <mint> <toAta> <amount>")
  .description("Mint tokens to a token account")
  .option("--to-owner <owner>", "Owner of the destination ATA (for blacklist check)")
  .action(async (mintStr: string, toAtaStr: string, amountStr: string, opts: { toOwner?: string }) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const sig = await sdk.mintTo({
        mint: new PublicKey(mintStr),
        to: new PublicKey(toAtaStr),
        amount: new BN(amountStr),
        toOwner: opts.toOwner ? new PublicKey(opts.toOwner) : undefined,
      });
      logSuccess(`Minted ${formatAmount({ toString: () => amountStr })} tokens. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── burn-from <mint> <from-ata> <amount> ───────────────────────────────────
program
  .command("burn-from <mint> <fromAta> <amount>")
  .description("Burn tokens from a token account (permanent delegate)")
  .requiredOption("--from-owner <owner>", "Owner of the source ATA")
  .action(async (mintStr: string, fromAtaStr: string, amountStr: string, opts: { fromOwner: string }) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const sig = await sdk.burnFrom({
        mint: new PublicKey(mintStr),
        from: new PublicKey(fromAtaStr),
        amount: new BN(amountStr),
        fromOwner: new PublicKey(opts.fromOwner),
      });
      logSuccess(`Burned ${formatAmount({ toString: () => amountStr })} tokens. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── seize <mint> <from-ata> <treasury-ata> <amount> ───────────────────────
program
  .command("seize <mint> <fromAta> <treasuryAta> <amount>")
  .description("Seize tokens via burn+mint (Seizer role)")
  .requiredOption("--from-owner <owner>", "Owner of the source ATA")
  .action(async (
    mintStr: string,
    fromAtaStr: string,
    treasuryAtaStr: string,
    amountStr: string,
    opts: { fromOwner: string }
  ) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const sig = await sdk.seize({
        mint: new PublicKey(mintStr),
        from: new PublicKey(fromAtaStr),
        treasuryAta: new PublicKey(treasuryAtaStr),
        amount: new BN(amountStr),
        fromOwner: new PublicKey(opts.fromOwner),
      });
      logSuccess(`Seized ${formatAmount({ toString: () => amountStr })} tokens. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── grant-role <mint> <holder> <role> [allowance] ──────────────────────────
program
  .command("grant-role <mint> <holder> <role> [allowance]")
  .description("Grant a role to a wallet")
  .action(async (mintStr: string, holderStr: string, roleStr: string, allowanceStr?: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const role = parseRole(roleStr);
      const sig = await sdk.grantRole({
        mint: new PublicKey(mintStr),
        holder: new PublicKey(holderStr),
        role,
        allowance: new BN(allowanceStr ?? "0"),
      });
      logSuccess(`Role '${roleStr}' granted to ${formatPubkey(new PublicKey(holderStr))}. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── revoke-role <mint> <holder> <role> ─────────────────────────────────────
program
  .command("revoke-role <mint> <holder> <role>")
  .description("Revoke a role from a wallet")
  .action(async (mintStr: string, holderStr: string, roleStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const role = parseRole(roleStr);
      const sig = await sdk.revokeRole(
        new PublicKey(mintStr),
        new PublicKey(holderStr),
        role
      );
      logSuccess(`Role '${roleStr}' revoked from ${formatPubkey(new PublicKey(holderStr))}. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── increment-allowance <mint> <minter> <amount> ───────────────────────────
program
  .command("increment-allowance <mint> <minter> <amount>")
  .description("Increment minter allowance")
  .action(async (mintStr: string, minterStr: string, amountStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const sig = await sdk.incrementAllowance(
        new PublicKey(mintStr),
        new PublicKey(minterStr),
        new BN(amountStr)
      );
      logSuccess(`Allowance incremented by ${formatAmount({ toString: () => amountStr })}. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── blacklist <mint> <wallet> ───────────────────────────────────────────────
program
  .command("blacklist <mint> <wallet>")
  .description("Add wallet to blacklist")
  .action(async (mintStr: string, walletStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const sig = await sdk.blacklist({
        mint: new PublicKey(mintStr),
        wallet: new PublicKey(walletStr),
      });
      logSuccess(`Wallet ${formatPubkey(new PublicKey(walletStr))} blacklisted. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── unblacklist <mint> <wallet> ────────────────────────────────────────────
program
  .command("unblacklist <mint> <wallet>")
  .description("Remove wallet from blacklist")
  .action(async (mintStr: string, walletStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const sig = await sdk.unblacklist({
        mint: new PublicKey(mintStr),
        wallet: new PublicKey(walletStr),
      });
      logSuccess(`Wallet ${formatPubkey(new PublicKey(walletStr))} unblacklisted. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── freeze <mint> <token-account> ──────────────────────────────────────────
program
  .command("freeze <mint> <tokenAccount>")
  .description("Freeze a token account (ComplianceOfficer or Admin)")
  .action(async (mintStr: string, tokenAccountStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const sig = await sdk.freezeAccount(
        new PublicKey(mintStr),
        new PublicKey(tokenAccountStr)
      );
      logSuccess(`Account ${formatPubkey(new PublicKey(tokenAccountStr))} frozen. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── thaw <mint> <token-account> ────────────────────────────────────────────
program
  .command("thaw <mint> <tokenAccount>")
  .description("Thaw a token account (ComplianceOfficer or Admin)")
  .action(async (mintStr: string, tokenAccountStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const sig = await sdk.thawAccount(
        new PublicKey(mintStr),
        new PublicKey(tokenAccountStr)
      );
      logSuccess(`Account ${formatPubkey(new PublicKey(tokenAccountStr))} thawed. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── pause <mint> ───────────────────────────────────────────────────────────
program
  .command("pause <mint>")
  .description("Pause the stablecoin")
  .action(async (mintStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const sig = await sdk.pause(new PublicKey(mintStr));
      logSuccess(`Stablecoin paused. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── unpause <mint> ─────────────────────────────────────────────────────────
program
  .command("unpause <mint>")
  .description("Unpause the stablecoin")
  .action(async (mintStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const sig = await sdk.unpause(new PublicKey(mintStr));
      logSuccess(`Stablecoin unpaused. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── transfer-admin <mint> <new-admin> ──────────────────────────────────────
program
  .command("transfer-admin <mint> <newAdmin>")
  .description("Initiate admin transfer (two-step)")
  .action(async (mintStr: string, newAdminStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const sig = await sdk.transferAdmin(
        new PublicKey(mintStr),
        new PublicKey(newAdminStr)
      );
      logSuccess(`Admin transfer initiated to ${formatPubkey(new PublicKey(newAdminStr))}. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── accept-admin <mint> ────────────────────────────────────────────────────
program
  .command("accept-admin <mint>")
  .description("Accept pending admin transfer")
  .action(async (mintStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const sig = await sdk.acceptAdmin(new PublicKey(mintStr));
      logSuccess(`Admin transfer accepted. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── init-hook <mint> ───────────────────────────────────────────────────────
program
  .command("init-hook <mint>")
  .description("Initialize transfer hook for SSS-2/SSS-3 mint")
  .action(async (mintStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const sig = await sdk.initializeHook(new PublicKey(mintStr));
      logSuccess(`Transfer hook initialized. Signature: ${sig}`);
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── is-blacklisted <mint> <wallet> ─────────────────────────────────────────
program
  .command("is-blacklisted <mint> <wallet>")
  .description("Check if a wallet is blacklisted")
  .action(async (mintStr: string, walletStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const result = await sdk.isBlacklisted(
        new PublicKey(mintStr),
        new PublicKey(walletStr)
      );
      if (result) {
        console.log(`Wallet ${walletStr} is BLACKLISTED`);
      } else {
        logSuccess(`Wallet ${walletStr} is NOT blacklisted`);
      }
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── role-info <mint> <holder> <role> ───────────────────────────────────────
program
  .command("role-info <mint> <holder> <role>")
  .description("Get role information for a holder")
  .action(async (mintStr: string, holderStr: string, roleStr: string) => {
    const { rpcUrl, keypair } = globalOpts();
    try {
      const sdk = createSdk(rpcUrl, keypair);
      const role = parseRole(roleStr);
      const info = await sdk.getRoleInfo(
        new PublicKey(mintStr),
        new PublicKey(holderStr),
        role
      );
      if (info) {
        console.log("");
        console.log("  Role Info");
        console.log("  ─────────────────────────────────────");
        console.log(`  Holder    : ${info.holder.toBase58()}`);
        console.log(`  Role      : ${roleStr}`);
        console.log(`  Allowance : ${formatAmount(info.allowance)}`);
        console.log("  ─────────────────────────────────────");
        console.log("");
      } else {
        console.log(`No role '${roleStr}' found for holder ${formatPubkey(new PublicKey(holderStr))}`);
      }
    } catch (err: unknown) {
      logError(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── oracle-price <feed> ─────────────────────────────────────────────────────
program
  .command("oracle-price <feed>")
  .description("Get price from a Pyth oracle feed (address or name like USDC/USD)")
  .action(async (feed: string) => {
    const { rpcUrl } = globalOpts();
    try {
      const { connection } = getConnectionAndKeypair(rpcUrl);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PriceFeedMonitor, PYTH_FEEDS_DEVNET } = require("@sss/sdk");
      const monitor = new PriceFeedMonitor(connection);

      let feedPk: PublicKey;
      if (PYTH_FEEDS_DEVNET[feed]) {
        feedPk = PYTH_FEEDS_DEVNET[feed];
      } else {
        feedPk = new PublicKey(feed);
      }

      const price = await monitor.getPrice(feedPk);
      console.log(`\n  Feed:       ${price.feedAddress}`);
      console.log(`  Price:      $${price.price.toFixed(6)}`);
      console.log(`  Confidence: ±$${price.confidence.toFixed(6)}`);
      console.log(`  Status:     ${price.status}`);
      console.log(`  Published:  ${new Date(price.publishTime * 1000).toISOString()}\n`);
    } catch (err: unknown) {
      logError((err as Error).message);
      process.exit(1);
    }
  });

// ─── oracle-check-peg <feed> ─────────────────────────────────────────────────
program
  .command("oracle-check-peg <feed>")
  .description("Check stablecoin peg status against $1.00")
  .option("--target <price>", "Target peg price", "1.0")
  .option("--tolerance <bps>", "Tolerance in basis points", "50")
  .action(async (feed: string, opts: { target: string; tolerance: string }) => {
    const { rpcUrl } = globalOpts();
    try {
      const { connection } = getConnectionAndKeypair(rpcUrl);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PriceFeedMonitor, PYTH_FEEDS_DEVNET } = require("@sss/sdk");
      const monitor = new PriceFeedMonitor(connection);

      let feedPk: PublicKey;
      if (PYTH_FEEDS_DEVNET[feed]) {
        feedPk = PYTH_FEEDS_DEVNET[feed];
      } else {
        feedPk = new PublicKey(feed);
      }

      const pegStatus = await monitor.checkPeg(
        feedPk,
        parseFloat(opts.target),
        parseInt(opts.tolerance)
      );
      const statusColor =
        pegStatus.status === "pegged"
          ? chalk.green
          : pegStatus.status === "warning"
          ? chalk.yellow
          : chalk.red;

      console.log(`\n  Price:      $${pegStatus.price.toFixed(6)}`);
      console.log(`  Target:     $${pegStatus.targetPrice.toFixed(2)}`);
      console.log(`  Deviation:  ${pegStatus.deviationBps} bps`);
      console.log(`  Tolerance:  ${pegStatus.toleranceBps} bps`);
      console.log(`  Status:     ${statusColor(pegStatus.status.toUpperCase())}`);
      console.log(`  Pegged:     ${pegStatus.isPegged ? chalk.green("YES") : chalk.red("NO")}\n`);
    } catch (err: unknown) {
      logError((err as Error).message);
      process.exit(1);
    }
  });

program.parse();
