import * as blessed from "blessed";
import * as contrib from "blessed-contrib";
import {
  Connection,
  PublicKey,
  GetProgramAccountsFilter,
  ConfirmedSignatureInfo,
} from "@solana/web3.js";
import * as crypto from "crypto";

// ─── Constants ───────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey(
  "G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL"
);

const REFRESH_INTERVAL_MS = 10_000;

const ROLE_NAMES: Record<number, string> = {
  0: "Admin",
  1: "Minter",
  2: "Pauser",
  3: "Freezer",
  4: "Blacklister",
  5: "Seizer",
};

// ─── Discriminator helpers ───────────────────────────────────────────────────

function accountDiscriminator(name: string): Buffer {
  const hash = crypto.createHash("sha256").update(`account:${name}`).digest();
  return hash.subarray(0, 8);
}

const DISCRIMINATORS = {
  StablecoinConfig: accountDiscriminator("StablecoinConfig"),
  RoleAssignment: accountDiscriminator("RoleAssignment"),
  BlacklistEntry: accountDiscriminator("BlacklistEntry"),
  OracleConfig: accountDiscriminator("OracleConfig"),
  AllowlistEntry: accountDiscriminator("AllowlistEntry"),
};

// ─── Account types ───────────────────────────────────────────────────────────

interface StablecoinConfig {
  authority: PublicKey;
  pendingAuthority: PublicKey;
  mint: PublicKey;
  transferHookProgram: PublicKey;
  paused: boolean;
  complianceEnabled: boolean;
  totalMinted: bigint;
  totalBurned: bigint;
  supplyCap: bigint;
  enableAllowlist: boolean;
  bump: number;
}

interface RoleAssignment {
  config: PublicKey;
  holder: PublicKey;
  role: number;
  active: boolean;
  grantedBy: PublicKey;
  grantedAt: bigint;
  bump: number;
}

interface BlacklistEntry {
  config: PublicKey;
  address: PublicKey;
  reason: string;
  blacklistedAt: bigint;
  blacklistedBy: PublicKey;
  active: boolean;
  bump: number;
}

interface OracleConfig {
  config: PublicKey;
  priceFeed: PublicKey;
  maxDeviationBps: number;
  maxStalenessSecs: bigint;
  enabled: boolean;
  bump: number;
}

// ─── Deserialization ─────────────────────────────────────────────────────────

function deserializeStablecoinConfig(data: Buffer): StablecoinConfig {
  let offset = 8; // skip discriminator

  const authority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const pendingAuthority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const mint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const transferHookProgram = new PublicKey(
    data.subarray(offset, offset + 32)
  );
  offset += 32;
  const paused = data[offset] !== 0;
  offset += 1;
  const complianceEnabled = data[offset] !== 0;
  offset += 1;
  const totalMinted = data.readBigUInt64LE(offset);
  offset += 8;
  const totalBurned = data.readBigUInt64LE(offset);
  offset += 8;
  const supplyCap = data.readBigUInt64LE(offset);
  offset += 8;
  const enableAllowlist = data[offset] !== 0;
  offset += 1;
  const bump = data[offset];

  return {
    authority,
    pendingAuthority,
    mint,
    transferHookProgram,
    paused,
    complianceEnabled,
    totalMinted,
    totalBurned,
    supplyCap,
    enableAllowlist,
    bump,
  };
}

function deserializeRoleAssignment(data: Buffer): RoleAssignment {
  let offset = 8;

  const config = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const holder = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const role = data[offset];
  offset += 1;
  const active = data[offset] !== 0;
  offset += 1;
  const grantedBy = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const grantedAt = data.readBigInt64LE(offset);
  offset += 8;
  const bump = data[offset];

  return { config, holder, role, active, grantedBy, grantedAt, bump };
}

function deserializeBlacklistEntry(data: Buffer): BlacklistEntry {
  let offset = 8;

  const config = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const address = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  // String: 4-byte LE length prefix + UTF-8 bytes
  const strLen = data.readUInt32LE(offset);
  offset += 4;
  const reason = data.subarray(offset, offset + strLen).toString("utf-8");
  offset += strLen;

  const blacklistedAt = data.readBigInt64LE(offset);
  offset += 8;
  const blacklistedBy = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const active = data[offset] !== 0;
  offset += 1;
  const bump = data[offset];

  return {
    config,
    address,
    reason,
    blacklistedAt,
    blacklistedBy,
    active,
    bump,
  };
}

