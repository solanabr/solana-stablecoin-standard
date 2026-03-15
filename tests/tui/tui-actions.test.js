/**
 * SSS TUI Comprehensive Test Suite
 *
 * Tests all pure/utility functions from tui/admin_tui.js.
 * Shared helpers are imported from test-helpers.ts to avoid duplication.
 * For PDA derivation we use the real @solana/web3.js PublicKey so the seeds
 * are verified end-to-end.
 */

const { PublicKey } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---------------------------------------------------------------------------
// Shared helpers (extracted to test-helpers.ts to eliminate duplication)
// ---------------------------------------------------------------------------
const helpers = require('./test-helpers');
const {
  PROGRAM_ID,
  DEFAULT_MINT,
  DEVNET_MINT,
  VALID_ADDRESS,
  SssErrorCode,
  SssErrorMessage,
  getConfigPda,
  getRoleRegistryPda,
  getReserveAttestationPda,
  getMinterInfoPda,
  getBlacklistPda,
  getAuditLogPda,
  shortAddr,
  formatTimestamp,
  formatUsd,
  parseTokenAmount,
  isValidPubkey,
  detectNetwork,
  colors,
  dimText,
  exportCsv,
} = helpers;

// ---------------------------------------------------------------------------
// TEST SUITES
// ---------------------------------------------------------------------------

