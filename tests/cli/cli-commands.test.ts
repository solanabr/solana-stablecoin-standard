// @ts-nocheck
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Keypair } from "@solana/web3.js";

const ROOT = path.resolve(__dirname, "../..");
const CLI_BINARY = path.join(ROOT, "target", "debug", "sss-token");
const DEVNET_MINT = "9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv";
const PROGRAM_ID = "5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4";
const VALID_ADDRESS = Keypair.generate().publicKey.toBase58();
const VALID_TOKEN_ACCOUNT = Keypair.generate().publicKey.toBase58();
const VALID_HASH = "ab".repeat(32);

const ENABLE_DEVNET =
  process.env.SSS_CLI_DEVNET === "1" &&
  Boolean(process.env.SSS_CLI_DEVNET_KEYPAIR_PATH);

function quote(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function cliPrefix() {
  return fs.existsSync(CLI_BINARY)
    ? quote(CLI_BINARY)
    : "cargo run -q -p sss-cli --";
}

function bootstrapCli() {
  if (fs.existsSync(CLI_BINARY)) {
    return {
      ready: true,
      source: "existing-binary",
      error: null,
    };
  }

  try {
    execSync("cargo build -p sss-cli", {
      cwd: ROOT,
      timeout: 300_000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    return {
      ready: fs.existsSync(CLI_BINARY),
      source: "cargo-build",
      error: null,
    };
  } catch (error: any) {
    return {
      ready: false,
      source: "cargo-build",
      error: `${error.stdout?.toString() ?? ""}${error.stderr?.toString() ?? ""}`,
    };
  }
}

const CLI_BOOTSTRAP = bootstrapCli();
const describeCli = CLI_BOOTSTRAP.ready ? describe : describe.skip;

function runCli(
  args: string[],
  options: {
    expectFailure?: boolean;
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
  } = {}
) {
  const cmd = `${cliPrefix()} ${args.map(quote).join(" ")}`.trim();

  try {
    const stdout = execSync(cmd, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: options.timeoutMs ?? 30_000,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NO_COLOR: "1",
        CLICOLOR: "0",
        ...options.env,
      },
    });

    return {
      ok: true,
      stdout,
      stderr: "",
      combined: stdout,
      cmd,
    };
  } catch (error: any) {
    const stdout = error.stdout?.toString() ?? "";
    const stderr = error.stderr?.toString() ?? "";
    const combined = `${stdout}${stderr}`;

    if (!options.expectFailure) {
      throw new Error(`Command failed unexpectedly: ${cmd}\n${combined}`);
    }

    return {
      ok: false,
      stdout,
      stderr,
      combined,
      cmd,
    };
  }
}

describe("sss-token CLI bootstrap", () => {
  it("records whether the CLI binary is available for command execution", () => {
    if (CLI_BOOTSTRAP.ready) {
      expect(cliPrefix()).toContain("sss-token");
      return;
    }

    expect(CLI_BOOTSTRAP.error).toBeTruthy();
  });
});

describeCli("sss-token CLI contract", () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe("help output", () => {
    const helpCases = [
      { name: "init help describes the initialize command", args: ["init", "--help"], expected: "Initialize a new stablecoin" },
      { name: "mint help describes the mint command", args: ["mint", "--help"], expected: "Mint tokens" },
      { name: "burn help describes the burn command", args: ["burn", "--help"], expected: "Burn tokens" },
      { name: "freeze help describes the freeze command", args: ["freeze", "--help"], expected: "Freeze a token account" },
      { name: "thaw help describes the thaw command", args: ["thaw", "--help"], expected: "Thaw a token account" },
      { name: "pause help describes the pause command", args: ["pause", "--help"], expected: "Pause the program" },
      { name: "unpause help describes the unpause command", args: ["unpause", "--help"], expected: "Unpause the program" },
      { name: "blacklist add help shows nested blacklist management", args: ["blacklist", "add", "--help"], expected: "--token-account" },
      { name: "blacklist remove help shows nested blacklist removal", args: ["blacklist", "remove", "--help"], expected: "--token-account" },
      { name: "allowlist add help shows nested allowlist management", args: ["allowlist", "add", "--help"], expected: "--token-account" },
      { name: "allowlist remove help shows nested allowlist removal", args: ["allowlist", "remove", "--help"], expected: "--token-account" },
      { name: "seize help describes the blacklisted owner argument", args: ["seize", "--help"], expected: "--blacklisted-address" },
      { name: "roles help shows the new holder flag", args: ["roles", "--help"], expected: "--new-holder" },
      { name: "minter help shows direct minter update flags", args: ["minter", "--help"], expected: "--wallet" },
      { name: "nominate help shows the nominee flag", args: ["nominate", "--help"], expected: "--nominee" },
      { name: "accept-authority help shows the kebab-case command path", args: ["accept-authority", "--help"], expected: "--mint" },
      { name: "set-supply-cap help shows the cap flag", args: ["set-supply-cap", "--help"], expected: "--cap" },
      { name: "update-metadata help shows optional metadata fields", args: ["update-metadata", "--help"], expected: "--symbol" },
      { name: "attest help shows the reserve attestation flags", args: ["attest", "--help"], expected: "--reserves-usd" },
      { name: "info help shows the info command surface", args: ["info", "--help"], expected: "Display stablecoin info" },
      { name: "status help shows the status command surface", args: ["status", "--help"], expected: "Show stablecoin status summary" },
      { name: "supply help shows the supply command surface", args: ["supply", "--help"], expected: "Show supply details" },
      { name: "minters list help shows the nested minters list action", args: ["minters", "list", "--help"], expected: "--mint" },
      { name: "holders help shows the minimum balance filter", args: ["holders", "--help"], expected: "--min-balance" },
      { name: "audit-log help shows the audit filtering flags", args: ["audit-log", "--help"], expected: "--action" },
    ];

    test.each(helpCases)("$name", ({ args, expected }) => {
      const result = runCli(args);

      expect(result.combined).toContain("Usage:");
      expect(result.combined).toContain(expected);
      expect(result.combined).toContain("--url");
      expect(result.combined).toContain("--keypair");
      expect(result.combined).toContain("--commitment");
    });
  });

  describe("required argument validation", () => {
    const requiredArgCases = [
      { name: "init requires a preset", args: ["init"], expected: "--preset <PRESET>" },
      { name: "mint requires mint and recipient arguments", args: ["mint"], expected: "--mint <MINT>" },
      { name: "burn requires a token account argument", args: ["burn"], expected: "--token-account <TOKEN_ACCOUNT>" },
      { name: "freeze requires an account argument", args: ["freeze"], expected: "--account <ACCOUNT>" },
      { name: "thaw requires an account argument", args: ["thaw"], expected: "--account <ACCOUNT>" },
      { name: "pause requires a mint argument", args: ["pause"], expected: "--mint <MINT>" },
      { name: "unpause requires a mint argument", args: ["unpause"], expected: "--mint <MINT>" },
      { name: "blacklist add requires a mint argument", args: ["blacklist", "add"], expected: "--mint <MINT>" },
      { name: "blacklist remove requires a mint argument", args: ["blacklist", "remove"], expected: "--mint <MINT>" },
      { name: "allowlist add requires a mint argument", args: ["allowlist", "add"], expected: "--mint <MINT>" },
      { name: "allowlist remove requires a mint argument", args: ["allowlist", "remove"], expected: "--mint <MINT>" },
      { name: "seize requires the blacklisted address argument", args: ["seize"], expected: "--blacklisted-address <BLACKLISTED_ADDRESS>" },
      { name: "roles requires a role argument", args: ["roles"], expected: "--role <ROLE>" },
      { name: "minter requires a wallet argument", args: ["minter"], expected: "--wallet <WALLET>" },
      { name: "nominate requires a nominee argument", args: ["nominate"], expected: "--nominee <NOMINEE>" },
      { name: "accept-authority requires a mint argument", args: ["accept-authority"], expected: "--mint <MINT>" },
      { name: "set-supply-cap requires a cap argument", args: ["set-supply-cap"], expected: "--cap <CAP>" },
      { name: "update-metadata requires at least the mint argument", args: ["update-metadata"], expected: "--mint <MINT>" },
      { name: "attest requires a hash argument", args: ["attest"], expected: "--hash <HASH>" },
      { name: "info requires a mint argument", args: ["info"], expected: "--mint <MINT>" },
      { name: "status requires a mint argument", args: ["status"], expected: "--mint <MINT>" },
      { name: "supply requires a mint argument", args: ["supply"], expected: "--mint <MINT>" },
      { name: "minters list requires a mint argument", args: ["minters", "list"], expected: "--mint <MINT>" },
      { name: "holders requires a mint argument", args: ["holders"], expected: "--mint <MINT>" },
      { name: "audit-log requires a mint argument", args: ["audit-log"], expected: "--mint <MINT>" },
    ];

    test.each(requiredArgCases)("$name", ({ args, expected }) => {
      const result = runCli(args, { expectFailure: true });

      expect(result.combined).toContain(expected);
      expect(result.combined).toContain("Usage:");
    });
  });

  describe("invalid pubkey and parser validation", () => {
    const invalidPubkeyCases = [
      { name: "mint rejects an invalid mint pubkey", args: ["mint", "--mint", "not-a-pubkey", "--amount", "1", "--recipient", VALID_ADDRESS], expected: "invalid value 'not-a-pubkey'" },
      { name: "burn rejects an invalid token account pubkey", args: ["burn", "--mint", DEVNET_MINT, "--amount", "1", "--token-account", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "freeze rejects an invalid token account pubkey", args: ["freeze", "--mint", DEVNET_MINT, "--account", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "thaw rejects an invalid token account pubkey", args: ["thaw", "--mint", DEVNET_MINT, "--account", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "pause rejects an invalid mint pubkey", args: ["pause", "--mint", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "unpause rejects an invalid mint pubkey", args: ["unpause", "--mint", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "blacklist add rejects an invalid blacklist address", args: ["blacklist", "add", "--mint", DEVNET_MINT, "--address", "not-a-pubkey", "--token-account", VALID_TOKEN_ACCOUNT], expected: "invalid value 'not-a-pubkey'" },
      { name: "blacklist remove rejects an invalid token account", args: ["blacklist", "remove", "--mint", DEVNET_MINT, "--address", VALID_ADDRESS, "--token-account", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "allowlist add rejects an invalid allowlist address", args: ["allowlist", "add", "--mint", DEVNET_MINT, "--address", "not-a-pubkey", "--token-account", VALID_TOKEN_ACCOUNT], expected: "invalid value 'not-a-pubkey'" },
      { name: "allowlist remove rejects an invalid token account", args: ["allowlist", "remove", "--mint", DEVNET_MINT, "--address", VALID_ADDRESS, "--token-account", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "seize rejects an invalid destination token account", args: ["seize", "--mint", DEVNET_MINT, "--from", VALID_TOKEN_ACCOUNT, "--to", "not-a-pubkey", "--amount", "1", "--blacklisted-address", VALID_ADDRESS], expected: "invalid value 'not-a-pubkey'" },
      { name: "roles rejects an invalid new-holder pubkey", args: ["roles", "--mint", DEVNET_MINT, "--role", "pauser", "--new-holder", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "minter rejects an invalid wallet pubkey", args: ["minter", "--mint", DEVNET_MINT, "--wallet", "not-a-pubkey", "--active"], expected: "invalid value 'not-a-pubkey'" },
      { name: "nominate rejects an invalid nominee pubkey", args: ["nominate", "--mint", DEVNET_MINT, "--nominee", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "accept-authority rejects an invalid mint pubkey", args: ["accept-authority", "--mint", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "set-supply-cap rejects an invalid mint pubkey", args: ["set-supply-cap", "--mint", "not-a-pubkey", "--cap", "1"], expected: "invalid value 'not-a-pubkey'" },
      { name: "update-metadata rejects an invalid mint pubkey", args: ["update-metadata", "--mint", "not-a-pubkey", "--name", "Devnet USD"], expected: "invalid value 'not-a-pubkey'" },
      { name: "attest rejects an invalid mint pubkey", args: ["attest", "--mint", "not-a-pubkey", "--hash", VALID_HASH, "--reserves-usd", "1", "--outstanding", "1"], expected: "invalid value 'not-a-pubkey'" },
      { name: "info rejects an invalid mint pubkey", args: ["info", "--mint", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "status rejects an invalid mint pubkey", args: ["status", "--mint", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "supply rejects an invalid mint pubkey", args: ["supply", "--mint", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "minters list rejects an invalid mint pubkey", args: ["minters", "list", "--mint", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "holders rejects an invalid mint pubkey", args: ["holders", "--mint", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
      { name: "audit-log rejects an invalid mint pubkey", args: ["audit-log", "--mint", "not-a-pubkey"], expected: "invalid value 'not-a-pubkey'" },
    ];

    test.each(invalidPubkeyCases)("$name", ({ args, expected }) => {
      const result = runCli(args, { expectFailure: true });

      expect(result.combined).toContain(expected);
    });

    it("init rejects unsupported preset values before any RPC setup", () => {
      const result = runCli(
        ["init", "--preset", "bad-preset", "--name", "Devnet USD", "--symbol", "dUSD"],
        { expectFailure: true }
      );

      expect(result.combined).toContain("Invalid preset");
    });

    it("roles rejects unsupported role names through its custom parser", () => {
      const result = runCli(
        ["roles", "--mint", DEVNET_MINT, "--role", "masterAuthority", "--new-holder", VALID_ADDRESS],
        { expectFailure: true }
      );

      expect(result.combined).toContain("Invalid role");
    });

    it("attest rejects reserve hashes that are not 64 hexadecimal characters", () => {
      const result = runCli(
        ["attest", "--mint", DEVNET_MINT, "--hash", "deadbeef", "--reserves-usd", "1", "--outstanding", "1"],
        { expectFailure: true }
      );

      expect(result.combined).toContain("Hash must be 64 hex characters");
    });

    it("minters requires the nested list subcommand and rejects a bare minters invocation", () => {
      const result = runCli(["minters"], { expectFailure: true });

      expect(result.combined).toContain("Usage:");
      expect(result.combined).toContain("list");
    });
  });

  describe("global argument handling", () => {
    it("falls back to confirmed commitment for unknown commitment strings instead of clap-failing", () => {
      const result = runCli(
        [
          "--commitment",
          "unknown-commitment",
          "info",
          "--mint",
          DEVNET_MINT,
        ],
        {
          expectFailure: true,
          env: {
            HOME: "",
          },
        }
      );

      expect(result.combined).not.toContain("invalid value 'unknown-commitment'");
      expect(result.combined).toContain("Failed to read keypair");
    });

    it("fails early when HOME is unset and the default ~ keypair path cannot be resolved", () => {
      const result = runCli(
        ["info", "--mint", DEVNET_MINT],
        {
          expectFailure: true,
          env: {
            HOME: "",
          },
        }
      );

      expect(result.combined).toContain("HOME environment variable not set");
    });
  });

  const describeDevnet = ENABLE_DEVNET ? describe : describe.skip;

  describeDevnet("optional devnet smoke tests", () => {
    const keypairPath = process.env.SSS_CLI_DEVNET_KEYPAIR_PATH as string;
    const baseArgs = ["--url", "https://api.devnet.solana.com", "--keypair", keypairPath];

    const smokeCases = [
      { name: "info reads the live devnet stablecoin config", args: [...baseArgs, "info", "--mint", DEVNET_MINT], expected: "Mint:" },
      { name: "status reads the live devnet stablecoin status", args: [...baseArgs, "status", "--mint", DEVNET_MINT], expected: "Stablecoin Status" },
      { name: "supply reads the live devnet supply summary", args: [...baseArgs, "supply", "--mint", DEVNET_MINT], expected: "Supply Details" },
      { name: "minters list reads the live devnet minter registry", args: [...baseArgs, "minters", "list", "--mint", DEVNET_MINT], expectedOneOf: ["Minters", "No minters found"] },
      { name: "holders reads the live devnet holder set", args: [...baseArgs, "holders", "--mint", DEVNET_MINT], expectedOneOf: ["Token Holders", "No holders found"] },
      { name: "audit-log reads the live devnet attestation history", args: [...baseArgs, "audit-log", "--mint", DEVNET_MINT, "--limit", "1"], expectedOneOf: ["Reserve Attestations", "No attestations recorded"] },
    ];

    test.each(smokeCases)("$name", ({ args, expected, expectedOneOf }) => {
      const result = runCli(args, {
        timeoutMs: 60_000,
      });

      expect(result.ok).toBe(true);
      expect(result.stdout.length).toBeGreaterThan(0);

      if (expected) {
        expect(result.stdout).toContain(expected);
      }

      if (expectedOneOf) {
        expect(expectedOneOf.some((needle: string) => result.stdout.includes(needle))).toBe(
          true
        );
      }
    });
  });
});
