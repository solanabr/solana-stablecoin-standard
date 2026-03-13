/**
 * Shared test helpers for SSS TUI test suite.
 *
 * Extracted from tui-actions.test.js and tui-actions.test.ts to eliminate
 * duplicated helper functions across test files.
 */

import { PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PROGRAM_ID = "5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4";
export const DEVNET_MINT = "9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv";
/** Alias used by the .js test suite */
export const DEFAULT_MINT = DEVNET_MINT;
/** A valid Solana address for use in action tests */
export const VALID_ADDRESS = "GVkN8P9VqJE8o4kPNXPzQuxD4UjfLfK3nSJabV7RzWX7";

// ---------------------------------------------------------------------------
// SSS program error codes (from programs/sss-token/src/errors.rs)
//
// Anchor custom errors start at 6000. The ordinal position in the SssError
// enum determines the offset, so error code = 6000 + index.
// ---------------------------------------------------------------------------

export const SssErrorCode = {
  Unauthorized: 6000,
  InvalidAuthority: 6001,
  ProgramPaused: 6002,
  ProgramNotPaused: 6003,
  MinterNotActive: 6004,
  MintQuotaExceeded: 6005,
  MintAmountZero: 6006,
  BurnAmountZero: 6007,
  InsufficientBalance: 6008,
  FeatureNotEnabled: 6009,
  /** Blacklist feature requires SSS-2 or higher preset */
  BlacklistNotEnabled: 6010,
  TransferHookNotEnabled: 6011,
  ConfidentialTransfersNotEnabled: 6012,
  CustomFlagsMissing: 6013,
  CannotBlacklistAuthority: 6014,
  RecipientBlacklisted: 6015,
  NameTooLong: 6016,
  SymbolTooLong: 6017,
  UriTooLong: 6018,
  ReasonTooLong: 6019,
  AllowlistReasonTooLong: 6020,
  DetailsTooLong: 6021,
  InvalidDecimals: 6022,
  SameAuthority: 6023,
  ZeroAuthority: 6024,
  NoPendingAuthority: 6025,
  NotPendingAuthority: 6026,
  SeizeAmountZero: 6027,
  SeizeSameAccount: 6028,
  InsufficientReserves: 6029,
  InvalidHookProgram: 6030,
  AllowlistEntryExists: 6031,
  AllowlistEntryNotFound: 6032,
  SupplyCapExceeded: 6033,
  Overflow: 6034,
} as const;

export const SssErrorMessage: Record<number, string> = {
  [SssErrorCode.Unauthorized]: "Unauthorized: caller does not have the required role",
  [SssErrorCode.InvalidAuthority]: "Invalid authority for this operation",
  [SssErrorCode.ProgramPaused]: "Program is currently paused",
  [SssErrorCode.ProgramNotPaused]: "Program is not paused",
  [SssErrorCode.MinterNotActive]: "Minter is not active",
  [SssErrorCode.MintQuotaExceeded]: "Mint amount exceeds minter quota",
  [SssErrorCode.MintAmountZero]: "Mint amount must be greater than zero",
  [SssErrorCode.BurnAmountZero]: "Burn amount must be greater than zero",
  [SssErrorCode.InsufficientBalance]: "Insufficient balance for burn",
  [SssErrorCode.FeatureNotEnabled]: "Feature not enabled for this stablecoin preset",
  [SssErrorCode.BlacklistNotEnabled]: "Blacklist feature requires SSS-2 or higher preset",
  [SssErrorCode.TransferHookNotEnabled]: "Transfer hook feature requires SSS-2 or higher preset",
  [SssErrorCode.ConfidentialTransfersNotEnabled]: "Confidential transfers require SSS-3 preset",
  [SssErrorCode.CustomFlagsMissing]: "Custom preset requires all four feature flags to be specified",
  [SssErrorCode.CannotBlacklistAuthority]: "Cannot blacklist the master authority",
  [SssErrorCode.RecipientBlacklisted]: "Cannot mint to a blacklisted recipient",
  [SssErrorCode.NameTooLong]: "Name exceeds maximum length of 32 characters",
  [SssErrorCode.SymbolTooLong]: "Symbol exceeds maximum length of 10 characters",
  [SssErrorCode.UriTooLong]: "URI exceeds maximum length of 200 characters",
  [SssErrorCode.ReasonTooLong]: "Reason exceeds maximum length of 128 characters",
  [SssErrorCode.AllowlistReasonTooLong]: "Allowlist reason exceeds maximum length of 64 characters",
  [SssErrorCode.DetailsTooLong]: "Details exceeds maximum length of 256 characters",
  [SssErrorCode.InvalidDecimals]: "Invalid decimals value",
  [SssErrorCode.SameAuthority]: "Cannot transfer authority to the same address",
  [SssErrorCode.ZeroAuthority]: "New authority cannot be the zero address",
  [SssErrorCode.NoPendingAuthority]: "No pending authority nomination exists",
  [SssErrorCode.NotPendingAuthority]: "Signer is not the pending authority",
  [SssErrorCode.SeizeAmountZero]: "Seize amount must be greater than zero",
  [SssErrorCode.SeizeSameAccount]: "Source and destination accounts must be different",
  [SssErrorCode.InsufficientReserves]: "Reserve attestation requires reserves >= outstanding",
  [SssErrorCode.InvalidHookProgram]: "Invalid transfer hook program ID",
  [SssErrorCode.AllowlistEntryExists]: "Allowlist entry already exists",
  [SssErrorCode.AllowlistEntryNotFound]: "Allowlist entry not found",
  [SssErrorCode.SupplyCapExceeded]: "Mint would exceed the configured supply cap",
  [SssErrorCode.Overflow]: "Arithmetic overflow",
};

// ---------------------------------------------------------------------------
// PDA derivation helpers (verbatim from admin_tui.js)
// ---------------------------------------------------------------------------

export function getConfigPda(
  mint: string,
  programId: string = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config"), new PublicKey(mint).toBuffer()],
    new PublicKey(programId)
  );
}