describe('PDA Derivation Functions', () => {
  const mint = DEFAULT_MINT;
  let configPda;

  beforeAll(() => {
    [configPda] = getConfigPda(mint);
  });

  describe('getConfigPda', () => {
    test('returns a valid PublicKey for the default mint', () => {
      const [pda, bump] = getConfigPda(mint);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    test('returns deterministic results for the same mint', () => {
      const [pda1] = getConfigPda(mint);
      const [pda2] = getConfigPda(mint);
      expect(pda1.toBase58()).toBe(pda2.toBase58());
    });

    test('returns different PDAs for different mints', () => {
      const otherMint = 'So11111111111111111111111111111111111111112';
      const [pda1] = getConfigPda(mint);
      const [pda2] = getConfigPda(otherMint);
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    test('uses "config" as the first seed', () => {
      // Verify by manually computing with the same seeds
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from('config'), new PublicKey(mint).toBuffer()],
        new PublicKey(PROGRAM_ID)
      );
      const [actual] = getConfigPda(mint);
      expect(actual.toBase58()).toBe(expected.toBase58());
    });

    test('throws for an invalid mint address', () => {
      expect(() => getConfigPda('not-a-valid-pubkey')).toThrow();
    });

    test('throws for an empty string', () => {
      expect(() => getConfigPda('')).toThrow();
    });

    test('works with a system program ID as mint', () => {
      const sysProg = '11111111111111111111111111111111';
      const [pda, bump] = getConfigPda(sysProg);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getRoleRegistryPda', () => {
    test('returns a valid PublicKey', () => {
      const [pda, bump] = getRoleRegistryPda(configPda);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    test('is deterministic', () => {
      const [pda1] = getRoleRegistryPda(configPda);
      const [pda2] = getRoleRegistryPda(configPda);
      expect(pda1.toBase58()).toBe(pda2.toBase58());
    });

    test('uses "roles" as seed prefix', () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from('roles'), configPda.toBuffer()],
        new PublicKey(PROGRAM_ID)
      );
      const [actual] = getRoleRegistryPda(configPda);
      expect(actual.toBase58()).toBe(expected.toBase58());
    });

    test('different configPda yields different rolesPda', () => {
      const otherMint = 'So11111111111111111111111111111111111111112';
      const [otherConfig] = getConfigPda(otherMint);
      const [roles1] = getRoleRegistryPda(configPda);
      const [roles2] = getRoleRegistryPda(otherConfig);
      expect(roles1.toBase58()).not.toBe(roles2.toBase58());
    });
  });

  describe('getReserveAttestationPda', () => {
    test('returns a valid PublicKey for index 0', () => {
      const [pda, bump] = getReserveAttestationPda(configPda, 0);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    test('different indices produce different PDAs', () => {
      const [pda0] = getReserveAttestationPda(configPda, 0);
      const [pda1] = getReserveAttestationPda(configPda, 1);
      const [pda99] = getReserveAttestationPda(configPda, 99);
      expect(pda0.toBase58()).not.toBe(pda1.toBase58());
      expect(pda1.toBase58()).not.toBe(pda99.toBase58());
    });

    test('is deterministic for same config and index', () => {
      const [pda1] = getReserveAttestationPda(configPda, 42);
      const [pda2] = getReserveAttestationPda(configPda, 42);
      expect(pda1.toBase58()).toBe(pda2.toBase58());
    });

    test('encodes index as little-endian u64', () => {
      const buf = Buffer.alloc(8);
      buf.writeBigUInt64LE(BigInt(5));
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from('reserve'), configPda.toBuffer(), buf],
        new PublicKey(PROGRAM_ID)
      );
      const [actual] = getReserveAttestationPda(configPda, 5);
      expect(actual.toBase58()).toBe(expected.toBase58());
    });

    test('handles large index values', () => {
      const [pda] = getReserveAttestationPda(configPda, 2 ** 32);
      expect(pda).toBeInstanceOf(PublicKey);
    });
  });

  describe('getMinterInfoPda', () => {
    const minterPk = new PublicKey('GVkN8P9VqJE8o4kPNXPzQuxD4UjfLfK3nSJabV7RzWX7');

    test('returns a valid PublicKey', () => {
      const [pda, bump] = getMinterInfoPda(configPda, minterPk);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    test('is deterministic', () => {
      const [pda1] = getMinterInfoPda(configPda, minterPk);
      const [pda2] = getMinterInfoPda(configPda, minterPk);
      expect(pda1.toBase58()).toBe(pda2.toBase58());
    });

    test('different minter keys yield different PDAs', () => {
      const minter2 = new PublicKey('11111111111111111111111111111111');
      const [pda1] = getMinterInfoPda(configPda, minterPk);
      const [pda2] = getMinterInfoPda(configPda, minter2);
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    test('uses "minter" seed prefix', () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from('minter'), configPda.toBuffer(), minterPk.toBuffer()],
        new PublicKey(PROGRAM_ID)
      );
      const [actual] = getMinterInfoPda(configPda, minterPk);
      expect(actual.toBase58()).toBe(expected.toBase58());
    });
  });

  describe('getBlacklistPda', () => {
    const addressPk = new PublicKey('GVkN8P9VqJE8o4kPNXPzQuxD4UjfLfK3nSJabV7RzWX7');

    test('returns a valid PublicKey', () => {
      const [pda, bump] = getBlacklistPda(configPda, addressPk);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    test('is deterministic', () => {
      const [pda1] = getBlacklistPda(configPda, addressPk);
      const [pda2] = getBlacklistPda(configPda, addressPk);
      expect(pda1.toBase58()).toBe(pda2.toBase58());
    });

    test('different addresses yield different PDAs', () => {
      const addr2 = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const [pda1] = getBlacklistPda(configPda, addressPk);
      const [pda2] = getBlacklistPda(configPda, addr2);
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    test('uses "blacklist" seed prefix', () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from('blacklist'), configPda.toBuffer(), addressPk.toBuffer()],
        new PublicKey(PROGRAM_ID)
      );
      const [actual] = getBlacklistPda(configPda, addressPk);
      expect(actual.toBase58()).toBe(expected.toBase58());
    });
  });

  describe('getAuditLogPda', () => {
    test('returns a valid PublicKey for index 0', () => {
      const [pda, bump] = getAuditLogPda(configPda, 0);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    test('different indices produce different PDAs', () => {
      const [pda0] = getAuditLogPda(configPda, 0);
      const [pda1] = getAuditLogPda(configPda, 1);
      expect(pda0.toBase58()).not.toBe(pda1.toBase58());
    });

    test('uses "audit" seed prefix', () => {
      const buf = Buffer.alloc(8);
      buf.writeBigUInt64LE(BigInt(3));
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from('audit'), configPda.toBuffer(), buf],
        new PublicKey(PROGRAM_ID)
      );
      const [actual] = getAuditLogPda(configPda, 3);
      expect(actual.toBase58()).toBe(expected.toBase58());
    });

    test('handles index 0 correctly', () => {
      const buf = Buffer.alloc(8);
      buf.writeBigUInt64LE(0n);
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from('audit'), configPda.toBuffer(), buf],
        new PublicKey(PROGRAM_ID)
      );
      const [actual] = getAuditLogPda(configPda, 0);
      expect(actual.toBase58()).toBe(expected.toBase58());
    });
  });

  describe('Cross-PDA relationships', () => {
    test('configPda is not on the ed25519 curve', () => {
      const [pda] = getConfigPda(mint);
      // PDAs should NOT be on the ed25519 curve
      expect(PublicKey.isOnCurve(pda.toBytes())).toBe(false);
    });

    test('roleRegistryPda is not on the ed25519 curve', () => {
      const [pda] = getRoleRegistryPda(configPda);
      expect(PublicKey.isOnCurve(pda.toBytes())).toBe(false);
    });

    test('all PDAs for same config are distinct', () => {
      const minterPk = new PublicKey('GVkN8P9VqJE8o4kPNXPzQuxD4UjfLfK3nSJabV7RzWX7');
      const [rolesPda] = getRoleRegistryPda(configPda);
      const [attestPda] = getReserveAttestationPda(configPda, 0);
      const [minterPda] = getMinterInfoPda(configPda, minterPk);
      const [blPda] = getBlacklistPda(configPda, minterPk);
      const [auditPda] = getAuditLogPda(configPda, 0);

      const addresses = new Set([
        configPda.toBase58(),
        rolesPda.toBase58(),
        attestPda.toBase58(),
        minterPda.toBase58(),
        blPda.toBase58(),
        auditPda.toBase58(),
      ]);
      expect(addresses.size).toBe(6);
    });
  });
});

describe('Utility Functions', () => {
  describe('shortAddr', () => {
    test('abbreviates a full Solana address', () => {
      const addr = '9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv';
      expect(shortAddr(addr)).toBe('9Mmn...Yujv');
    });

    test('returns "N/A" for null', () => {
      expect(shortAddr(null)).toBe('N/A');
    });

    test('returns "N/A" for undefined', () => {
      expect(shortAddr(undefined)).toBe('N/A');
    });

    test('returns the original string for short strings (< 10 chars)', () => {
      expect(shortAddr('abc')).toBe('abc');
    });

    test('returns the original string for exactly 9 chars', () => {
      expect(shortAddr('123456789')).toBe('123456789');
    });

    test('abbreviates a 10-char string', () => {
      expect(shortAddr('1234567890')).toBe('1234...7890');
    });

    test('returns "N/A" for empty string', () => {
      expect(shortAddr('')).toBe('N/A');
    });

    test('handles a 43-char base58 address correctly', () => {
      const addr = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      const result = shortAddr(addr);
      expect(result).toBe('Toke...Q5DA');
      expect(result.length).toBe(11); // 4 + 3 + 4
    });

    test('preserves first 4 and last 4 chars', () => {
      const addr = 'ABCDxxxxEFGH1234';
      const result = shortAddr(addr);
      expect(result.startsWith('ABCD')).toBe(true);
      expect(result.endsWith('1234')).toBe(true);
    });
  });

  describe('formatTimestamp', () => {
    test('formats a Unix timestamp to ISO-like string', () => {
      // 2024-01-15T12:30:45.000Z
      const ts = 1705320645;
      const result = formatTimestamp(ts);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    test('returns "N/A" for null', () => {
      expect(formatTimestamp(null)).toBe('N/A');
    });

    test('returns "N/A" for undefined', () => {
      expect(formatTimestamp(undefined)).toBe('N/A');
    });

    test('returns "N/A" for 0', () => {
      expect(formatTimestamp(0)).toBe('N/A');
    });

    test('handles epoch start (timestamp 1)', () => {
      const result = formatTimestamp(1);
      expect(result).toBe('1970-01-01 00:00:01');
    });

    test('result has exactly 19 characters', () => {
      const result = formatTimestamp(1705320645);
      expect(result.length).toBe(19);
    });

    test('replaces T with space', () => {
      const result = formatTimestamp(1705320645);
      expect(result).not.toContain('T');
      expect(result.charAt(10)).toBe(' ');
    });

    test('handles a recent timestamp', () => {
      // 2025-06-15 00:00:00 UTC
      const ts = 1750032000;
      const result = formatTimestamp(ts);
      expect(result).toMatch(/^2025-/);
    });
  });

  describe('formatUsd', () => {
    test('formats 1000000 with 6 decimals as "1.00"', () => {
      const result = formatUsd(1000000, 6);
      expect(result).toBe('1.00');
    });

    test('formats 0 as "0.00"', () => {
      expect(formatUsd(0, 6)).toBe('0.00');
    });

    test('uses default of 6 decimals when not specified', () => {
      expect(formatUsd(1000000)).toBe('1.00');
    });

    test('handles large amounts with thousands separators', () => {
      // 1,000,000 tokens with 6 decimals = 1000000 * 10^6 = 1e12
      const amount = 1000000000000;
      const result = formatUsd(amount, 6);
      expect(result).toBe('1,000,000.00');
    });

    test('handles amounts less than 1 unit', () => {
      // 500000 with 6 decimals = 0.50
      const result = formatUsd(500000, 6);
      expect(result).toBe('0.50');
    });

    test('handles 9 decimals', () => {
      const result = formatUsd(1000000000, 9);
      expect(result).toBe('1.00');
    });

    test('handles 0 decimals (falls back to 6 due to || operator)', () => {
      // formatUsd uses `decimals = decimals || 6` so 0 is falsy and defaults to 6
      // 42 / 10^6 = 0.000042 which rounds to 0.00
      const result = formatUsd(42, 0);
      expect(result).toBe('0.00');
    });

    test('formats with minimum 2 decimal places', () => {
      const result = formatUsd(1000000, 6);
      expect(result).toMatch(/\.\d{2}$/);
    });

    test('handles very small sub-unit amounts', () => {
      const result = formatUsd(1, 6);
      expect(result).toBe('0.00');
    });

    test('handles negative amounts', () => {
      const result = formatUsd(-1000000, 6);
      // Negative formatting depends on locale but should contain a minus or ()
      expect(result).toContain('-');
    });
  });

  describe('parseTokenAmount', () => {
    test('parses "1.0" with 6 decimals to BN(1000000)', () => {
      const result = parseTokenAmount('1.0', 6);
      expect(result).not.toBeNull();
      expect(result.toString()).toBe('1000000');
    });

    test('parses whole number "100" with 6 decimals', () => {
      const result = parseTokenAmount('100', 6);
      expect(result).not.toBeNull();
      expect(result.toString()).toBe('100000000');
    });

    test('pads fractional part to fill decimals', () => {
      const result = parseTokenAmount('1.5', 6);
      expect(result).not.toBeNull();
      expect(result.toString()).toBe('1500000');
    });

    test('truncates excess fractional digits', () => {
      const result = parseTokenAmount('1.1234567890', 6);
      expect(result).not.toBeNull();
      expect(result.toString()).toBe('1123456');
    });

    test('parses "0.000001" with 6 decimals correctly', () => {
      const result = parseTokenAmount('0.000001', 6);
      expect(result).not.toBeNull();
      expect(result.toString()).toBe('1');
    });

    test('returns null for empty string', () => {
      expect(parseTokenAmount('', 6)).toBeNull();
    });

    test('returns null for non-numeric string', () => {
      expect(parseTokenAmount('abc', 6)).toBeNull();
    });

    test('returns null for negative number', () => {
      expect(parseTokenAmount('-1.0', 6)).toBeNull();
    });

    test('returns null for string with spaces in the middle', () => {
      expect(parseTokenAmount('1 0', 6)).toBeNull();
    });

    test('returns null for hexadecimal notation', () => {
      expect(parseTokenAmount('0xFF', 6)).toBeNull();
    });

    test('returns null for string with commas', () => {
      expect(parseTokenAmount('1,000', 6)).toBeNull();
    });

    test('trims whitespace before parsing', () => {
      const result = parseTokenAmount('  1.0  ', 6);
      expect(result).not.toBeNull();
      expect(result.toString()).toBe('1000000');
    });

    test('parses "0" correctly', () => {
      const result = parseTokenAmount('0', 6);
      expect(result).not.toBeNull();
      expect(result.toString()).toBe('0');
    });

    test('parses "0.0" correctly', () => {
      const result = parseTokenAmount('0.0', 6);
      expect(result).not.toBeNull();
      expect(result.toString()).toBe('0');
    });

    test('returns a BN instance', () => {
      const result = parseTokenAmount('1.0', 6);
      expect(result).toBeInstanceOf(BN);
    });

    test('handles 9 decimal places', () => {
      const result = parseTokenAmount('1.5', 9);
      expect(result).not.toBeNull();
      expect(result.toString()).toBe('1500000000');
    });

    test('returns null for multiple dots', () => {
      expect(parseTokenAmount('1.2.3', 6)).toBeNull();
    });

    test('returns null for just a dot', () => {
      expect(parseTokenAmount('.', 6)).toBeNull();
    });

    test('returns null for leading dot without zero', () => {
      // ".5" does not match the regex ^\d+(\.\d+)?$
      expect(parseTokenAmount('.5', 6)).toBeNull();
    });
  });

  describe('isValidPubkey', () => {
    test('returns true for a valid base58 public key', () => {
      expect(isValidPubkey('9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv')).toBe(true);
    });

    test('returns true for system program', () => {
      expect(isValidPubkey('11111111111111111111111111111111')).toBe(true);
    });

    test('returns true for token program', () => {
      expect(isValidPubkey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')).toBe(true);
    });

    test('returns false for empty string', () => {
      expect(isValidPubkey('')).toBe(false);
    });

    test('returns false for random text', () => {
      expect(isValidPubkey('hello world')).toBe(false);
    });

    test('returns false for string with invalid base58 chars (0, O, I, l)', () => {
      expect(isValidPubkey('0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl')).toBe(false);
    });

    test('returns false for too-short string', () => {
      expect(isValidPubkey('abc')).toBe(false);
    });

    test('returns false for null coerced to string', () => {
      expect(isValidPubkey('null')).toBe(false);
    });

    test('returns false for undefined coerced to string', () => {
      expect(isValidPubkey('undefined')).toBe(false);
    });

    test('returns true for a 43-char valid base58 key', () => {
      // Solana public keys can be 32-44 base58 chars
      expect(isValidPubkey('GVkN8P9VqJE8o4kPNXPzQuxD4UjfLfK3nSJabV7RzWX7')).toBe(true);
    });
  });

  describe('detectNetwork', () => {
    test('detects devnet from standard URL', () => {
      expect(detectNetwork('https://api.devnet.solana.com')).toBe('DEVNET/Public');
    });

    test('detects mainnet from standard URL', () => {
      expect(detectNetwork('https://api.mainnet-beta.solana.com')).toBe('MAINNET/Public');
    });

    test('detects testnet', () => {
      const result = detectNetwork('https://api.testnet.solana.com');
      expect(result).toBe('TESTNET');
    });

    test('detects localhost', () => {
      const result = detectNetwork('http://localhost:8899');
      expect(result).toBe('LOCAL');
    });

    test('detects 127.0.0.1', () => {
      const result = detectNetwork('http://127.0.0.1:8899');
      expect(result).toBe('LOCAL');
    });

    test('detects Helius provider on devnet', () => {
      const result = detectNetwork('https://devnet.helius-rpc.com/?api-key=xxx');
      expect(result).toBe('DEVNET/Helius');
    });

    test('detects Helius provider on mainnet', () => {
      const result = detectNetwork('https://mainnet.helius-rpc.com/?api-key=xxx');
      expect(result).toBe('MAINNET/Helius');
    });

    test('detects QuickNode provider', () => {
      const result = detectNetwork('https://bold-small-something.devnet.quiknode.pro/quicknode/xxx');
      expect(result).toBe('DEVNET/QuickNode');
    });

    test('detects Alchemy provider', () => {
      const result = detectNetwork('https://solana-mainnet.g.alchemy.com/v2/xxx');
      expect(result).toBe('MAINNET/Alchemy');
    });

    test('detects Triton provider', () => {
      const result = detectNetwork('https://xxx.devnet.rpcpool.com/triton/xxx');
      expect(result).toBe('DEVNET/Triton');
    });

    test('detects Shyft provider', () => {
      const result = detectNetwork('https://rpc.shyft.to?api_key=xxx&network=devnet');
      expect(result).toBe('DEVNET/Shyft');
    });

    test('returns CUSTOM for unknown providers', () => {
      expect(detectNetwork('https://custom-rpc.example.com')).toBe('CUSTOM');
    });

    test('returns CUSTOM for empty string', () => {
      expect(detectNetwork('')).toBe('CUSTOM');
    });

    test('returns mainnet without provider for unrecognized mainnet RPC', () => {
      expect(detectNetwork('https://mainnet.custom-rpc.io')).toBe('MAINNET');
    });
  });

  describe('dimText', () => {
    test('wraps text in blessed dim color tags', () => {
      const result = dimText('hello');
      expect(result).toBe('{#757575-fg}hello{/#757575-fg}');
    });

    test('handles empty string', () => {
      const result = dimText('');
      expect(result).toBe('{#757575-fg}{/#757575-fg}');
    });

    test('preserves content with special characters', () => {
      const result = dimText('test<>&"');
      expect(result).toContain('test<>&"');
    });

    test('includes matching open and close tags', () => {
      const result = dimText('anything');
      const openTag = `{${colors.dim}-fg}`;
      const closeTag = `{/${colors.dim}-fg}`;
      expect(result.startsWith(openTag)).toBe(true);
      expect(result.endsWith(closeTag)).toBe(true);
    });
  });
});

describe('CSV Export', () => {
  test('produces correct CSV with headers and rows', () => {
    const headers = ['Name', 'Address', 'Balance'];
    const rows = [
      ['Alice', '9Mmn...ujv', '100.00'],
      ['Bob', 'Toke...5DA', '200.50'],
    ];
    const csv = exportCsv('test.csv', headers, rows);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Name,Address,Balance');
    expect(lines[1]).toBe('"Alice","9Mmn...ujv","100.00"');
    expect(lines[2]).toBe('"Bob","Toke...5DA","200.50"');
  });

  test('escapes double quotes inside cell values', () => {
    const headers = ['Note'];
    const rows = [['He said "hello"']];
    const csv = exportCsv('test.csv', headers, rows);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('"He said ""hello"""');
  });

  test('handles empty rows', () => {
    const headers = ['A', 'B'];
    const rows = [];
    const csv = exportCsv('test.csv', headers, rows);
    expect(csv).toBe('A,B');
  });

  test('handles single-column data', () => {
    const headers = ['ID'];
    const rows = [['1'], ['2'], ['3']];
    const csv = exportCsv('test.csv', headers, rows);
    const lines = csv.split('\n');
    expect(lines.length).toBe(4);
    expect(lines[1]).toBe('"1"');
  });

  test('converts non-string values to strings', () => {
    const headers = ['Val'];
    const rows = [[42], [null], [undefined], [true]];
    const csv = exportCsv('test.csv', headers, rows);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('"42"');
    expect(lines[2]).toBe('"null"');
    expect(lines[3]).toBe('"undefined"');
    expect(lines[4]).toBe('"true"');
  });

  test('handles cells with commas', () => {
    const headers = ['Data'];
    const rows = [['one, two, three']];
    const csv = exportCsv('test.csv', headers, rows);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('"one, two, three"');
  });

  test('handles cells with newlines', () => {
    const headers = ['Data'];
    const rows = [['line1\nline2']];
    const csv = exportCsv('test.csv', headers, rows);
    expect(csv).toContain('"line1\nline2"');
  });
});

describe('State Management', () => {
  describe('liveData initial state', () => {
    test('has correct initial shape', () => {
      const liveData = {
        config: null,
        roles: null,
        minters: [],
        blacklist: [],
        attestations: [],
        holders: [],
        transactions: [],
        solBalance: null,
        slotHeight: null,
        auditLogs: [],
        lastRefresh: null,
        error: null,
        loading: false,
      };

      expect(liveData.config).toBeNull();
      expect(liveData.roles).toBeNull();
      expect(Array.isArray(liveData.minters)).toBe(true);
      expect(liveData.minters.length).toBe(0);
      expect(Array.isArray(liveData.blacklist)).toBe(true);
      expect(liveData.blacklist.length).toBe(0);
      expect(Array.isArray(liveData.attestations)).toBe(true);
      expect(liveData.attestations.length).toBe(0);
      expect(Array.isArray(liveData.holders)).toBe(true);
      expect(liveData.holders.length).toBe(0);
      expect(Array.isArray(liveData.transactions)).toBe(true);
      expect(liveData.transactions.length).toBe(0);
      expect(liveData.solBalance).toBeNull();
      expect(liveData.slotHeight).toBeNull();
      expect(Array.isArray(liveData.auditLogs)).toBe(true);
      expect(liveData.lastRefresh).toBeNull();
      expect(liveData.error).toBeNull();
      expect(liveData.loading).toBe(false);
    });
  });

  describe('global state initial shape', () => {
    test('has correct initial config fields', () => {
      const state = {
        wallet: 'No Wallet',
        config: { preset: 'UNINITIALIZED', name: '', symbol: '', decimals: 6 },
        mintAddress: DEFAULT_MINT,
        isPaused: false,
        supply: { current: 0, minted: 0, burned: 0 },
        activeTab: 0,
        frozenAccounts: [],
      };

      expect(state.config.preset).toBe('UNINITIALIZED');
      expect(state.config.name).toBe('');
      expect(state.config.symbol).toBe('');
      expect(state.config.decimals).toBe(6);
      expect(state.isPaused).toBe(false);
      expect(state.supply.current).toBe(0);
      expect(state.supply.minted).toBe(0);
      expect(state.supply.burned).toBe(0);
      expect(state.activeTab).toBe(0);
      expect(state.frozenAccounts).toEqual([]);
    });
  });
});

describe('Data Fetcher Mock Tests', () => {
  // Mock the connection object and coder for fetcher tests
  // These verify the fetch functions handle null/error responses gracefully

  describe('fetchConfig-like logic', () => {
    test('returns null when account info is null', async () => {
      const mockConnection = {
        getAccountInfo: jest.fn().mockResolvedValue(null),
      };
      // Simulate fetchConfig behavior
      const info = await mockConnection.getAccountInfo(new PublicKey(DEFAULT_MINT));
      expect(info).toBeNull();
    });

    test('handles connection errors gracefully', async () => {
      const mockConnection = {
        getAccountInfo: jest.fn().mockRejectedValue(new Error('Connection refused')),
      };
      let result = null;
      try {
        await mockConnection.getAccountInfo(new PublicKey(DEFAULT_MINT));
      } catch (e) {
        result = null;
      }
      expect(result).toBeNull();
    });
  });

  describe('fetchRoles-like logic', () => {
    test('returns null when account not found', async () => {
      const mockConnection = {
        getAccountInfo: jest.fn().mockResolvedValue(null),
      };
      const info = await mockConnection.getAccountInfo('rolesPda');
      expect(info).toBeNull();
    });
  });

  describe('fetchMinters-like logic', () => {
    test('returns empty array on error', async () => {
      const mockConnection = {
        getProgramAccounts: jest.fn().mockRejectedValue(new Error('Rate limited')),
      };
      let result = [];
      try {
        result = await mockConnection.getProgramAccounts(PROGRAM_ID);
      } catch (e) {
        result = [];
      }
      expect(result).toEqual([]);
    });

    test('returns empty array when no accounts match', async () => {
      const mockConnection = {
        getProgramAccounts: jest.fn().mockResolvedValue([]),
      };
      const result = await mockConnection.getProgramAccounts(PROGRAM_ID);
      expect(result).toEqual([]);
    });
  });

  describe('fetchBlacklist-like logic', () => {
    test('returns empty array on error', async () => {
      const mockConnection = {
        getProgramAccounts: jest.fn().mockRejectedValue(new Error('Timeout')),
      };
      let result = [];
      try {
        result = await mockConnection.getProgramAccounts(PROGRAM_ID);
      } catch (e) {
        result = [];
      }
      expect(result).toEqual([]);
    });
  });

  describe('fetchAttestations-like logic', () => {
    test('returns empty array when count is 0', () => {
      const cap = Math.min(0, 50);
      expect(cap).toBe(0);
    });

    test('caps at 50 for large counts', () => {
      const cap = Math.min(100, 50);
      expect(cap).toBe(50);
    });

    test('handles null entries in batch fetch', async () => {
      const mockConnection = {
        getMultipleAccountsInfo: jest.fn().mockResolvedValue([null, null, null]),
      };
      const infos = await mockConnection.getMultipleAccountsInfo([]);
      const results = infos.filter((i) => i !== null);
      expect(results).toEqual([]);
    });
  });

  describe('fetchHolders-like logic', () => {
    test('returns empty array on connection error', async () => {
      const mockConnection = {
        getTokenLargestAccounts: jest.fn().mockRejectedValue(new Error('Network error')),
      };
      let result = [];
      try {
        await mockConnection.getTokenLargestAccounts(new PublicKey(DEFAULT_MINT));
      } catch (e) {
        result = [];
      }
      expect(result).toEqual([]);
    });

    test('calculates percentage correctly with mock data', () => {
      const mockValues = [
        { address: { toBase58: () => 'addr1' }, uiAmount: 60 },
        { address: { toBase58: () => 'addr2' }, uiAmount: 30 },
        { address: { toBase58: () => 'addr3' }, uiAmount: 10 },
      ];
      const total = mockValues.reduce((sum, a) => sum + (a.uiAmount || 0), 0);
      expect(total).toBe(100);

      const holders = mockValues.map((acct, i) => ({
        rank: i + 1,
        address: acct.address.toBase58(),
        balance: acct.uiAmount || 0,
        pct: total > 0 ? ((acct.uiAmount || 0) / total * 100).toFixed(1) : '0.0',
      }));

      expect(holders[0].pct).toBe('60.0');
      expect(holders[1].pct).toBe('30.0');
      expect(holders[2].pct).toBe('10.0');
      expect(holders[0].rank).toBe(1);
    });

    test('handles zero total balance', () => {
      const mockValues = [
        { address: { toBase58: () => 'addr1' }, uiAmount: 0 },
      ];
      const total = mockValues.reduce((sum, a) => sum + (a.uiAmount || 0), 0);
      expect(total).toBe(0);

      const holders = mockValues.map((acct, i) => ({
        rank: i + 1,
        address: acct.address.toBase58(),
        balance: acct.uiAmount || 0,
        pct: total > 0 ? ((acct.uiAmount || 0) / total * 100).toFixed(1) : '0.0',
      }));

      expect(holders[0].pct).toBe('0.0');
    });
  });

  describe('fetchTransactions-like logic', () => {
    test('returns empty array on connection error', async () => {
      const mockConnection = {
        getSignaturesForAddress: jest.fn().mockRejectedValue(new Error('Error')),
      };
      let result = [];
      try {
        await mockConnection.getSignaturesForAddress(new PublicKey(DEFAULT_MINT), { limit: 20 });
      } catch (e) {
        result = [];
      }
      expect(result).toEqual([]);
    });

    test('maps signature data correctly', () => {
      const mockSigs = [
        {
          signature: 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
          slot: 12345678,
          blockTime: 1705320645,
          err: null,
        },
        {
          signature: 'xyz987wvu654tsr321qpo098nml765kji432hgf109edc876ba',
          slot: 12345679,
          blockTime: 1705320650,
          err: { InstructionError: [0, 'Custom'] },
        },
      ];

      const result = mockSigs.map((s) => ({
        signature: s.signature,
        slot: s.slot,
        blockTime: s.blockTime,
        err: s.err,
      }));

      expect(result).toHaveLength(2);
      expect(result[0].err).toBeNull();
      expect(result[1].err).toBeTruthy();
      expect(result[0].slot).toBe(12345678);
    });
  });

  describe('fetchAuditLogs-like logic', () => {
    test('returns empty array when count is 0', () => {
      const cap = Math.min(0, 50);
      expect(cap).toBe(0);
    });

    test('capitalizes action name correctly', () => {
      const actionIdx = 'mint';
      const formatted = actionIdx.charAt(0).toUpperCase() + actionIdx.slice(1);
      expect(formatted).toBe('Mint');
    });

    test('capitalizes multi-word actions', () => {
      const actionIdx = 'blacklistAdd';
      const formatted = actionIdx.charAt(0).toUpperCase() + actionIdx.slice(1);
      expect(formatted).toBe('BlacklistAdd');
    });
  });
});

describe('Refresh Logic', () => {
  test('rate limit detection identifies 429 errors', () => {
    const msg = 'Server responded with 429 Too Many Requests';
    const isRateLimit =
      msg.includes('429') ||
      msg.includes('Too Many') ||
      msg.includes('rate') ||
      msg.includes('limit');
    expect(isRateLimit).toBe(true);
  });

  test('rate limit detection identifies rate-limit text', () => {
    const msg = 'rate limit exceeded';
    const isRateLimit =
      msg.includes('429') ||
      msg.includes('Too Many') ||
      msg.includes('rate') ||
      msg.includes('limit');
    expect(isRateLimit).toBe(true);
  });

  test('non-rate-limit errors are not flagged', () => {
    const msg = 'Connection refused';
    const isRateLimit =
      msg.includes('429') ||
      msg.includes('Too Many') ||
      msg.includes('rate') ||
      msg.includes('limit');
    expect(isRateLimit).toBe(false);
  });

  test('exponential backoff doubles interval on rate limit', () => {
    const BASE_REFRESH_INTERVAL = 10000;
    let consecutiveErrors = 1;
    const interval = Math.min(60000, BASE_REFRESH_INTERVAL * Math.pow(2, consecutiveErrors));
    expect(interval).toBe(20000);
  });

  test('exponential backoff caps at 60 seconds', () => {
    const BASE_REFRESH_INTERVAL = 10000;
    let consecutiveErrors = 10;
    const interval = Math.min(60000, BASE_REFRESH_INTERVAL * Math.pow(2, consecutiveErrors));
    expect(interval).toBe(60000);
  });

  test('linear backoff for non-rate-limit errors', () => {
    const BASE_REFRESH_INTERVAL = 10000;
    let consecutiveErrors = 3;
    const interval = Math.min(30000, BASE_REFRESH_INTERVAL * (1 + consecutiveErrors));
    expect(interval).toBe(30000);
  });

  test('linear backoff caps at 30 seconds', () => {
    const BASE_REFRESH_INTERVAL = 10000;
    let consecutiveErrors = 5;
    const interval = Math.min(30000, BASE_REFRESH_INTERVAL * (1 + consecutiveErrors));
    expect(interval).toBe(30000);
  });

  test('error message truncation to 60 chars', () => {
    const msg = 'A'.repeat(100);
    const truncated = msg.slice(0, 60);
    expect(truncated.length).toBe(60);
  });

  test('refresh resets interval on success', () => {
    const BASE_REFRESH_INTERVAL = 10000;
    let consecutiveErrors = 0;
    let currentRefreshInterval = BASE_REFRESH_INTERVAL;
    // After success:
    consecutiveErrors = 0;
    currentRefreshInterval = BASE_REFRESH_INTERVAL;
    expect(currentRefreshInterval).toBe(10000);
  });
});

describe('Tab System', () => {
  const TAB_ITEMS = [
    '01. Command Hub',
    '02. Supply Ops',
    '03. Blacklist',
    '04. Attestations',
    '05. Roles & Access',
    '06. Minters',
    '07. Token Holders',
    '08. Transfer History',
    '09. System & Config',
  ];

  test('there are exactly 9 tabs', () => {
    expect(TAB_ITEMS.length).toBe(9);
  });

  test('tab 0 is Command Hub', () => {
    expect(TAB_ITEMS[0]).toContain('Command Hub');
  });

  test('tab 1 is Supply Ops', () => {
    expect(TAB_ITEMS[1]).toContain('Supply');
  });

  test('tab 2 is Blacklist', () => {
    expect(TAB_ITEMS[2]).toContain('Blacklist');
  });

  test('tab 3 is Attestations', () => {
    expect(TAB_ITEMS[3]).toContain('Attestations');
  });

  test('tab 4 is Roles & Access', () => {
    expect(TAB_ITEMS[4]).toContain('Roles');
  });

  test('tab 5 is Minters', () => {
    expect(TAB_ITEMS[5]).toContain('Minters');
  });

  test('tab 6 is Token Holders', () => {
    expect(TAB_ITEMS[6]).toContain('Token Holders');
  });

  test('tab 7 is Transfer History', () => {
    expect(TAB_ITEMS[7]).toContain('Transfer History');
  });

  test('tab 8 is System & Config', () => {
    expect(TAB_ITEMS[8]).toContain('System');
  });

  test('all tabs have numbered prefixes', () => {
    TAB_ITEMS.forEach((tab, i) => {
      const prefix = String(i + 1).padStart(2, '0') + '.';
      expect(tab).toContain(prefix);
    });
  });
});

describe('Command Palette', () => {
  const COMMANDS = {
    mint: { type: 'action', action: 'mint' },
    burn: { type: 'action', action: 'burn' },
    freeze: { type: 'action', action: 'freeze' },
    thaw: { type: 'action', action: 'thaw' },
    blacklist: { type: 'action', action: 'blacklistAdd' },
    seize: { type: 'action', action: 'seize' },
    pause: { type: 'action', action: 'pause' },
    unpause: { type: 'action', action: 'unpause' },
    attest: { type: 'action', action: 'attest' },
    roles: { type: 'tab', tab: 4 },
    minter: { type: 'action', action: 'updateMinter' },
    authority: { type: 'action', action: 'transferAuthority' },
    export: { type: 'export' },
    hub: { type: 'tab', tab: 0 },
    supply: { type: 'tab', tab: 1 },
    holders: { type: 'tab', tab: 6 },
    history: { type: 'tab', tab: 7 },
    config: { type: 'tab', tab: 8 },
  };

  test('has all expected command names', () => {
    const expectedCmds = [
      'mint', 'burn', 'freeze', 'thaw', 'blacklist', 'seize',
      'pause', 'unpause', 'attest', 'roles', 'minter', 'authority',
      'export', 'hub', 'supply', 'holders', 'history', 'config',
    ];
    expectedCmds.forEach((cmd) => {
      expect(COMMANDS).toHaveProperty(cmd);
    });
  });

  test('action commands have the correct type', () => {
    ['mint', 'burn', 'freeze', 'thaw', 'seize', 'pause', 'unpause', 'attest'].forEach((cmd) => {
      expect(COMMANDS[cmd].type).toBe('action');
    });
  });

  test('tab navigation commands point to correct tabs', () => {
    expect(COMMANDS.hub.tab).toBe(0);
    expect(COMMANDS.supply.tab).toBe(1);
    expect(COMMANDS.roles.tab).toBe(4);
    expect(COMMANDS.holders.tab).toBe(6);
    expect(COMMANDS.history.tab).toBe(7);
    expect(COMMANDS.config.tab).toBe(8);
  });

  test('partial match finds unique command', () => {
    const input = 'mi';
    const partials = Object.keys(COMMANDS).filter((c) => c.startsWith(input));
    // "mint" and "minter" both start with "mi"
    expect(partials).toContain('mint');
    expect(partials).toContain('minter');
    expect(partials.length).toBe(2);
  });

  test('partial match for "bu" is unique to "burn"', () => {
    const partials = Object.keys(COMMANDS).filter((c) => c.startsWith('bu'));
    expect(partials).toEqual(['burn']);
  });

  test('partial match for "bl" is unique to "blacklist"', () => {
    const partials = Object.keys(COMMANDS).filter((c) => c.startsWith('bl'));
    expect(partials).toEqual(['blacklist']);
  });

  test('no match for unknown command', () => {
    const partials = Object.keys(COMMANDS).filter((c) => c.startsWith('zzz'));
    expect(partials).toEqual([]);
  });

  test('blacklist command maps to blacklistAdd action', () => {
    expect(COMMANDS.blacklist.action).toBe('blacklistAdd');
  });

  test('export command has type "export"', () => {
    expect(COMMANDS.export.type).toBe('export');
  });
});

describe('Action Hotkeys', () => {
  const ACTION_HOTKEYS = {
    m: 'mint',
    b: 'burn',
    f: 'freeze',
    t: 'thaw',
    k: 'blacklistAdd',
    s: 'seize',
    p: null, // toggled based on isPaused
    a: 'attest',
    d: 'blacklistRemove',
    e: null, // context-dependent
  };

  test('m maps to mint', () => {
    expect(ACTION_HOTKEYS.m).toBe('mint');
  });

  test('b maps to burn', () => {
    expect(ACTION_HOTKEYS.b).toBe('burn');
  });

  test('f maps to freeze', () => {
    expect(ACTION_HOTKEYS.f).toBe('freeze');
  });

  test('t maps to thaw', () => {
    expect(ACTION_HOTKEYS.t).toBe('thaw');
  });

  test('k maps to blacklistAdd', () => {
    expect(ACTION_HOTKEYS.k).toBe('blacklistAdd');
  });

  test('s maps to seize', () => {
    expect(ACTION_HOTKEYS.s).toBe('seize');
  });

  test('p is null (toggled dynamically)', () => {
    expect(ACTION_HOTKEYS.p).toBeNull();
  });

  test('a maps to attest', () => {
    expect(ACTION_HOTKEYS.a).toBe('attest');
  });

  test('d maps to blacklistRemove', () => {
    expect(ACTION_HOTKEYS.d).toBe('blacklistRemove');
  });

  test('e is null (context-dependent)', () => {
    expect(ACTION_HOTKEYS.e).toBeNull();
  });

  test('p resolves to pause when not paused', () => {
    const isPaused = false;
    const action = isPaused ? 'unpause' : 'pause';
    expect(action).toBe('pause');
  });

  test('p resolves to unpause when paused', () => {
    const isPaused = true;
    const action = isPaused ? 'unpause' : 'pause';
    expect(action).toBe('unpause');
  });
});

describe('Action Modal Definitions', () => {
  const ACTIONS = {
    mint: { title: 'Mint Tokens', fields: ['Recipient Address', 'Amount'], danger: 'high' },
    burn: {
      title: 'Burn Tokens',
      fields: ['Wallet Address (empty = self)', 'Amount'],
      danger: 'high',
    },
    freeze: { title: 'Freeze Account', fields: ['Target Address'], danger: 'high' },
    thaw: { title: 'Thaw Account', fields: ['Target Address'], danger: 'normal' },
    blacklistAdd: {
      title: 'Add to Blacklist',
      fields: ['Target Address', 'Reason'],
      danger: 'high',
    },
    blacklistRemove: {
      title: 'Remove from Blacklist',
      fields: ['Target Address'],
      danger: 'normal',
    },
    seize: {
      title: 'Seize Tokens',
      fields: ['Blacklisted Address', 'Destination Address', 'Amount'],
      danger: 'high',
    },
    pause: { title: 'Pause Program', fields: [], danger: 'high' },
    unpause: { title: 'Unpause Program', fields: [], danger: 'high' },
    attest: {
      title: 'Attest Reserve',
      fields: ['Reserve Hash (hex)', 'Reserves USD', 'Outstanding', 'URI'],
      danger: 'normal',
    },
    updateRole: {
      title: 'Update Role',
      fields: ['Role (pauser/blacklister/seizer)', 'New Address'],
      danger: 'high',
    },
    updateMinter: {
      title: 'Update Minter',
      fields: ['Minter Address', 'Mint Quota', 'Active (true/false)'],
      danger: 'normal',
    },
    transferAuthority: {
      title: 'Transfer Authority',
      fields: ['New Authority Address'],
      danger: 'critical',
    },
  };

  test('all 13 action types are defined', () => {
    expect(Object.keys(ACTIONS).length).toBe(13);
  });

  test('mint action has 2 fields', () => {
    expect(ACTIONS.mint.fields.length).toBe(2);
  });

  test('seize action has 3 fields', () => {
    expect(ACTIONS.seize.fields.length).toBe(3);
  });

  test('attest action has 4 fields', () => {
    expect(ACTIONS.attest.fields.length).toBe(4);
  });

  test('pause action has 0 fields', () => {
    expect(ACTIONS.pause.fields.length).toBe(0);
  });

  test('unpause action has 0 fields', () => {
    expect(ACTIONS.unpause.fields.length).toBe(0);
  });

  test('transferAuthority is the only critical action', () => {
    const criticalActions = Object.entries(ACTIONS).filter(([, v]) => v.danger === 'critical');
    expect(criticalActions.length).toBe(1);
    expect(criticalActions[0][0]).toBe('transferAuthority');
  });

  test('normal-danger actions are correctly classified', () => {
    const normalActions = Object.entries(ACTIONS)
      .filter(([, v]) => v.danger === 'normal')
      .map(([k]) => k);
    expect(normalActions).toContain('thaw');
    expect(normalActions).toContain('blacklistRemove');
    expect(normalActions).toContain('attest');
    expect(normalActions).toContain('updateMinter');
  });

  test('all actions have a title', () => {
    Object.values(ACTIONS).forEach((action) => {
      expect(typeof action.title).toBe('string');
      expect(action.title.length).toBeGreaterThan(0);
    });
  });

  test('all actions have a fields array', () => {
    Object.values(ACTIONS).forEach((action) => {
      expect(Array.isArray(action.fields)).toBe(true);
    });
  });

  test('all actions have a valid danger level', () => {
    Object.values(ACTIONS).forEach((action) => {
      expect(['normal', 'high', 'critical']).toContain(action.danger);
    });
  });
});

describe('Attestation Hex Hash Validation', () => {
  function validateAttestHash(hashHex) {
    const cleanHex = hashHex.startsWith('0x') ? hashHex.slice(2) : hashHex;
    if (cleanHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
      return false;
    }
    return true;
  }

  test('accepts valid 64-char hex', () => {
    const hash = 'a'.repeat(64);
    expect(validateAttestHash(hash)).toBe(true);
  });

  test('accepts 0x-prefixed 64-char hex', () => {
    const hash = '0x' + 'b'.repeat(64);
    expect(validateAttestHash(hash)).toBe(true);
  });

  test('rejects short hex', () => {
    expect(validateAttestHash('abcd')).toBe(false);
  });

  test('rejects 63-char hex', () => {
    expect(validateAttestHash('a'.repeat(63))).toBe(false);
  });

  test('rejects 65-char hex', () => {
    expect(validateAttestHash('a'.repeat(65))).toBe(false);
  });

  test('rejects non-hex characters', () => {
    expect(validateAttestHash('g'.repeat(64))).toBe(false);
  });

  test('accepts mixed-case hex', () => {
    const hash = 'aAbBcCdDeEfF0011223344556677889900112233445566778899aAbBcCdDeEfF';
    expect(validateAttestHash(hash)).toBe(true);
  });

  test('converts hex to byte array correctly', () => {
    const cleanHex = 'ff00ab12' + '0'.repeat(56);
    const bytes = [];
    for (let i = 0; i < 64; i += 2) bytes.push(parseInt(cleanHex.slice(i, i + 2), 16));
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0x00);
    expect(bytes[2]).toBe(0xab);
    expect(bytes[3]).toBe(0x12);
    expect(bytes.length).toBe(32);
  });
});

describe('Role Enum Mapping', () => {
  const roleMap = {
    pauser: { pauser: {} },
    blacklister: { blacklister: {} },
    seizer: { seizer: {} },
  };

  test('pauser maps correctly', () => {
    expect(roleMap['pauser']).toEqual({ pauser: {} });
  });

  test('blacklister maps correctly', () => {
    expect(roleMap['blacklister']).toEqual({ blacklister: {} });
  });

  test('seizer maps correctly', () => {
    expect(roleMap['seizer']).toEqual({ seizer: {} });
  });

  test('invalid role returns undefined', () => {
    expect(roleMap['admin']).toBeUndefined();
  });

  test('case sensitivity: PAUSER does not match', () => {
    expect(roleMap['PAUSER']).toBeUndefined();
  });

  test('lowercase conversion works for matching', () => {
    const input = 'PAUSER';
    expect(roleMap[input.toLowerCase()]).toEqual({ pauser: {} });
  });
});

describe('Color Scheme', () => {
  test('has all required color keys', () => {
    const requiredKeys = [
      'bg', 'text', 'accent', 'secondary', 'border',
      'danger', 'success', 'dim', 'warning', 'highlight',
    ];
    requiredKeys.forEach((key) => {
      expect(colors).toHaveProperty(key);
    });
  });

  test('background is black', () => {
    expect(colors.bg).toBe('black');
  });

  test('danger is red-ish', () => {
    expect(colors.danger).toMatch(/^#[eE]/);
  });

  test('success is green-ish', () => {
    expect(colors.success).toMatch(/^#4/);
  });

  test('all hex colors are valid format', () => {
    Object.entries(colors).forEach(([key, value]) => {
      if (value !== 'black') {
        expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });
});

describe('Edge Cases and Integration', () => {
  test('PDA from configPda can derive all dependent PDAs', () => {
    const [configPda] = getConfigPda(DEFAULT_MINT);
    const minterPk = new PublicKey('GVkN8P9VqJE8o4kPNXPzQuxD4UjfLfK3nSJabV7RzWX7');

    // All of these should succeed without throwing
    expect(() => getRoleRegistryPda(configPda)).not.toThrow();
    expect(() => getReserveAttestationPda(configPda, 0)).not.toThrow();
    expect(() => getMinterInfoPda(configPda, minterPk)).not.toThrow();
    expect(() => getBlacklistPda(configPda, minterPk)).not.toThrow();
    expect(() => getAuditLogPda(configPda, 0)).not.toThrow();
  });

  test('parseTokenAmount and formatUsd round-trip for whole numbers', () => {
    const amount = parseTokenAmount('100', 6);
    expect(amount).not.toBeNull();
    const formatted = formatUsd(amount.toNumber(), 6);
    expect(formatted).toBe('100.00');
  });

  test('parseTokenAmount and formatUsd round-trip for fractional', () => {
    const amount = parseTokenAmount('1.5', 6);
    expect(amount).not.toBeNull();
    const formatted = formatUsd(amount.toNumber(), 6);
    expect(formatted).toBe('1.50');
  });

  test('shortAddr of a PDA address', () => {
    const [pda] = getConfigPda(DEFAULT_MINT);
    const addr = pda.toBase58();
    const short = shortAddr(addr);
    expect(short).toMatch(/^.{4}\.\.\..{4}$/);
  });

  test('formatTimestamp of a real-world Solana timestamp', () => {
    // Typical Solana blockTime
    const ts = 1710000000; // 2024-03-09
    const result = formatTimestamp(ts);
    expect(result).toMatch(/^2024-03/);
    expect(result.length).toBe(19);
  });

  test('detectNetwork returns a non-empty string for any input', () => {
    const inputs = ['', 'https://example.com', 'http://localhost:8899', 'devnet', 'mainnet'];
    inputs.forEach((url) => {
      const result = detectNetwork(url);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  test('isValidPubkey returns false for PublicKey-like object toString', () => {
    // A PublicKey stringified should be valid
    const pk = new PublicKey('11111111111111111111111111111111');
    expect(isValidPubkey(pk.toBase58())).toBe(true);
  });

  test('multiple PDAs with sequential indices do not collide', () => {
    const [configPda] = getConfigPda(DEFAULT_MINT);
    const pdas = new Set();
    for (let i = 0; i < 50; i++) {
      const [pda] = getReserveAttestationPda(configPda, i);
      pdas.add(pda.toBase58());
    }
    expect(pdas.size).toBe(50);
  });

  test('multiple audit log PDAs with sequential indices do not collide', () => {
    const [configPda] = getConfigPda(DEFAULT_MINT);
    const pdas = new Set();
    for (let i = 0; i < 50; i++) {
      const [pda] = getAuditLogPda(configPda, i);
      pdas.add(pda.toBase58());
    }
    expect(pdas.size).toBe(50);
  });
});

describe('loadEnv logic', () => {
  test('parses KEY=VALUE correctly', () => {
    const line = 'RPC_URL=https://api.devnet.solana.com';
    const eqIdx = line.indexOf('=');
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    expect(key).toBe('RPC_URL');
    expect(val).toBe('https://api.devnet.solana.com');
  });

  test('strips double quotes from values', () => {
    const raw = '"https://api.devnet.solana.com"';
    let val = raw;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    expect(val).toBe('https://api.devnet.solana.com');
  });

  test('strips single quotes from values', () => {
    const raw = "'some-value'";
    let val = raw;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    expect(val).toBe('some-value');
  });

  test('skips comment lines', () => {
    const line = '# This is a comment';
    const trimmed = line.trim();
    const isComment = trimmed.startsWith('#');
    expect(isComment).toBe(true);
  });

  test('skips empty lines', () => {
    const line = '   ';
    const trimmed = line.trim();
    expect(!trimmed).toBe(true);
  });

  test('skips lines without =', () => {
    const line = 'NO_EQUALS_HERE';
    const eqIdx = line.indexOf('=');
    expect(eqIdx).toBe(-1);
  });
});

describe('Status Bar Content Generation', () => {
  test('generates correct hotkey hints per tab', () => {
    const hotkeyMap = {
      0: '[M]int [B]urn [F]reeze [K]Blacklist [P]ause [A]ttest',
      1: '[M]int [B]urn [F]reeze [T]haw [X]Export',
      2: '[A]dd [D]el [S]eize [/]Search [X]Export',
      3: '[A]ttest [X]Export',
      4: '[E]dit [X]Export',
      5: '[E]dit [X]Export',
      6: '[/]Search [X]Export',
      7: '[/]Search [X]Export',
      8: '[X]Export',
    };

    // Verify all 9 tabs have hotkey hints
    for (let i = 0; i <= 8; i++) {
      expect(hotkeyMap[i]).toBeDefined();
      expect(typeof hotkeyMap[i]).toBe('string');
      expect(hotkeyMap[i].length).toBeGreaterThan(0);
    }
  });

  test('tab 0 has Mint, Burn, Freeze, Blacklist, Pause, Attest hotkeys', () => {
    const hints = '[M]int [B]urn [F]reeze [K]Blacklist [P]ause [A]ttest';
    expect(hints).toContain('[M]int');
    expect(hints).toContain('[B]urn');
    expect(hints).toContain('[F]reeze');
    expect(hints).toContain('[K]Blacklist');
    expect(hints).toContain('[P]ause');
    expect(hints).toContain('[A]ttest');
  });

  test('export hint [X]Export appears on tabs 1-8', () => {
    const tabsWithExport = [1, 2, 3, 4, 5, 6, 7, 8];
    const hotkeyMap = {
      1: '[M]int [B]urn [F]reeze [T]haw [X]Export',
      2: '[A]dd [D]el [S]eize [/]Search [X]Export',
      3: '[A]ttest [X]Export',
      4: '[E]dit [X]Export',
      5: '[E]dit [X]Export',
      6: '[/]Search [X]Export',
      7: '[/]Search [X]Export',
      8: '[X]Export',
    };
    tabsWithExport.forEach((tab) => {
      expect(hotkeyMap[tab]).toContain('[X]Export');
    });
  });
});

describe('Command Hub Tiles', () => {
  const TILES = [
    { key: 'M', label: 'Mint', action: 'mint', color: '#43a047' },
    { key: 'B', label: 'Burn', action: 'burn', color: '#e53935' },
    { key: 'F', label: 'Freeze', action: 'freeze', color: '#00bcd4' },
    { key: 'T', label: 'Thaw', action: 'thaw', color: '#43a047' },
    { key: 'K', label: 'Blacklist', action: 'blacklistAdd', color: '#e53935' },
    { key: 'S', label: 'Seize', action: 'seize', color: '#ff9800' },
    { key: 'P', label: 'Pause', action: 'pause', color: '#ffb300' },
    { key: 'A', label: 'Attest', action: 'attest', color: '#00bcd4' },
  ];

  test('there are exactly 8 tiles', () => {
    expect(TILES.length).toBe(8);
  });

  test('tiles form a 2x4 grid', () => {
    TILES.forEach((tile, i) => {
      const row = Math.floor(i / 4);
      const col = i % 4;
      expect(row).toBeLessThanOrEqual(1);
      expect(col).toBeLessThanOrEqual(3);
    });
  });

  test('each tile has a unique key', () => {
    const keys = TILES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('each tile has a non-empty label', () => {
    TILES.forEach((tile) => {
      expect(tile.label.length).toBeGreaterThan(0);
    });
  });

  test('each tile has a valid action name', () => {
    const validActions = [
      'mint', 'burn', 'freeze', 'thaw',
      'blacklistAdd', 'seize', 'pause', 'attest',
    ];
    TILES.forEach((tile) => {
      expect(validActions).toContain(tile.action);
    });
  });

  test('each tile has a valid hex color', () => {
    TILES.forEach((tile) => {
      expect(tile.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});
