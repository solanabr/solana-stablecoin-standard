// @ts-nocheck
import { Keypair, PublicKey } from "@solana/web3.js";

const DEVNET_MINT = "9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv";

function createWidget(overrides: Record<string, any> = {}) {
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

function createBlessedMock() {
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

function loadTuiModule() {
  jest.resetModules();
  process.env.SSS_TUI_TEST_MODE = "1";
  jest.doMock("blessed", () => createBlessedMock(), { virtual: true });
  jest.doMock("blessed-contrib", () => ({}), { virtual: true });
  return require("../../tui/admin_tui.js");
}

function createProgramHarness() {
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

      const chain = {
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

describe("admin TUI helpers and actions", () => {
  let tui: any;
  const programId = new PublicKey("5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4");
  const mint = new PublicKey(DEVNET_MINT);
  const configPda = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    programId
  )[0];

  beforeAll(() => {
    tui = loadTuiModule();
  });

  afterAll(() => {
    delete process.env.SSS_TUI_TEST_MODE;
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe("utility helpers", () => {
    it("shortAddr returns N/A when no address is provided", () => {
      expect(tui.shortAddr(undefined)).toBe("N/A");
    });

    it("shortAddr leaves short strings unchanged", () => {
      expect(tui.shortAddr("abc123")).toBe("abc123");
    });

    it("shortAddr abbreviates long Solana addresses", () => {
      expect(tui.shortAddr(DEVNET_MINT)).toBe("9Mmn...Yujv");
    });

    it("formatTimestamp returns N/A for falsy timestamps", () => {
      expect(tui.formatTimestamp(0)).toBe("N/A");
    });

    it("formatTimestamp formats unix seconds as an ISO-like UTC string", () => {
      expect(tui.formatTimestamp(1_700_000_000)).toBe("2023-11-14 22:13:20");
    });

    it("formatUsd uses six decimal places by default before rendering a currency-style number", () => {
      expect(tui.formatUsd(1_250_000)).toBe("1.25");
    });

    it("formatUsd respects custom decimal precision inputs", () => {
      expect(tui.formatUsd(1250, 2)).toBe("12.50");
    });

    it("parseTokenAmount parses whole-number token strings", () => {
      expect(tui.parseTokenAmount("42", 6).toString()).toBe("42000000");
    });

    it("parseTokenAmount parses fractional token strings", () => {
      expect(tui.parseTokenAmount("1.5", 6).toString()).toBe("1500000");
    });

    it("parseTokenAmount trims whitespace around token strings", () => {
      expect(tui.parseTokenAmount("  2.25  ", 2).toString()).toBe("225");
    });

    it("parseTokenAmount truncates extra fractional precision instead of throwing", () => {
      expect(tui.parseTokenAmount("1.2399", 2).toString()).toBe("123");
    });

    it("parseTokenAmount rejects malformed token strings", () => {
      expect(tui.parseTokenAmount("abc.def", 6)).toBeNull();
    });

    it("isValidPubkey returns true for a valid Solana address", () => {
      expect(tui.isValidPubkey(DEVNET_MINT)).toBe(true);
    });

    it("isValidPubkey returns false for malformed base58 strings", () => {
      expect(tui.isValidPubkey("not-a-solana-address")).toBe(false);
    });

    it("detectNetwork identifies public devnet RPC endpoints", () => {
      expect(tui.detectNetwork("https://api.devnet.solana.com")).toBe("DEVNET/Public");
    });

    it("detectNetwork identifies public mainnet RPC endpoints", () => {
      expect(tui.detectNetwork("https://api.mainnet-beta.solana.com")).toBe("MAINNET/Public");
    });

    it("detectNetwork identifies testnet RPC endpoints", () => {
      expect(tui.detectNetwork("https://api.testnet.solana.com")).toBe("TESTNET");
    });

    it("detectNetwork identifies localhost RPC endpoints", () => {
      expect(tui.detectNetwork("http://127.0.0.1:8899")).toBe("LOCAL");
    });

    it("detectNetwork identifies Helius-hosted endpoints", () => {
      expect(tui.detectNetwork("https://devnet.helius-rpc.com")).toBe("DEVNET/Helius");
    });

    it("detectNetwork identifies QuickNode-hosted endpoints", () => {
      expect(tui.detectNetwork("https://solana-devnet.quiknode.pro")).toBe("DEVNET");
    });

    it("detectNetwork identifies Alchemy-hosted endpoints", () => {
      expect(tui.detectNetwork("https://solana-devnet.g.alchemy.com")).toBe("DEVNET/Alchemy");
    });

    it("detectNetwork falls back to CUSTOM for unknown providers", () => {
      expect(tui.detectNetwork("https://rpc.example.org")).toBe("CUSTOM");
    });
  });

  describe("PDA derivation helpers", () => {
    const minterPk = Keypair.generate().publicKey;
    const addressPk = Keypair.generate().publicKey;
    const index = 7;

    it("getConfigPda derives the config PDA from the config seed and mint", () => {
      const expected = PublicKey.findProgramAddressSync(
        [Buffer.from("config"), mint.toBuffer()],
        programId
      );

      expect(tui.getConfigPda(DEVNET_MINT)[0].toBase58()).toBe(expected[0].toBase58());
      expect(tui.getConfigPda(DEVNET_MINT)[1]).toBe(expected[1]);
    });

    it("getRoleRegistryPda derives the role registry PDA from the config PDA", () => {
      const expected = PublicKey.findProgramAddressSync(
        [Buffer.from("roles"), configPda.toBuffer()],
        programId
      );

      expect(tui.getRoleRegistryPda(configPda)[0].toBase58()).toBe(expected[0].toBase58());
    });

    it("getMinterInfoPda derives the minter info PDA from the config PDA and minter wallet", () => {
      const expected = PublicKey.findProgramAddressSync(
        [Buffer.from("minter"), configPda.toBuffer(), minterPk.toBuffer()],
        programId
      );

      expect(tui.getMinterInfoPda(configPda, minterPk)[0].toBase58()).toBe(expected[0].toBase58());
    });

    it("getBlacklistPda derives the blacklist PDA from the config PDA and wallet address", () => {
      const expected = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklist"), configPda.toBuffer(), addressPk.toBuffer()],
        programId
      );

      expect(tui.getBlacklistPda(configPda, addressPk)[0].toBase58()).toBe(expected[0].toBase58());
    });

    it("getReserveAttestationPda derives the reserve PDA from the config PDA and index", () => {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(BigInt(index));
      const expected = PublicKey.findProgramAddressSync(
        [Buffer.from("reserve"), configPda.toBuffer(), buffer],
        programId
      );

      expect(tui.getReserveAttestationPda(configPda, index)[0].toBase58()).toBe(
        expected[0].toBase58()
      );
    });

    it("getAuditLogPda derives the audit PDA from the config PDA and index", () => {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(BigInt(index));
      const expected = PublicKey.findProgramAddressSync(
        [Buffer.from("audit"), configPda.toBuffer(), buffer],
        programId
      );

      expect(tui.getAuditLogPda(configPda, index)[0].toBase58()).toBe(expected[0].toBase58());
    });
  });

  describe("data fetchers", () => {
    it("fetchConfig decodes a StablecoinConfig account into TUI-friendly fields", async () => {
      const connection = {
        getAccountInfo: jest.fn().mockResolvedValue({ data: Buffer.from([1, 2, 3]) }),
      };
      const coder = {
        decode: jest.fn().mockReturnValue({
          name: "Devnet USD",
          symbol: "dUSD",
          uri: "https://example.com/devnet.json",
          decimals: 6,
          preset: { sss2: {} },
          enable_permanent_delegate: true,
          enable_transfer_hook: true,
          default_account_frozen: false,
          enable_confidential_transfers: false,
          is_paused: false,
          total_minted: 1_500_000_000,
          total_burned: 250_000_000,
          reserve_attestation_index: 5,
          audit_log_index: 9,
          master_authority: Keypair.generate().publicKey,
          mint: new PublicKey(DEVNET_MINT),
          created_at: 1_700_000_000,
          updated_at: 1_700_100_000,
        }),
      };

      const result = await tui.fetchConfig(DEVNET_MINT, { connection, coder });

      expect(result.name).toBe("Devnet USD");
      expect(result.currentSupply).toBe(1_250_000_000);
      expect(result.attestationIndex).toBe(5);
      expect(connection.getAccountInfo).toHaveBeenCalledTimes(1);
    });

    it("fetchConfig returns null when the config PDA has not been initialized", async () => {
      const result = await tui.fetchConfig(DEVNET_MINT, {
        connection: { getAccountInfo: jest.fn().mockResolvedValue(null) },
        coder: { decode: jest.fn() },
      });

      expect(result).toBeNull();
    });

    it("fetchRoles decodes a RoleRegistry account into base58 addresses", async () => {
      const result = await tui.fetchRoles(tui.getConfigPda(DEVNET_MINT)[0], {
        connection: { getAccountInfo: jest.fn().mockResolvedValue({ data: Buffer.from([1]) }) },
        coder: {
          decode: jest.fn().mockReturnValue({
            master_authority: Keypair.generate().publicKey,
            pauser: Keypair.generate().publicKey,
            blacklister: Keypair.generate().publicKey,
            seizer: Keypair.generate().publicKey,
          }),
        },
      });

      expect(result.masterAuthority).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      expect(result.pauser).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });

    it("fetchMinters decodes minter accounts and filters decode failures", async () => {
      const configPda = tui.getConfigPda(DEVNET_MINT)[0];
      const connection = {
        getProgramAccounts: jest.fn().mockResolvedValue([
          { pubkey: Keypair.generate().publicKey, account: { data: Buffer.from([1]) } },
          { pubkey: Keypair.generate().publicKey, account: { data: Buffer.from([2]) } },
        ]),
      };
      const coder = {
        decode: jest
          .fn()
          .mockReturnValueOnce({
            minter: Keypair.generate().publicKey,
            is_active: true,
            mint_quota: 1000,
            total_minted: 250,
            created_at: 1_700_000_000,
          })
          .mockImplementationOnce(() => {
            throw new Error("decode failed");
          }),
      };

      const result = await tui.fetchMinters(configPda, { connection, coder });

      expect(result).toHaveLength(1);
      expect(result[0].remaining).toBe(750);
    });

    it("fetchBlacklist decodes blacklist accounts with reasons and timestamps", async () => {
      const configPda = tui.getConfigPda(DEVNET_MINT)[0];
      const connection = {
        getProgramAccounts: jest.fn().mockResolvedValue([
          { account: { data: Buffer.from([1]) } },
        ]),
      };
      const coder = {
        decode: jest.fn().mockReturnValue({
          blocked_address: Keypair.generate().publicKey,
          reason: "screening hit",
          blacklisted_by: Keypair.generate().publicKey,
          blacklisted_at: 1_700_200_000,
        }),
      };
      const idl = {
        accounts: [{ name: "BlacklistEntry", discriminator: new Array(8).fill(1) }],
      };

      const result = await tui.fetchBlacklist(configPda, { connection, coder, idl });

      expect(result).toHaveLength(1);
      expect(result[0].reason).toBe("screening hit");
    });

    it("fetchBlacklist returns an empty array when the RPC call fails", async () => {
      const result = await tui.fetchBlacklist(tui.getConfigPda(DEVNET_MINT)[0], {
        connection: { getProgramAccounts: jest.fn().mockRejectedValue(new Error("rpc down")) },
        coder: { decode: jest.fn() },
        idl: { accounts: [{ name: "BlacklistEntry", discriminator: new Array(8).fill(1) }] },
      });

      expect(result).toEqual([]);
    });

    it("fetchAttestations caps requests at fifty entries and decodes returned accounts", async () => {
      const infos = Array.from({ length: 50 }, () => ({ data: Buffer.from([1]) }));
      const result = await tui.fetchAttestations(tui.getConfigPda(DEVNET_MINT)[0], 60, {
        connection: { getMultipleAccountsInfo: jest.fn().mockResolvedValue(infos) },
        coder: {
          decode: jest.fn().mockReturnValue({
            index: 1,
            reserve_hash: new Uint8Array(32).fill(2),
            total_reserves_usd: 1_000_000,
            total_outstanding: 900_000,
            attested_by: Keypair.generate().publicKey,
            attestation_uri: "https://example.com/attestations/1",
            timestamp: 1_700_300_000,
          }),
        },
      });

      expect(result).toHaveLength(50);
      expect(result[0].reserveHash).toBe("0x02020202...");
    });

    it("fetchAttestations returns an empty array when the requested count is zero", async () => {
      const result = await tui.fetchAttestations(tui.getConfigPda(DEVNET_MINT)[0], 0, {
        connection: { getMultipleAccountsInfo: jest.fn() },
        coder: { decode: jest.fn() },
      });

      expect(result).toEqual([]);
    });

    it("fetchHolders computes holder percentages from the largest token accounts", async () => {
      const connection = {
        getTokenLargestAccounts: jest.fn().mockResolvedValue({
          value: [
            { address: Keypair.generate().publicKey, uiAmount: 600 },
            { address: Keypair.generate().publicKey, uiAmount: 400 },
          ],
        }),
      };

      const result = await tui.fetchHolders(DEVNET_MINT, { connection });

      expect(result[0].pct).toBe("60.0");
      expect(result[1].pct).toBe("40.0");
    });

    it("fetchTransactions maps RPC signature results into transfer-history rows", async () => {
      const result = await tui.fetchTransactions(new PublicKey(DEVNET_MINT), 2, {
        connection: {
          getSignaturesForAddress: jest.fn().mockResolvedValue([
            { signature: "sig-1", slot: 10, blockTime: 1_700_100_000, err: null },
            { signature: "sig-2", slot: 11, blockTime: 1_700_100_100, err: { custom: 1 } },
          ]),
        },
      });

      expect(result).toEqual([
        { signature: "sig-1", slot: 10, blockTime: 1_700_100_000, err: null },
        { signature: "sig-2", slot: 11, blockTime: 1_700_100_100, err: { custom: 1 } },
      ]);
    });

    it("fetchAuditLogs decodes audit log entries and title-cases the action name", async () => {
      const result = await tui.fetchAuditLogs(tui.getConfigPda(DEVNET_MINT)[0], 1, {
        connection: {
          getMultipleAccountsInfo: jest.fn().mockResolvedValue([{ data: Buffer.from([1]) }]),
        },
        coder: {
          decode: jest.fn().mockReturnValue({
            index: 3,
            action: { blacklistadd: {} },
            actor: Keypair.generate().publicKey,
            target: Keypair.generate().publicKey,
            amount: 123,
            details: "screening hit",
            timestamp: 1_700_200_000,
          }),
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe("Blacklistadd");
      expect(result[0].details).toBe("screening hit");
    });

    it("fetchAuditLogs returns an empty array when the RPC request fails", async () => {
      const result = await tui.fetchAuditLogs(tui.getConfigPda(DEVNET_MINT)[0], 4, {
        connection: {
          getMultipleAccountsInfo: jest.fn().mockRejectedValue(new Error("rpc down")),
        },
        coder: { decode: jest.fn() },
      });

      expect(result).toEqual([]);
    });
  });

  describe("action execution flows", () => {
    function buildActionDeps() {
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

    it("executeActionSubmission blocks all actions when wallet mode is disabled", () => {
      const showMessage = jest.fn();
      const result = tui.executeActionSubmission("mint", [VALID_ADDRESS, "1"], {
        walletMode: false,
        showMessage,
      });

      expect(result).toBe(false);
      expect(showMessage).toHaveBeenCalledWith(
        "No Wallet",
        "Pass --keypair to enable transactions.",
        3000
      );
    });

    it("executeActionSubmission rejects unknown action names", () => {
      const showMessage = jest.fn();
      const result = tui.executeActionSubmission("unknown-action", [], {
        walletMode: true,
        showMessage,
      });

      expect(result).toBe(false);
      expect(showMessage).toHaveBeenCalledWith(
        "Error",
        "Unknown action: unknown-action",
        2000
      );
    });

    it("mint action rejects an invalid recipient before confirmation", () => {
      const { deps, showMessage, confirmAction } = buildActionDeps();

      const result = tui.executeActionSubmission("mint", ["not-a-pubkey", "1"], deps);

      expect(result).toBe(false);
      expect(showMessage).toHaveBeenCalledWith("Error", "Invalid recipient address.", 2000);
      expect(confirmAction).not.toHaveBeenCalled();
    });

    it("mint action builds a mintTokens RPC call and adds an ATA creation instruction", async () => {
      const { deps, confirmAction, executeTx, programHarness } = buildActionDeps();

      const result = tui.executeActionSubmission("mint", [VALID_ADDRESS, "1.25"], deps);

      expect(result).toBe(true);
      expect(confirmAction).toHaveBeenCalledTimes(1);
      expect(executeTx).toHaveBeenCalledTimes(1);
      expect(programHarness.methods.mintTokens).toHaveBeenCalledTimes(1);
      expect(programHarness.calls[0].methodName).toBe("mintTokens");
      expect(programHarness.calls[0].args[0].toString()).toBe("1250000");
      expect(programHarness.calls[0].preInstructions).toHaveLength(1);
    });

    it("burn action builds a burnTokens RPC call using the provided source wallet", () => {
      const { deps, confirmAction, programHarness } = buildActionDeps();

      const result = tui.executeActionSubmission("burn", [VALID_ADDRESS, "2.5"], deps);

      expect(result).toBe(true);
      expect(confirmAction).toHaveBeenCalledTimes(1);
      expect(programHarness.methods.burnTokens).toHaveBeenCalledTimes(1);
      expect(programHarness.calls[0].args[0].toString()).toBe("2500000");
    });

    it("freeze action rejects invalid target addresses", () => {
      const { deps, showMessage, executeTx } = buildActionDeps();

      const result = tui.executeActionSubmission("freeze", ["not-a-pubkey"], deps);

      expect(result).toBe(false);
      expect(showMessage).toHaveBeenCalledWith("Error", "Invalid address.", 2000);
      expect(executeTx).not.toHaveBeenCalled();
    });

    it("blacklistAdd action creates a blacklist transaction with a pre-instruction", () => {
      const { deps, confirmAction, programHarness } = buildActionDeps();

      const result = tui.executeActionSubmission(
        "blacklistAdd",
        [VALID_ADDRESS, "screening hit"],
        deps
      );

      expect(result).toBe(true);
      expect(confirmAction).toHaveBeenCalledTimes(1);
      expect(programHarness.methods.blacklistAdd).toHaveBeenCalledTimes(1);
      expect(programHarness.calls[0].preInstructions).toHaveLength(1);
    });

    it("seize action rejects invalid destination addresses", () => {
      const { deps, showMessage, confirmAction } = buildActionDeps();

      const result = tui.executeActionSubmission(
        "seize",
        [VALID_ADDRESS, "not-a-pubkey", "5"],
        deps
      );

      expect(result).toBe(false);
      expect(showMessage).toHaveBeenCalledWith("Error", "Invalid destination address.", 2000);
      expect(confirmAction).not.toHaveBeenCalled();
    });

    it("attest action rejects hashes that are not 32 bytes of hex", () => {
      const { deps, showMessage } = buildActionDeps();

      const result = tui.executeActionSubmission(
        "attest",
        ["deadbeef", "10", "9", "https://example.com"],
        deps
      );

      expect(result).toBe(false);
      expect(showMessage).toHaveBeenCalledWith(
        "Error",
        "Hash must be 64 hex chars (32 bytes).",
        3000
      );
    });

    it("attest action converts the hex hash into a 32-byte reserve hash array", () => {
      const { deps, programHarness } = buildActionDeps();

      const result = tui.executeActionSubmission(
        "attest",
        [`0x${"11".repeat(32)}`, "10", "9", "https://example.com"],
        deps
      );

      expect(result).toBe(true);
      expect(programHarness.methods.attestReserve).toHaveBeenCalledTimes(1);
      expect(programHarness.calls[0].args[0].reserveHash).toHaveLength(32);
      expect(programHarness.calls[0].args[0].attestationUri).toBe("https://example.com");
    });

    it("updateRole action rejects unsupported role names", () => {
      const { deps, showMessage } = buildActionDeps();

      const result = tui.executeActionSubmission(
        "updateRole",
        ["master", VALID_ADDRESS],
        deps
      );

      expect(result).toBe(false);
      expect(showMessage).toHaveBeenCalledWith(
        "Error",
        "Role must be: pauser, blacklister, or seizer",
        2000
      );
    });

    it("updateMinter action parses the active flag and quota before sending RPC", () => {
      const { deps, programHarness } = buildActionDeps();

      const result = tui.executeActionSubmission(
        "updateMinter",
        [VALID_ADDRESS, "12.5", "false"],
        deps
      );

      expect(result).toBe(true);
      expect(programHarness.methods.updateMinter).toHaveBeenCalledTimes(1);
      expect(programHarness.calls[0].args[0].isActive).toBe(false);
      expect(programHarness.calls[0].args[0].mintQuota.toString()).toBe("12500000");
    });

    it("transferAuthority action requires confirmation before sending RPC", () => {
      const { deps, confirmAction, programHarness } = buildActionDeps();

      const result = tui.executeActionSubmission(
        "transferAuthority",
        [VALID_ADDRESS],
        deps
      );

      expect(result).toBe(true);
      expect(confirmAction).toHaveBeenCalledTimes(1);
      expect(programHarness.methods.transferAuthority).toHaveBeenCalledTimes(1);
    });

    it("pause action sends a pause RPC without additional form fields", () => {
      const { deps, confirmAction, programHarness } = buildActionDeps();

      const result = tui.executeActionSubmission("pause", [], deps);

      expect(result).toBe(true);
      expect(confirmAction).toHaveBeenCalledTimes(1);
      expect(programHarness.methods.pause).toHaveBeenCalledTimes(1);
    });
  });
});