function deserializeOracleConfig(data: Buffer): OracleConfig {
  let offset = 8;

  const config = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const priceFeed = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const maxDeviationBps = data.readUInt16LE(offset);
  offset += 2;
  const maxStalenessSecs = data.readBigUInt64LE(offset);
  offset += 8;
  const enabled = data[offset] !== 0;
  offset += 1;
  const bump = data[offset];

  return { config, priceFeed, maxDeviationBps, maxStalenessSecs, enabled, bump };
}

// ─── PDA derivation ──────────────────────────────────────────────────────────

function deriveConfigPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    PROGRAM_ID
  );
}

function deriveOraclePDA(configKey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("oracle"), configKey.toBuffer()],
    PROGRAM_ID
  );
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function shortenPubkey(pk: PublicKey | string, chars: number = 6): string {
  const s = typeof pk === "string" ? pk : pk.toBase58();
  if (s.length <= chars * 2 + 3) return s;
  return `${s.slice(0, chars)}...${s.slice(-chars)}`;
}

function formatTokenAmount(raw: bigint, decimals: number = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
}

function formatTimestamp(ts: bigint): string {
  if (ts === 0n) return "N/A";
  const d = new Date(Number(ts) * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

// ─── CLI arg parsing ─────────────────────────────────────────────────────────

function parseArgs(): { rpc: string; mint: string | null } {
  const args = process.argv.slice(2);
  let rpc = "https://api.devnet.solana.com";
  let mint: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--rpc" && args[i + 1]) {
      rpc = args[++i];
    } else if (args[i] === "--mint" && args[i + 1]) {
      mint = args[++i];
    }
  }

  return { rpc, mint };
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchStablecoinConfig(
  connection: Connection,
  configPDA: PublicKey
): Promise<StablecoinConfig | null> {
  const info = await connection.getAccountInfo(configPDA);
  if (!info || !info.data) return null;
  try {
    return deserializeStablecoinConfig(Buffer.from(info.data));
  } catch {
    return null;
  }
}

async function fetchRoleAssignments(
  connection: Connection,
  configPDA: PublicKey
): Promise<RoleAssignment[]> {
  const discriminator = DISCRIMINATORS.RoleAssignment;
  const filters: GetProgramAccountsFilter[] = [
    { memcmp: { offset: 0, bytes: discriminator.toString("base64"), encoding: "base64" as any } },
    { memcmp: { offset: 8, bytes: configPDA.toBase58() } },
  ];

  try {
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, { filters });
    return accounts
      .map((a) => {
        try {
          return deserializeRoleAssignment(Buffer.from(a.account.data));
        } catch {
          return null;
        }
      })
      .filter((r): r is RoleAssignment => r !== null);
  } catch {
    return [];
  }
}

async function fetchBlacklistEntries(
  connection: Connection,
  configPDA: PublicKey
): Promise<BlacklistEntry[]> {
  const discriminator = DISCRIMINATORS.BlacklistEntry;
  const filters: GetProgramAccountsFilter[] = [
    { memcmp: { offset: 0, bytes: discriminator.toString("base64"), encoding: "base64" as any } },
    { memcmp: { offset: 8, bytes: configPDA.toBase58() } },
  ];

  try {
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, { filters });
    return accounts
      .map((a) => {
        try {
          return deserializeBlacklistEntry(Buffer.from(a.account.data));
        } catch {
          return null;
        }
      })
      .filter((r): r is BlacklistEntry => r !== null);
  } catch {
    return [];
  }
}

async function fetchOracleConfig(
  connection: Connection,
  configPDA: PublicKey
): Promise<OracleConfig | null> {
  const [oraclePDA] = deriveOraclePDA(configPDA);
  const info = await connection.getAccountInfo(oraclePDA);
  if (!info || !info.data) return null;
  try {
    return deserializeOracleConfig(Buffer.from(info.data));
  } catch {
    return null;
  }
}

async function fetchRecentSignatures(
  connection: Connection,
  configPDA: PublicKey,
  limit: number = 10
): Promise<ConfirmedSignatureInfo[]> {
  try {
    return await connection.getSignaturesForAddress(configPDA, { limit });
  } catch {
    return [];
  }
}

// ─── TUI Dashboard ──────────────────────────────────────────────────────────