export function getRoleRegistryPda(
  configPda: PublicKey,
  programId: string = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("roles"), configPda.toBuffer()],
    new PublicKey(programId)
  );
}

export function getReserveAttestationPda(
  configPda: PublicKey,
  index: number,
  programId: string = PROGRAM_ID
): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(index));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reserve"), configPda.toBuffer(), buf],
    new PublicKey(programId)
  );
}

export function getMinterInfoPda(
  configPda: PublicKey,
  minterPk: PublicKey,
  programId: string = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("minter"), configPda.toBuffer(), minterPk.toBuffer()],
    new PublicKey(programId)
  );
}

export function getBlacklistPda(
  configPda: PublicKey,
  addressPk: PublicKey,
  programId: string = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), configPda.toBuffer(), addressPk.toBuffer()],
    new PublicKey(programId)
  );
}

export function getAuditLogPda(
  configPda: PublicKey,
  index: number,
  programId: string = PROGRAM_ID
): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(index));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("audit"), configPda.toBuffer(), buf],
    new PublicKey(programId)
  );
}

// ---------------------------------------------------------------------------
// Utility function copies (verbatim from admin_tui.js)
// ---------------------------------------------------------------------------

export function shortAddr(addr: string | null | undefined): string {
  if (!addr || addr.length < 10) return addr || "N/A";
  return addr.slice(0, 4) + "..." + addr.slice(-4);
}

