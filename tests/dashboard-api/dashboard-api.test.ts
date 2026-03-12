// @ts-nocheck
import request from "supertest";
import { Keypair, PublicKey } from "@solana/web3.js";

import { createApp } from "../../backend/src/server";
import { SSSError } from "../../sdk/src/errors";
import {
  computeWebhookSignature,
  createWebhookService,
} from "../../backend/src/services/webhook-service";

const DEVNET_MINT = "9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv";
const PROGRAM_ID = "5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4";
const DEVNET_RPC_URL = "https://api.devnet.solana.com";
const API_KEY = "dashboard-api-test-key";

const CONFIG_PDA = Keypair.generate().publicKey;
const SECONDARY_ADDRESS = Keypair.generate().publicKey.toBase58();
const THIRD_ADDRESS = Keypair.generate().publicKey.toBase58();
const TOKEN_ACCOUNT = Keypair.generate().publicKey.toBase58();
const ALT_TOKEN_ACCOUNT = Keypair.generate().publicKey.toBase58();

function createMockClient() {
  return {
    fetchConfig: jest.fn().mockResolvedValue({
      name: "Devnet USD",
      symbol: "dUSD",
      mint: DEVNET_MINT,
      decimals: 6,
      reserveAttestationIndex: 3,
      auditLogIndex: 4,
      isPaused: false,
      totalMinted: 1_500_000_000,
      totalBurned: 250_000_000,
      createdAt: 1_700_000_000,
      updatedAt: 1_700_100_000,
    }),
    getConfigPda: jest.fn().mockReturnValue([CONFIG_PDA, 255]),
    fetchRoleRegistry: jest.fn().mockResolvedValue({
      masterAuthority: SECONDARY_ADDRESS,
      pauser: SECONDARY_ADDRESS,
      blacklister: THIRD_ADDRESS,
      seizer: THIRD_ADDRESS,
    }),
    fetchMinterInfo: jest.fn().mockResolvedValue({
      minter: SECONDARY_ADDRESS,
      isActive: true,
      mintQuota: "500000000",
      totalMinted: "250000000",
    }),
    fetchBlacklistEntry: jest.fn().mockResolvedValue(null),
    fetchReserveAttestation: jest.fn().mockResolvedValue({
      index: 2,
      reserveHash: Array.from({ length: 32 }, (_, i) => i),
      totalReservesUsd: "1500000000",
      totalOutstanding: "1250000000",
      attestedBy: SECONDARY_ADDRESS,
      attestationUri: "https://example.com/attestation/2",
      timestamp: 1_700_200_000,
    }),
    getTotalSupply: jest.fn().mockResolvedValue({
      currentSupply: "1250000000",
      totalMinted: "1500000000",
      totalBurned: "250000000",
    }),
    getTokenSupply: jest.fn().mockResolvedValue({
      amount: "1250000000",
      decimals: 6,
      uiAmount: 1250,
      uiAmountString: "1250",
    }),
    fetchTokenHolders: jest.fn().mockResolvedValue([
      { address: TOKEN_ACCOUNT, balance: 750, pct: "60.0" },
      { address: ALT_TOKEN_ACCOUNT, balance: 500, pct: "40.0" },
    ]),
    fetchAllMinters: jest.fn().mockResolvedValue([
      {
        pubkey: new PublicKey(SECONDARY_ADDRESS),
        account: {
          isActive: true,
          mintQuota: "500000000",
          totalMinted: "250000000",
        },
      },
      {
        pubkey: new PublicKey(THIRD_ADDRESS),
        account: {
          isActive: false,
          mintQuota: "250000000",
          totalMinted: "250000000",
        },
      },
    ]),
    initialize: jest.fn().mockResolvedValue({ signature: "init-signature" }),
    initializeExtraAccountMetaList: jest.fn().mockResolvedValue(undefined),
    mintTokens: jest.fn().mockResolvedValue({ signature: "mint-signature" }),
    burnTokens: jest.fn().mockResolvedValue({ signature: "burn-signature" }),
    pause: jest.fn().mockResolvedValue({ signature: "pause-signature" }),
    unpause: jest.fn().mockResolvedValue({ signature: "unpause-signature" }),
    freezeAccount: jest.fn().mockResolvedValue({ signature: "freeze-signature" }),
    thawAccount: jest.fn().mockResolvedValue({ signature: "thaw-signature" }),
    blacklistAdd: jest.fn().mockResolvedValue({ signature: "blacklist-add-signature" }),
    blacklistRemove: jest.fn().mockResolvedValue({ signature: "blacklist-remove-signature" }),
    seize: jest.fn().mockResolvedValue({ signature: "seize-signature" }),
    updateRoles: jest.fn().mockResolvedValue({ signature: "roles-signature" }),
    updateMinter: jest.fn().mockResolvedValue({ signature: "minter-signature" }),
    attestReserve: jest.fn().mockResolvedValue({ signature: "attest-signature" }),
  };
}