async function main() {
  const { rpc, mint: mintArg } = parseArgs();

  if (!mintArg) {
    console.error(
      "Usage: sss-tui --mint <MINT_PUBKEY> [--rpc <RPC_URL>]\n\n" +
        "  --mint   The mint address of the stablecoin (required)\n" +
        "  --rpc    Solana RPC endpoint (default: devnet)\n"
    );
    process.exit(1);
  }

  let mintPubkey: PublicKey;
  try {
    mintPubkey = new PublicKey(mintArg);
  } catch {
    console.error(`Invalid mint pubkey: ${mintArg}`);
    process.exit(1);
  }

  const connection = new Connection(rpc, "confirmed");
  const [configPDA] = deriveConfigPDA(mintPubkey);

  // ─── Create blessed screen ──────────────────────────────────────────────

  const screen = blessed.screen({
    smartCSR: true,
    title: "SSS Dashboard",
    fullUnicode: true,
  });

  const grid = new contrib.grid({ rows: 2, cols: 3, screen });

  // ─── Panel 1: Supply Overview (top-left) ────────────────────────────────

  const supplyTable = grid.set(0, 0, 1, 1, contrib.table, {
    keys: false,
    fg: "white",
    label: " Supply Overview ",
    columnSpacing: 2,
    columnWidth: [20, 24],
    style: {
      border: { fg: "cyan" },
      header: { fg: "bright-cyan", bold: true },
    },
  } as any);

  // ─── Panel 2: Recent Transactions (top-center) ─────────────────────────

  const txLog = grid.set(0, 1, 1, 1, contrib.log, {
    fg: "white",
    label: " Recent Transactions ",
    tags: true,
    style: {
      border: { fg: "yellow" },
    },
  } as any);

  // ─── Panel 3: Role Assignments (top-right) ─────────────────────────────

  const rolesTable = grid.set(0, 2, 1, 1, contrib.table, {
    keys: false,
    fg: "white",
    label: " Role Assignments ",
    columnSpacing: 2,
    columnWidth: [12, 14, 8],
    style: {
      border: { fg: "green" },
      header: { fg: "bright-green", bold: true },
    },
  } as any);

  // ─── Panel 4: Blacklist Entries (bottom-left) ──────────────────────────

  const blacklistTable = grid.set(1, 0, 1, 1, contrib.table, {
    keys: false,
    fg: "white",
    label: " Blacklist Entries ",
    columnSpacing: 2,
    columnWidth: [14, 16, 8],
    style: {
      border: { fg: "red" },
      header: { fg: "bright-red", bold: true },
    },
  } as any);

  // ─── Panel 5: Oracle Status (bottom-center) ───────────────────────────

  const oracleTable = grid.set(1, 1, 1, 1, contrib.table, {
    keys: false,
    fg: "white",
    label: " Oracle Status ",
    columnSpacing: 2,
    columnWidth: [20, 24],
    style: {
      border: { fg: "magenta" },
      header: { fg: "bright-magenta", bold: true },
    },
  } as any);

  // ─── Panel 6: System Status (bottom-right) ────────────────────────────

  const systemTable = grid.set(1, 2, 1, 1, contrib.table, {
    keys: false,
    fg: "white",
    label: " System Status ",
    columnSpacing: 2,
    columnWidth: [20, 24],
    style: {
      border: { fg: "blue" },
      header: { fg: "bright-blue", bold: true },
    },
  } as any);

  // ─── Status bar at bottom ─────────────────────────────────────────────

  const statusBar = blessed.box({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    content: ` SSS Dashboard | Mint: ${shortenPubkey(mintPubkey)} | Config PDA: ${shortenPubkey(configPDA)} | RPC: ${rpc} | Press 'q' to quit`,
    style: {
      fg: "white",
      bg: "blue",
    },
  });
  screen.append(statusBar);

  // ─── Key bindings ─────────────────────────────────────────────────────

  screen.key(["q", "C-c"], () => {
    clearInterval(refreshTimer);
    screen.destroy();
    process.exit(0);
  });

  // ─── Refresh function ─────────────────────────────────────────────────

  let refreshCount = 0;

  async function refresh() {
    refreshCount++;
    const now = new Date().toLocaleTimeString();

    try {
      // Fetch all data in parallel
      const [config, roles, blacklist, oracle, signatures] = await Promise.all([
        fetchStablecoinConfig(connection, configPDA),
        fetchRoleAssignments(connection, configPDA),
        fetchBlacklistEntries(connection, configPDA),
        fetchOracleConfig(connection, configPDA),
        fetchRecentSignatures(connection, configPDA, 10),
      ]);

      // ── Supply Overview ───────────────────────────────────────────────

      if (config) {
        const circulating = config.totalMinted - config.totalBurned;
        supplyTable.setData({
          headers: ["Metric", "Value"],
          data: [
            ["Total Minted", formatTokenAmount(config.totalMinted)],
            ["Total Burned", formatTokenAmount(config.totalBurned)],
            ["Circulating", formatTokenAmount(circulating)],
            [
              "Supply Cap",
              config.supplyCap === 0n
                ? "Unlimited"
                : formatTokenAmount(config.supplyCap),
            ],
            ["Mint", shortenPubkey(config.mint)],
          ],
        });
      } else {
        supplyTable.setData({
          headers: ["Metric", "Value"],
          data: [["Status", "Config not found"]],
        });
      }

      // ── Recent Transactions ───────────────────────────────────────────

      // Clear and repopulate the log
      // blessed-contrib log appends, so we clear by setting content
      (txLog as any).logLines = [];
      (txLog as any).setContent("");

      if (signatures.length === 0) {
        txLog.log("{yellow-fg}No recent transactions found{/}");
      } else {
        for (const sig of signatures) {
          const shortSig = `${sig.signature.slice(0, 12)}...`;
          const slot = sig.slot;
          const time = sig.blockTime
            ? new Date(sig.blockTime * 1000).toLocaleTimeString()
            : "???";
          const err = sig.err ? "{red-fg}ERR{/}" : "{green-fg}OK{/}";
          txLog.log(`${err} ${time} slot:${slot} ${shortSig}`);
        }
      }

      // ── Role Assignments ──────────────────────────────────────────────

      const activeRoles = roles.filter((r) => r.active);
      if (activeRoles.length === 0) {
        rolesTable.setData({
          headers: ["Role", "Holder", "Active"],
          data: [["--", "No roles found", "--"]],
        });
      } else {
        rolesTable.setData({
          headers: ["Role", "Holder", "Active"],
          data: activeRoles.map((r) => [
            ROLE_NAMES[r.role] || `Unknown(${r.role})`,
            shortenPubkey(r.holder, 4),
            r.active ? "Yes" : "No",
          ]),
        });
      }

      // ── Blacklist Entries ─────────────────────────────────────────────

      const activeBlacklist = blacklist.filter((b) => b.active);
      if (activeBlacklist.length === 0) {
        blacklistTable.setData({
          headers: ["Address", "Reason", "Active"],
          data: [["--", "No entries", "--"]],
        });
      } else {
        blacklistTable.setData({
          headers: ["Address", "Reason", "Active"],
          data: activeBlacklist.map((b) => [
            shortenPubkey(b.address, 4),
            b.reason.length > 14 ? b.reason.slice(0, 12) + ".." : b.reason,
            b.active ? "Yes" : "No",
          ]),
        });
      }

      // ── Oracle Status ─────────────────────────────────────────────────

      if (oracle) {
        oracleTable.setData({
          headers: ["Parameter", "Value"],
          data: [
            ["Enabled", oracle.enabled ? "Yes" : "No"],
            ["Price Feed", shortenPubkey(oracle.priceFeed)],
            ["Max Deviation", `${oracle.maxDeviationBps} bps`],
            ["Max Staleness", `${oracle.maxStalenessSecs.toString()} secs`],
          ],
        });
      } else {
        oracleTable.setData({
          headers: ["Parameter", "Value"],
          data: [["Status", "Oracle not configured"]],
        });
      }

      // ── System Status ─────────────────────────────────────────────────

      if (config) {
        systemTable.setData({
          headers: ["Setting", "Value"],
          data: [
            ["Paused", config.paused ? "YES (paused)" : "No (active)"],
            ["Compliance", config.complianceEnabled ? "Enabled" : "Disabled"],
            ["Allowlist", config.enableAllowlist ? "Enabled" : "Disabled"],
            ["Authority", shortenPubkey(config.authority)],
            [
              "Hook Program",
              config.transferHookProgram.equals(PublicKey.default)
                ? "None"
                : shortenPubkey(config.transferHookProgram),
            ],
          ],
        });
      } else {
        systemTable.setData({
          headers: ["Setting", "Value"],
          data: [["Status", "Config not found"]],
        });
      }

      // Update status bar
      statusBar.setContent(
        ` SSS Dashboard | Mint: ${shortenPubkey(mintPubkey)} | Config: ${shortenPubkey(configPDA)} | Updated: ${now} (#${refreshCount}) | Press 'q' to quit`
      );
    } catch (err: any) {
      statusBar.setContent(
        ` SSS Dashboard | ERROR: ${err.message || err} | ${now} | Press 'q' to quit`
      );
    }

    screen.render();
  }

  // ─── Initial render + timer ───────────────────────────────────────────

  screen.render();
  await refresh();

  const refreshTimer = setInterval(() => {
    refresh().catch(() => {});
  }, REFRESH_INTERVAL_MS);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