export function formatTimestamp(ts: number | null | undefined): string {
  if (!ts) return "N/A";
  const d = new Date(ts * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export function formatUsd(amount: number, decimals?: number): string {
  decimals = decimals || 6;
  return (amount / Math.pow(10, decimals)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseTokenAmount(str: string, decimals: number): BN | null {
  const cleaned = str.trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const padded = frac.padEnd(decimals, "0").slice(0, decimals);
  return new BN(whole + padded);
}

export function isValidPubkey(str: string): boolean {
  try {
    new PublicKey(str);
    return true;
  } catch {
    return false;
  }
}

export function detectNetwork(url: string): string {
  let net = "CUSTOM";
  if (url.includes("mainnet")) net = "MAINNET";
  else if (url.includes("devnet")) net = "DEVNET";
  else if (url.includes("testnet")) net = "TESTNET";
  else if (url.includes("localhost") || url.includes("127.0.0.1")) net = "LOCAL";
  if (url.includes("helius")) return net + "/Helius";
  if (url.includes("quicknode")) return net + "/QuickNode";
  if (url.includes("alchemy")) return net + "/Alchemy";
  if (url.includes("triton")) return net + "/Triton";
  if (url.includes("shyft")) return net + "/Shyft";
  if (
    url.includes("api.devnet.solana.com") ||
    url.includes("api.mainnet-beta.solana.com")
  )
    return net + "/Public";
  return net;
}

export const colors = {
  bg: "black",
  text: "#e0e0e0",
  accent: "#ffb300",
  secondary: "#00bcd4",
  border: "#424242",
  danger: "#e53935",
  success: "#43a047",
  dim: "#757575",
  warning: "#ff9800",
  highlight: "#1a237e",
};

export function dimText(str: string): string {
  return `{${colors.dim}-fg}${str}{/${colors.dim}-fg}`;
}

export function exportCsv(
  _filename: string,
  headers: string[],
  rows: any[][]
): string {
  const eol = process.platform === "win32" ? "\r\n" : "\n";
  const csvContent = [headers.join(",")]
    .concat(
      rows.map((r) =>
        r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")
      )
    )
    .join(eol);
  return csvContent;
}

// ---------------------------------------------------------------------------
// Test infrastructure helpers (from tui-actions.test.ts)
// ---------------------------------------------------------------------------

export function createWidget(overrides: Record<string, any> = {}) {
  const widget: Record<string, any> = {
    children: [],
    style: {},
    hidden: false,
    destroyed: false,
    content: "",
    value: "",
    type: "box",
    on: jest.fn(),
    key: jest.fn(),
    focus: jest.fn(),
    select: jest.fn(),
    setLabel: jest.fn(),
    setContent: jest.fn(function setContent(content: string) {
      widget.content = content;
    }),
    getValue: jest.fn(() => widget.value || ""),
    render: jest.fn(),
    append: jest.fn((child: any) => widget.children.push(child)),
    destroy: jest.fn(() => {
      widget.destroyed = true;
    }),
    display: jest.fn((_text: string, _timeout: number, cb?: () => void) => {
      cb?.();
    }),
    ...overrides,
  };

  return widget;
}

export function createBlessedMock() {
  const screen = createWidget({
    type: "screen",
    width: 160,
    height: 50,
    focused: null,
    program: {
      on: jest.fn(),
      removeListener: jest.fn(),
    },
  });

  const makeFactory =
    (type: string) =>
    (options: Record<string, any> = {}) =>
      createWidget({ type, ...options });

  function textarea() {}
  textarea.prototype = {};

  return {
    textarea,
    screen: jest.fn(() => screen),
    box: jest.fn(makeFactory("box")),
    list: jest.fn(makeFactory("list")),
    button: jest.fn(makeFactory("button")),
    text: jest.fn(makeFactory("text")),
    message: jest.fn(() => createWidget({ type: "message" })),
  };
}

export function loadTuiModule() {
  jest.resetModules();
  process.env.SSS_TUI_TEST_MODE = "1";
  jest.doMock("blessed", () => createBlessedMock(), { virtual: true });
  jest.doMock("blessed-contrib", () => ({}), { virtual: true });
  return require("../../tui/admin_tui.js");
}

export function createProgramHarness() {
  const calls: any[] = [];
  const methods: Record<string, jest.Mock> = {};

  const methodNames = [
    "mintTokens",
    "burnTokens",
    "freezeAccount",
    "thawAccount",
    "blacklistAdd",
    "blacklistRemove",
    "seize",
    "pause",
    "unpause",
    "attestReserve",
    "updateRoles",
    "updateMinter",
    "transferAuthority",
  ];

  for (const methodName of methodNames) {
    methods[methodName] = jest.fn((...args: any[]) => {
      const record: any = {
        methodName,
        args,
        accounts: null,
        preInstructions: [],
        signers: [],
      };
      calls.push(record);

      const chain: any = {
        accounts: jest.fn((accounts: any) => {
          record.accounts = accounts;
          return chain;
        }),
        preInstructions: jest.fn((instructions: any[]) => {
          record.preInstructions = instructions;
          return chain;
        }),
        signers: jest.fn((signers: any[]) => {
          record.signers = signers;
          return chain;
        }),
        rpc: jest.fn(async () => `${methodName}-signature`),
      };

      return chain;
    });
  }

  return {
    program: { methods },
    methods,
    calls,
  };
}

export function buildActionDeps() {
  const wallet = Keypair.generate();
  const programHarness = createProgramHarness();
  const showMessage = jest.fn();
  const confirmAction = jest.fn(
    (_title: string, _details: string, _danger: string, onConfirm: () => void) => {
      onConfirm();
    }
  );
  const executeTx = jest.fn(async (_title: string, txFn: () => Promise<any>) => txFn());

  return {
    wallet,
    programHarness,
    showMessage,
    confirmAction,
    executeTx,
    deps: {
      walletMode: true,
      wallet,
      program: programHarness.program,
      liveData: {
        config: {
          symbol: "dUSD",
          decimals: 6,
          attestationIndex: 4,
        },
      },
      mint: DEVNET_MINT,
      token2022ProgramId: Keypair.generate().publicKey,
      getAssociatedTokenAddressSync: jest.fn(() => Keypair.generate().publicKey),
      createAssociatedTokenAccountIdempotentInstruction: jest.fn(() => ({
        kind: "create-ata",
      })),
      systemProgram: {
        programId: new PublicKey("11111111111111111111111111111111"),
      },
      showMessage,
      confirmAction,
      executeTx,
    },
  };
}
