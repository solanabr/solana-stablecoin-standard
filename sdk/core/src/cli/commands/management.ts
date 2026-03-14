import { Command } from "commander";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

import { resolveCliContext } from "../context";
import { renderKeyValueLines, writeStructuredOutput } from "../output";
import {
  getRoleAddress,
  getQuotaAddress,
  getConfigAddress,
  ROLE_MINTER,
  ROLE_FREEZER,
  ROLE_BLACKLISTER,
  ROLE_SEIZER,
} from "../../pda";
import { loadProgram, getProgramId, IDL_NOT_FOUND_MSG } from "../program";

const ROLE_NAMES: Record<number, string> = {
  0: "admin",
  1: "minter",
  2: "pauser",
  3: "freezer",
  4: "blacklister",
  5: "seizer",
};

function parseRole(name: string): number {
  const lower = name.toLowerCase();
  for (const [num, roleName] of Object.entries(ROLE_NAMES)) {
    if (roleName === lower) return Number(num);
  }
  const parsed = parseInt(name, 10);
  if (!isNaN(parsed) && parsed >= 0 && parsed <= 5) return parsed;
  throw new Error(`Unknown role: ${name}. Valid roles: ${Object.values(ROLE_NAMES).join(", ")}`);
}

export function registerManagementCommands(program: Command): void {
  // ---------------------------------------------------------------
  // Role management
  // ---------------------------------------------------------------
  const roles = program.command("roles").description("Role management");

  roles
    .command("grant <role> <address>")
    .description("Grant a role to an address")
    .action(async function (this: Command, role: string, address: string) {
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
        const programId = getProgramId(context.config);
        const mint = new PublicKey(context.config.mintAddress);
        const [configPda] = getConfigAddress(programId, mint);
        const roleNum = parseRole(role);
        const holder = new PublicKey(address);
        const [roleAssignment] = getRoleAddress(programId, roleNum, configPda, holder);

        const tx = await anchorProgram.methods
          .grantRole(roleNum, holder)
          .accountsPartial({
            authority,
            config: configPda,
            roleAssignment,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const payload = { command: "roles grant", txSignature: tx, role: ROLE_NAMES[roleNum] ?? String(roleNum), address };
        const text = [
          "Role granted",
          renderKeyValueLines([
            ["tx", tx],
            ["role", ROLE_NAMES[roleNum] ?? String(roleNum)],
            ["holder", address],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Grant role failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  roles
    .command("revoke <role> <address>")
    .description("Revoke a role from an address")
    .action(async function (this: Command, role: string, address: string) {
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
        const programId = getProgramId(context.config);
        const mint = new PublicKey(context.config.mintAddress);
        const [configPda] = getConfigAddress(programId, mint);
        const roleNum = parseRole(role);
        const holder = new PublicKey(address);
        const [roleAssignment] = getRoleAddress(programId, roleNum, configPda, holder);

        const tx = await anchorProgram.methods
          .revokeRole(roleNum, holder)
          .accountsPartial({
            authority,
            config: configPda,
            roleAssignment,
          })
          .rpc();

        const payload = { command: "roles revoke", txSignature: tx, role: ROLE_NAMES[roleNum] ?? String(roleNum), address };
        const text = [
          "Role revoked",
          renderKeyValueLines([
            ["tx", tx],
            ["role", ROLE_NAMES[roleNum] ?? String(roleNum)],
            ["holder", address],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Revoke role failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  roles
    .command("check <role> <address>")
    .description("Check if an address has a role")
    .action(async function (this: Command, role: string, address: string) {
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
        const programId = getProgramId(context.config);
        const mint = new PublicKey(context.config.mintAddress);
        const [configPda] = getConfigAddress(programId, mint);
        const roleNum = parseRole(role);
        const holder = new PublicKey(address);
        const [roleAssignment] = getRoleAddress(programId, roleNum, configPda, holder);

        let hasRole = false;
        try {
          const account = await loaded.program.account.roleAssignment.fetch(roleAssignment);
          hasRole = account.active as boolean;
        } catch {
          hasRole = false;
        }

        const payload = { command: "roles check", role: ROLE_NAMES[roleNum] ?? String(roleNum), address, hasRole };
        const text = [
          `Role check: ${hasRole ? "HAS ROLE" : "NO ROLE"}`,
          renderKeyValueLines([
            ["role", ROLE_NAMES[roleNum] ?? String(roleNum)],
            ["holder", address],
            ["hasRole", hasRole],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Check role failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  // ---------------------------------------------------------------
  // Minter management (convenience wrappers)
  // ---------------------------------------------------------------
  const minters = program.command("minters").description("Minter management");

  minters
    .command("add <address>")
    .description("Add a minter (grant role + set quota)")
    .requiredOption("--quota <amount>", "Per-minter quota (base units)")
    .action(async function (this: Command, address: string, options: { quota: string }) {
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
        const programId = getProgramId(context.config);
        const mint = new PublicKey(context.config.mintAddress);
        const [configPda] = getConfigAddress(programId, mint);
        const minter = new PublicKey(address);
        const [roleAssignment] = getRoleAddress(programId, ROLE_MINTER, configPda, minter);
        const [minterQuota] = getQuotaAddress(programId, configPda, minter);

        // Step 1: Grant minter role
        const tx1 = await anchorProgram.methods
          .grantRole(ROLE_MINTER, minter)
          .accountsPartial({
            authority,
            config: configPda,
            roleAssignment,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        // Step 2: Set quota
        const quotaLimit = new BN(options.quota);
        const tx2 = await anchorProgram.methods
          .setQuota(minter, quotaLimit)
          .accountsPartial({
            authority,
            config: configPda,
            minterRole: roleAssignment,
            minterQuota,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const payload = { command: "minters add", grantTx: tx1, quotaTx: tx2, address, quota: options.quota };
        const text = [
          "Minter added",
          renderKeyValueLines([
            ["grantRole tx", tx1],
            ["setQuota tx", tx2],
            ["minter", address],
            ["quota", options.quota],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Add minter failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  minters
    .command("remove <address>")
    .description("Remove a minter (revoke role)")
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
        const programId = getProgramId(context.config);
        const mint = new PublicKey(context.config.mintAddress);
        const [configPda] = getConfigAddress(programId, mint);
        const minter = new PublicKey(address);
        const [roleAssignment] = getRoleAddress(programId, ROLE_MINTER, configPda, minter);

        const tx = await anchorProgram.methods
          .revokeRole(ROLE_MINTER, minter)
          .accountsPartial({
            authority,
            config: configPda,
            roleAssignment,
          })
          .rpc();

        const payload = { command: "minters remove", txSignature: tx, address };
        const text = [
          "Minter removed",
          renderKeyValueLines([
            ["tx", tx],
            ["minter", address],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Remove minter failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  minters
    .command("quota <address>")
    .description("Check a minter's quota usage")
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
        const programId = getProgramId(context.config);
        const mint = new PublicKey(context.config.mintAddress);
        const [configPda] = getConfigAddress(programId, mint);
        const minter = new PublicKey(address);
        const [minterQuota] = getQuotaAddress(programId, configPda, minter);

        const quotaAccount = await loaded.program.account.minterQuota.fetch(minterQuota);
        const limit = quotaAccount.quotaLimit as BN;
        const minted = quotaAccount.mintedAmount as BN;
        const remaining = limit.sub(minted);

        const payload = {
          command: "minters quota",
          minter: address,
          quotaLimit: limit.toString(),
          mintedAmount: minted.toString(),
          remaining: remaining.toString(),
        };
        const text = [
          "Minter quota",
          renderKeyValueLines([
            ["minter", address],
            ["quotaLimit", limit.toString()],
            ["mintedAmount", minted.toString()],
            ["remaining", remaining.toString()],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Quota check failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  // ---------------------------------------------------------------
  // Holders
  // ---------------------------------------------------------------
  program
    .command("holders")
    .description("List token holders")
    .option("--min-balance <amount>", "Minimum balance filter")
    .action(async function (this: Command, options: { minBalance?: string }) {
      const context = resolveCliContext(this);

      if (!context.config.mintAddress) {
        const msg = "No mint address set. Use: sss-token config set mintAddress <address>";
        writeStructuredOutput(context, { error: msg }, msg);
        process.exitCode = 1;
        return;
      }

      try {
        const { createProvider: cp } = await import("../program");
        const provider = cp(context.config);
        const mint = new PublicKey(context.config.mintAddress);

        const accounts = await provider.connection.getTokenLargestAccounts(mint);
        const holders = accounts.value
          .filter((a) => {
            if (options.minBalance) {
              return Number(a.amount) >= Number(options.minBalance);
            }
            return Number(a.amount) > 0;
          })
          .map((a) => ({
            address: a.address.toBase58(),
            amount: a.amount,
          }));

        const payload = { command: "holders", mint: mint.toBase58(), holders };
        const text = [
          `Token holders (${holders.length})`,
          ...holders.map((h, i) => `  ${i + 1}. ${h.address}  balance: ${h.amount}`),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Holders query failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  // ---------------------------------------------------------------
  // Supply cap
  // ---------------------------------------------------------------
  program
    .command("set-supply-cap <cap>")
    .description("Set the supply cap (0 = unlimited, authority only)")
    .action(async function (this: Command, cap: string) {
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
        const programId = getProgramId(context.config);
        const mint = new PublicKey(context.config.mintAddress);
        const [configPda] = getConfigAddress(programId, mint);

        const newCap = new BN(cap);
        const tx = await anchorProgram.methods
          .setSupplyCap(newCap)
          .accountsPartial({
            authority,
            config: configPda,
          })
          .rpc();

        const payload = { command: "set-supply-cap", txSignature: tx, cap };
        const text = [
          "Supply cap updated",
          renderKeyValueLines([
            ["tx", tx],
            ["newCap", cap === "0" ? "unlimited" : cap],
          ]),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Set supply cap failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  // ---------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------
  program
    .command("audit-log")
    .description("Show recent program transactions")
    .option("--limit <n>", "Max events", "20")
    .action(async function (this: Command, options: { limit?: string }) {
      const context = resolveCliContext(this);

      if (!context.config.mintAddress) {
        const msg = "No mint address set. Use: sss-token config set mintAddress <address>";
        writeStructuredOutput(context, { error: msg }, msg);
        process.exitCode = 1;
        return;
      }

      try {
        const { createProvider: cp } = await import("../program");
        const provider = cp(context.config);
        const programId = getProgramId(context.config);
        const mint = new PublicKey(context.config.mintAddress);
        const [configAddress] = getConfigAddress(programId, mint);

        const limit = Number(options.limit ?? 20);
        const sigs = await provider.connection.getSignaturesForAddress(configAddress, { limit });

        const events = sigs.map((s) => ({
          signature: s.signature,
          slot: s.slot,
          err: s.err ? JSON.stringify(s.err) : null,
          memo: s.memo ?? null,
        }));

        const payload = { command: "audit-log", config: configAddress.toBase58(), events };
        const text = [
          `Audit log (${events.length} transactions)`,
          ...events.map((e, i) =>
            `  ${i + 1}. ${e.signature.slice(0, 20)}... slot=${e.slot}${e.err ? " ERR" : " OK"}`,
          ),
        ].join("\n");
        writeStructuredOutput(context, payload, text);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeStructuredOutput(context, { error: msg }, `Audit log failed: ${msg}`);
        process.exitCode = 1;
      }
    });
}