function buildApp(client: any) {
  return createApp(client as any, {
    authority: PROGRAM_ID,
    rpcUrl: DEVNET_RPC_URL,
  });
}

function auth(req: request.Test) {
  return req.set("Authorization", `Bearer ${API_KEY}`);
}

describe("dashboard stablecoin API", () => {
  const originalApiKey = process.env.API_KEY;
  const originalRateLimitMax = process.env.RATE_LIMIT_MAX;
  const originalRateLimitWindowMs = process.env.RATE_LIMIT_WINDOW_MS;

  let client: ReturnType<typeof createMockClient>;
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    process.env.API_KEY = API_KEY;
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
  });

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = originalApiKey;

    if (originalRateLimitMax === undefined) delete process.env.RATE_LIMIT_MAX;
    else process.env.RATE_LIMIT_MAX = originalRateLimitMax;

    if (originalRateLimitWindowMs === undefined) delete process.env.RATE_LIMIT_WINDOW_MS;
    else process.env.RATE_LIMIT_WINDOW_MS = originalRateLimitWindowMs;
  });

  beforeEach(() => {
    client = createMockClient();
    app = buildApp(client);
  });

  describe("GET endpoints", () => {
    const getCases = [
      {
        name: "GET /:mint returns config and roles for a valid mint",
        path: `/api/stablecoin/${DEVNET_MINT}`,
        assertResponse: (response: request.Response) => {
          expect(response.body.config.name).toBe("Devnet USD");
          expect(response.body.roles.masterAuthority).toBe(SECONDARY_ADDRESS);
          expect(client.fetchConfig).toHaveBeenCalledWith(new PublicKey(DEVNET_MINT));
          expect(client.fetchRoleRegistry).toHaveBeenCalledWith(CONFIG_PDA);
        },
      },
      {
        name: "GET /:mint/minter/:address returns minter information",
        path: `/api/stablecoin/${DEVNET_MINT}/minter/${SECONDARY_ADDRESS}`,
        assertResponse: (response: request.Response) => {
          expect(response.body.minter).toBe(SECONDARY_ADDRESS);
          expect(response.body.isActive).toBe(true);
          expect(client.fetchMinterInfo).toHaveBeenCalledWith(
            CONFIG_PDA,
            new PublicKey(SECONDARY_ADDRESS)
          );
        },
      },
      {
        name: "GET /:mint/blacklist/:address reports an address as blacklisted when an entry exists",
        path: `/api/stablecoin/${DEVNET_MINT}/blacklist/${SECONDARY_ADDRESS}`,
        setup: () => {
          client.fetchBlacklistEntry.mockResolvedValueOnce({
            address: SECONDARY_ADDRESS,
            reason: "sanctions",
          });
        },
        assertResponse: (response: request.Response) => {
          expect(response.body.blacklisted).toBe(true);
          expect(response.body.entry.reason).toBe("sanctions");
        },
      },
      {
        name: "GET /:mint/attestation/:index returns a reserve attestation",
        path: `/api/stablecoin/${DEVNET_MINT}/attestation/2`,
        assertResponse: (response: request.Response) => {
          expect(response.body.index).toBe(2);
          expect(response.body.attestationUri).toContain("/2");
          expect(client.fetchReserveAttestation).toHaveBeenCalledWith(CONFIG_PDA, 2);
        },
      },
      {
        name: "GET /:mint/supply returns config supply metrics plus live token supply",
        path: `/api/stablecoin/${DEVNET_MINT}/supply`,
        assertResponse: (response: request.Response) => {
          expect(response.body.currentSupply).toBe("1250000000");
          expect(response.body.live.uiAmount).toBe(1250);
        },
      },
      {
        name: "GET /:mint/holders returns token holder counts",
        path: `/api/stablecoin/${DEVNET_MINT}/holders`,
        assertResponse: (response: request.Response) => {
          expect(response.body.count).toBe(2);
          expect(response.body.holders[0].address).toBe(TOKEN_ACCOUNT);
        },
      },
      {
        name: "GET /:mint/minters returns every configured minter",
        path: `/api/stablecoin/${DEVNET_MINT}/minters`,
        assertResponse: (response: request.Response) => {
          expect(response.body.count).toBe(2);
          expect(response.body.minters[0].address).toBe(SECONDARY_ADDRESS);
          expect(response.body.minters[1].isActive).toBe(false);
        },
      },
      {
        name: "GET /:mint/audit uses the requested limit and returns attestations in reverse order",
        path: `/api/stablecoin/${DEVNET_MINT}/audit?limit=2`,
        setup: () => {
          client.fetchConfig.mockResolvedValueOnce({
            reserveAttestationIndex: 3,
          });
          client.fetchReserveAttestation
            .mockResolvedValueOnce({ index: 2 })
            .mockResolvedValueOnce({ index: 1 });
        },
        assertResponse: (response: request.Response) => {
          expect(response.body.total).toBe(3);
          expect(response.body.attestations.map((item: any) => item.index)).toEqual([2, 1]);
          expect(client.fetchReserveAttestation).toHaveBeenNthCalledWith(1, CONFIG_PDA, 2);
          expect(client.fetchReserveAttestation).toHaveBeenNthCalledWith(2, CONFIG_PDA, 1);
        },
      },
      {
        name: "GET /:mint/audit/export returns CSV output with attachment headers",
        path: `/api/stablecoin/${DEVNET_MINT}/audit/export?format=csv&limit=1`,
        setup: () => {
          client.fetchConfig.mockResolvedValueOnce({
            reserveAttestationIndex: 1,
          });
          client.fetchReserveAttestation.mockResolvedValueOnce({
            index: 0,
            reserveHash: Array.from({ length: 32 }, (_, i) => i),
            totalReservesUsd: "1000",
            totalOutstanding: "999",
            attestedBy: SECONDARY_ADDRESS,
            attestationUri: "https://example.com/attestation/0",
            timestamp: 1_700_100_000,
          });
        },
        assertResponse: (response: request.Response) => {
          expect(response.headers["content-type"]).toContain("text/csv");
          expect(response.headers["content-disposition"]).toContain("audit-9MmnDN61.csv");
          expect(response.text).toContain("index,reserveHash,totalReservesUsd");
          expect(response.text).toContain("0,00010203");
        },
      },
    ];

    test.each(getCases)("$name", async ({ path, setup, assertResponse }) => {
      setup?.();
      const response = await request(app).get(path);

      expect(response.status).toBe(200);
      assertResponse(response);
    });

    it("GET /:mint rejects an invalid mint address", async () => {
      const response = await request(app).get("/api/stablecoin/not-a-pubkey");

      expect(response.status).toBe(500);
      expect(response.body.error.name).toBe("InternalServerError");
      expect(client.fetchConfig).not.toHaveBeenCalled();
    });

    it("GET /:mint/minter/:address rejects an invalid minter address", async () => {
      const response = await request(app).get(
        `/api/stablecoin/${DEVNET_MINT}/minter/not-a-pubkey`
      );

      expect(response.status).toBe(500);
      expect(response.body.error.message).toMatch(/Invalid public key|Non-base58 character/);
    });

    it("GET /:mint/blacklist/:address rejects an invalid blacklist address", async () => {
      const response = await request(app).get(
        `/api/stablecoin/${DEVNET_MINT}/blacklist/not-a-pubkey`
      );

      expect(response.status).toBe(500);
      expect(client.fetchBlacklistEntry).not.toHaveBeenCalled();
    });

    it("GET /:mint/attestation/:index rejects a non-numeric attestation index", async () => {
      client.fetchReserveAttestation.mockImplementationOnce(async (_configPda, index) => {
        if (Number.isNaN(index)) {
          throw new Error("Invalid attestation index");
        }
        return { index };
      });

      const response = await request(app).get(
        `/api/stablecoin/${DEVNET_MINT}/attestation/not-a-number`
      );

      expect(response.status).toBe(500);
      expect(response.body.error.message).toContain("Invalid attestation index");
    });

    it("GET /:mint/audit skips attestation fetch failures instead of aborting the whole response", async () => {
      client.fetchConfig.mockResolvedValueOnce({
        reserveAttestationIndex: 3,
      });
      client.fetchReserveAttestation
        .mockResolvedValueOnce({ index: 2 })
        .mockRejectedValueOnce(new Error("attestation missing"))
        .mockResolvedValueOnce({ index: 0 });

      const response = await request(app).get(`/api/stablecoin/${DEVNET_MINT}/audit?limit=3`);

      expect(response.status).toBe(200);
      expect(response.body.attestations.map((item: any) => item.index)).toEqual([2, 0]);
    });

    it("GET /:mint/audit defaults limit to 20 when no explicit limit is provided", async () => {
      client.fetchConfig.mockResolvedValueOnce({
        reserveAttestationIndex: 1,
      });

      const response = await request(app).get(`/api/stablecoin/${DEVNET_MINT}/audit`);

      expect(response.status).toBe(200);
      expect(client.fetchReserveAttestation).toHaveBeenCalledTimes(1);
      expect(client.fetchReserveAttestation).toHaveBeenCalledWith(CONFIG_PDA, 0);
    });

    it("GET /:mint/audit/export falls back to JSON for unknown export formats", async () => {
      client.fetchConfig.mockResolvedValueOnce({
        reserveAttestationIndex: 1,
      });
      client.fetchReserveAttestation.mockResolvedValueOnce({ index: 0 });

      const response = await request(app).get(
        `/api/stablecoin/${DEVNET_MINT}/audit/export?format=xml`
      );

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.body.total).toBe(1);
    });

    it("GET /:mint/supply surfaces structured SSSError instances as 400 responses", async () => {
      client.getTotalSupply.mockRejectedValueOnce(
        new SSSError(6002, "ProgramPaused", "Program is currently paused")
      );

      const response = await request(app).get(`/api/stablecoin/${DEVNET_MINT}/supply`);

      expect(response.status).toBe(400);
      expect(response.body.error.name).toBe("ProgramPaused");
      expect(response.body.error.code).toBe(6002);
    });
  });

  describe("POST endpoint success cases", () => {
    const baseReserveHash = Array.from({ length: 32 }, (_, i) => i + 1);

    const postCases = [
      {
        name: "POST /initialize initializes an SSS-2 stablecoin and extra account meta list",
        path: "/api/stablecoin/initialize",
        body: {
          name: "Devnet USD",
          symbol: "dUSD",
          uri: "https://example.com/token.json",
          decimals: 6,
          preset: "sss2",
        },
        expectedStatus: 201,
        assertResponse: (response: request.Response) => {
          expect(response.body.signature).toBe("init-signature");
          expect(response.body.mint).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
          expect(client.initialize).toHaveBeenCalledTimes(1);
          expect(client.initializeExtraAccountMetaList).toHaveBeenCalledTimes(1);
        },
      },
      {
        name: "POST /:mint/mint mints tokens to a recipient token account",
        path: `/api/stablecoin/${DEVNET_MINT}/mint`,
        body: {
          amount: "1250000",
          recipient: TOKEN_ACCOUNT,
        },
        assertResponse: (response: request.Response) => {
          expect(response.body.signature).toBe("mint-signature");
          expect(client.mintTokens).toHaveBeenCalledTimes(1);
        },
      },
      {
        name: "POST /:mint/burn burns tokens from a token account",
        path: `/api/stablecoin/${DEVNET_MINT}/burn`,
        body: {
          amount: "500000",
          tokenAccount: TOKEN_ACCOUNT,
        },
        assertResponse: (response: request.Response) => {
          expect(response.body.signature).toBe("burn-signature");
          expect(client.burnTokens).toHaveBeenCalledTimes(1);
        },
      },
      {
        name: "POST /:mint/pause pauses the stablecoin",
        path: `/api/stablecoin/${DEVNET_MINT}/pause`,
        body: {},
        assertResponse: (response: request.Response) => {
          expect(response.body.signature).toBe("pause-signature");
        },
      },
      {
        name: "POST /:mint/unpause unpauses the stablecoin",
        path: `/api/stablecoin/${DEVNET_MINT}/unpause`,
        body: {},
        assertResponse: (response: request.Response) => {
          expect(response.body.signature).toBe("unpause-signature");
        },
      },
      {
        name: "POST /:mint/freeze freezes a token account",
        path: `/api/stablecoin/${DEVNET_MINT}/freeze`,
        body: {
          tokenAccount: TOKEN_ACCOUNT,
        },
        assertResponse: (response: request.Response) => {
          expect(response.body.signature).toBe("freeze-signature");
        },
      },
      {
        name: "POST /:mint/thaw thaws a token account",
        path: `/api/stablecoin/${DEVNET_MINT}/thaw`,
        body: {
          tokenAccount: TOKEN_ACCOUNT,
        },
        assertResponse: (response: request.Response) => {
          expect(response.body.signature).toBe("thaw-signature");
        },
      },
      {
        name: "POST /:mint/blacklist/add adds an address to the blacklist",
        path: `/api/stablecoin/${DEVNET_MINT}/blacklist/add`,
        body: {
          address: SECONDARY_ADDRESS,
          tokenAccount: TOKEN_ACCOUNT,
          reason: "screening-hit",
        },
        assertResponse: (response: request.Response) => {
          expect(response.body.signature).toBe("blacklist-add-signature");
        },
      },
      {
        name: "POST /:mint/blacklist/remove removes an address from the blacklist",
        path: `/api/stablecoin/${DEVNET_MINT}/blacklist/remove`,
        body: {
          address: SECONDARY_ADDRESS,
          tokenAccount: TOKEN_ACCOUNT,
        },
        assertResponse: (response: request.Response) => {
          expect(response.body.signature).toBe("blacklist-remove-signature");
        },
      },
      {
        name: "POST /:mint/seize seizes tokens from a blacklisted address",
        path: `/api/stablecoin/${DEVNET_MINT}/seize`,
        body: {
          blacklistedAddress: SECONDARY_ADDRESS,
          from: TOKEN_ACCOUNT,
          to: ALT_TOKEN_ACCOUNT,
          amount: "250000",
        },
        assertResponse: (response: request.Response) => {
          expect(response.body.signature).toBe("seize-signature");
        },
      },
      {
        name: "POST /:mint/roles updates one of the role holders",
        path: `/api/stablecoin/${DEVNET_MINT}/roles`,
        body: {
          role: "pauser",
          newHolder: SECONDARY_ADDRESS,
        },
        assertResponse: (response: request.Response) => {
          expect(response.body.signature).toBe("roles-signature");
          expect(client.updateRoles).toHaveBeenCalledTimes(1);
        },
      },
      {
        name: "POST /:mint/minter updates minter status and quota",
        path: `/api/stablecoin/${DEVNET_MINT}/minter`,
        body: {
          wallet: SECONDARY_ADDRESS,
          isActive: true,
          quota: "900000",
        },
        assertResponse: (response: request.Response) => {
          expect(response.body.signature).toBe("minter-signature");
          expect(client.updateMinter).toHaveBeenCalledTimes(1);
        },
      },
      {
        name: "POST /:mint/attest records a reserve attestation",
        path: `/api/stablecoin/${DEVNET_MINT}/attest`,
        body: {
          reserveHash: baseReserveHash,
          totalReservesUsd: "1250000000",
          totalOutstanding: "1200000000",
          attestationUri: "https://example.com/attestation/3",
        },
        assertResponse: (response: request.Response) => {
          expect(response.body.signature).toBe("attest-signature");
          expect(client.attestReserve).toHaveBeenCalledTimes(1);
        },
      },
    ];

    test.each(postCases)("$name", async ({ path, body, expectedStatus = 200, assertResponse }) => {
      const response = await auth(request(app).post(path)).send(body);

      expect(response.status).toBe(expectedStatus);
      assertResponse(response);
    });

    it("POST /initialize rejects an unsupported preset value", async () => {
      const response = await auth(request(app).post("/api/stablecoin/initialize")).send({
        name: "Bad Preset USD",
        symbol: "BUSD",
        uri: "",
        decimals: 6,
        preset: "invalid-preset",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.name).toBe("InvalidPreset");
      expect(client.initialize).not.toHaveBeenCalled();
    });

    it("POST /initialize does not initialize extra account meta list for a custom preset without a transfer hook", async () => {
      const response = await auth(request(app).post("/api/stablecoin/initialize")).send({
        name: "Custom USD",
        symbol: "cUSD",
        uri: "",
        decimals: 6,
        preset: "custom",
        enableTransferHook: false,
      });

      expect(response.status).toBe(201);
      expect(client.initializeExtraAccountMetaList).not.toHaveBeenCalled();
    });

    it("POST /:mint/mint surfaces SSSError instances as structured 400 responses", async () => {
      client.mintTokens.mockRejectedValueOnce(
        new SSSError(6005, "MintQuotaExceeded", "Mint amount exceeds minter quota")
      );

      const response = await auth(
        request(app).post(`/api/stablecoin/${DEVNET_MINT}/mint`)
      ).send({
        amount: "1",
        recipient: TOKEN_ACCOUNT,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.name).toBe("MintQuotaExceeded");
    });
  });

  describe("POST authentication and validation", () => {
    const unauthorizedCases = [
      { name: "POST /initialize requires an API key", path: "/api/stablecoin/initialize", body: { preset: "sss1" }, methodName: "initialize" },
      { name: "POST /:mint/mint requires an API key", path: `/api/stablecoin/${DEVNET_MINT}/mint`, body: { amount: "1", recipient: TOKEN_ACCOUNT }, methodName: "mintTokens" },
      { name: "POST /:mint/burn requires an API key", path: `/api/stablecoin/${DEVNET_MINT}/burn`, body: { amount: "1", tokenAccount: TOKEN_ACCOUNT }, methodName: "burnTokens" },
      { name: "POST /:mint/pause requires an API key", path: `/api/stablecoin/${DEVNET_MINT}/pause`, body: {}, methodName: "pause" },
      { name: "POST /:mint/unpause requires an API key", path: `/api/stablecoin/${DEVNET_MINT}/unpause`, body: {}, methodName: "unpause" },
      { name: "POST /:mint/freeze requires an API key", path: `/api/stablecoin/${DEVNET_MINT}/freeze`, body: { tokenAccount: TOKEN_ACCOUNT }, methodName: "freezeAccount" },
      { name: "POST /:mint/thaw requires an API key", path: `/api/stablecoin/${DEVNET_MINT}/thaw`, body: { tokenAccount: TOKEN_ACCOUNT }, methodName: "thawAccount" },
      { name: "POST /:mint/blacklist/add requires an API key", path: `/api/stablecoin/${DEVNET_MINT}/blacklist/add`, body: { address: SECONDARY_ADDRESS, tokenAccount: TOKEN_ACCOUNT }, methodName: "blacklistAdd" },
      { name: "POST /:mint/blacklist/remove requires an API key", path: `/api/stablecoin/${DEVNET_MINT}/blacklist/remove`, body: { address: SECONDARY_ADDRESS, tokenAccount: TOKEN_ACCOUNT }, methodName: "blacklistRemove" },
      { name: "POST /:mint/seize requires an API key", path: `/api/stablecoin/${DEVNET_MINT}/seize`, body: { blacklistedAddress: SECONDARY_ADDRESS, from: TOKEN_ACCOUNT, to: ALT_TOKEN_ACCOUNT, amount: "1" }, methodName: "seize" },
      { name: "POST /:mint/roles requires an API key", path: `/api/stablecoin/${DEVNET_MINT}/roles`, body: { role: "pauser", newHolder: SECONDARY_ADDRESS }, methodName: "updateRoles" },
      { name: "POST /:mint/minter requires an API key", path: `/api/stablecoin/${DEVNET_MINT}/minter`, body: { wallet: SECONDARY_ADDRESS, isActive: true, quota: "1" }, methodName: "updateMinter" },
      { name: "POST /:mint/attest requires an API key", path: `/api/stablecoin/${DEVNET_MINT}/attest`, body: { reserveHash: Array.from({ length: 32 }, () => 1), totalReservesUsd: "1", totalOutstanding: "1", attestationUri: "" }, methodName: "attestReserve" },
    ];

    test.each(unauthorizedCases)("$name", async ({ path, body, methodName }) => {
      const response = await request(app).post(path).send(body);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain("Unauthorized");
      expect(client[methodName]).not.toHaveBeenCalled();
    });

    const invalidMintCases = [
      { name: "POST /:mint/mint rejects an invalid mint address", path: "/api/stablecoin/not-a-pubkey/mint", body: { amount: "1", recipient: TOKEN_ACCOUNT } },
      { name: "POST /:mint/burn rejects an invalid mint address", path: "/api/stablecoin/not-a-pubkey/burn", body: { amount: "1", tokenAccount: TOKEN_ACCOUNT } },
      { name: "POST /:mint/pause rejects an invalid mint address", path: "/api/stablecoin/not-a-pubkey/pause", body: {} },
      { name: "POST /:mint/unpause rejects an invalid mint address", path: "/api/stablecoin/not-a-pubkey/unpause", body: {} },
      { name: "POST /:mint/freeze rejects an invalid mint address", path: "/api/stablecoin/not-a-pubkey/freeze", body: { tokenAccount: TOKEN_ACCOUNT } },
      { name: "POST /:mint/thaw rejects an invalid mint address", path: "/api/stablecoin/not-a-pubkey/thaw", body: { tokenAccount: TOKEN_ACCOUNT } },
      { name: "POST /:mint/blacklist/add rejects an invalid mint address", path: "/api/stablecoin/not-a-pubkey/blacklist/add", body: { address: SECONDARY_ADDRESS, tokenAccount: TOKEN_ACCOUNT } },
      { name: "POST /:mint/blacklist/remove rejects an invalid mint address", path: "/api/stablecoin/not-a-pubkey/blacklist/remove", body: { address: SECONDARY_ADDRESS, tokenAccount: TOKEN_ACCOUNT } },
      { name: "POST /:mint/seize rejects an invalid mint address", path: "/api/stablecoin/not-a-pubkey/seize", body: { blacklistedAddress: SECONDARY_ADDRESS, from: TOKEN_ACCOUNT, to: ALT_TOKEN_ACCOUNT, amount: "1" } },
      { name: "POST /:mint/roles rejects an invalid mint address", path: "/api/stablecoin/not-a-pubkey/roles", body: { role: "pauser", newHolder: SECONDARY_ADDRESS } },
      { name: "POST /:mint/minter rejects an invalid mint address", path: "/api/stablecoin/not-a-pubkey/minter", body: { wallet: SECONDARY_ADDRESS, isActive: true, quota: "1" } },
      { name: "POST /:mint/attest rejects an invalid mint address", path: "/api/stablecoin/not-a-pubkey/attest", body: { reserveHash: Array.from({ length: 32 }, () => 1), totalReservesUsd: "1", totalOutstanding: "1", attestationUri: "" } },
    ];

    test.each(invalidMintCases)("$name", async ({ path, body }) => {
      const response = await auth(request(app).post(path)).send(body);

      expect(response.status).toBe(500);
      expect(response.body.error.name).toBe("InternalServerError");
      expect(response.body.error.message).toMatch(/Invalid public key|Non-base58 character/);
    });

    const missingBodyCases = [
      { name: "POST /:mint/mint rejects a missing recipient", path: `/api/stablecoin/${DEVNET_MINT}/mint`, body: { amount: "1" }, methodName: "mintTokens" },
      { name: "POST /:mint/burn rejects a missing token account", path: `/api/stablecoin/${DEVNET_MINT}/burn`, body: { amount: "1" }, methodName: "burnTokens" },
      { name: "POST /:mint/freeze rejects a missing token account", path: `/api/stablecoin/${DEVNET_MINT}/freeze`, body: {}, methodName: "freezeAccount" },
      { name: "POST /:mint/thaw rejects a missing token account", path: `/api/stablecoin/${DEVNET_MINT}/thaw`, body: {}, methodName: "thawAccount" },
      { name: "POST /:mint/blacklist/add rejects a missing address", path: `/api/stablecoin/${DEVNET_MINT}/blacklist/add`, body: { tokenAccount: TOKEN_ACCOUNT }, methodName: "blacklistAdd" },
      { name: "POST /:mint/blacklist/remove rejects a missing token account", path: `/api/stablecoin/${DEVNET_MINT}/blacklist/remove`, body: { address: SECONDARY_ADDRESS }, methodName: "blacklistRemove" },
      { name: "POST /:mint/seize rejects a missing source token account", path: `/api/stablecoin/${DEVNET_MINT}/seize`, body: { blacklistedAddress: SECONDARY_ADDRESS, to: ALT_TOKEN_ACCOUNT, amount: "1" }, methodName: "seize" },
      { name: "POST /:mint/roles rejects a missing new holder", path: `/api/stablecoin/${DEVNET_MINT}/roles`, body: { role: "pauser" }, methodName: "updateRoles" },
      { name: "POST /:mint/minter rejects a missing wallet", path: `/api/stablecoin/${DEVNET_MINT}/minter`, body: { isActive: true, quota: "1" }, methodName: "updateMinter" },
    ];

    test.each(missingBodyCases)("$name", async ({ path, body, methodName }) => {
      const response = await auth(request(app).post(path)).send(body);

      expect(response.status).toBe(500);
      expect(client[methodName]).not.toHaveBeenCalled();
    });

    it("POST /:mint/attest rejects a missing reserve hash before the mocked client is invoked", async () => {
      client.attestReserve.mockImplementationOnce(async (_mint, params) => {
        if (!Array.isArray(params.reserveHash)) {
          throw new Error("reserveHash must be an array");
        }
        return { signature: "never-returned" };
      });

      const response = await auth(
        request(app).post(`/api/stablecoin/${DEVNET_MINT}/attest`)
      ).send({
        totalReservesUsd: "1",
        totalOutstanding: "1",
        attestationUri: "",
      });

      expect(response.status).toBe(500);
      expect(response.body.error.message).toContain("reserveHash must be an array");
    });
  });

  describe("rate limiting and webhook signatures", () => {
    it("rate limits POST requests before auth middleware runs", async () => {
      process.env.RATE_LIMIT_MAX = "1";
      process.env.RATE_LIMIT_WINDOW_MS = "60000";

      const rateLimitedApp = buildApp(client);
      const firstResponse = await request(rateLimitedApp)
        .post("/api/stablecoin/initialize")
        .send({ preset: "sss1" });
      const secondResponse = await request(rateLimitedApp)
        .post("/api/stablecoin/initialize")
        .send({ preset: "sss1" });

      expect(firstResponse.status).toBe(401);
      expect(secondResponse.status).toBe(429);
      expect(secondResponse.body.error.code).toBe("RATE_LIMITED");
      expect(secondResponse.body.error.retryAfter).toBeGreaterThan(0);
    });

    it("does not rate limit GET requests even when the POST limiter is exhausted", async () => {
      process.env.RATE_LIMIT_MAX = "1";
      process.env.RATE_LIMIT_WINDOW_MS = "60000";

      const rateLimitedApp = buildApp(client);
      await request(rateLimitedApp).post("/api/stablecoin/initialize").send({ preset: "sss1" });
      await request(rateLimitedApp).post("/api/stablecoin/initialize").send({ preset: "sss1" });

      const response = await request(rateLimitedApp).get(`/api/stablecoin/${DEVNET_MINT}`);

      expect(response.status).toBe(200);
      expect(response.body.config.symbol).toBe("dUSD");
    });

    it("computes deterministic webhook HMAC signatures from the raw payload", () => {
      const payload = { mint: DEVNET_MINT, status: "attested" };
      const first = computeWebhookSignature("super-secret", payload);
      const second = computeWebhookSignature("super-secret", payload);

      expect(first).toBe(second);
      expect(first).toMatch(/^[a-f0-9]{64}$/);
    });

    it("dispatches webhook deliveries with the expected sha256 signature header", async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });
      const service = createWebhookService({
        fetchImpl,
        disableRetryProcessor: true,
        now: () => 1_700_300_000_000,
      });
      const payload = { mint: DEVNET_MINT, amount: 1234 };

      service.state.webhooks.set("wh_test", {
        id: "wh_test",
        url: "https://example.com/webhooks/sss",
        eventTypes: ["stablecoin.attested"],
        secret: "dispatch-secret",
        createdAt: new Date(1_700_300_000_000).toISOString(),
        stats: {
          delivered: 0,
          failed: 0,
          pending: 0,
          lastDelivery: null,
          lastError: null,
        },
      });

      const delivered = await service.dispatch("stablecoin.attested", payload);

      expect(delivered).toBe(1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [, options] = fetchImpl.mock.calls[0];
      expect(options.headers["X-Webhook-Signature"]).toBe(
        `sha256=${computeWebhookSignature("dispatch-secret", payload)}`
      );
      expect(options.body).toContain('"type":"stablecoin.attested"');
    });

    it("queues a retry when webhook delivery fails HMAC-protected dispatch", async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
      const service = createWebhookService({
        fetchImpl,
        disableRetryProcessor: true,
        now: () => 1_700_300_000_000,
      });

      service.state.webhooks.set("wh_retry", {
        id: "wh_retry",
        url: "https://example.com/webhooks/retry",
        eventTypes: [],
        secret: "retry-secret",
        createdAt: new Date(1_700_300_000_000).toISOString(),
        stats: {
          delivered: 0,
          failed: 0,
          pending: 0,
          lastDelivery: null,
          lastError: null,
        },
      });

      const delivered = await service.dispatch("stablecoin.failed", { mint: DEVNET_MINT });

      expect(delivered).toBe(0);
      expect(service.state.retryQueue).toHaveLength(1);
      expect(service.state.retryQueue[0].lastError).toContain("HTTP 500");
    });
  });
});
