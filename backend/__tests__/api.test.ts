import { expect } from "chai";
import request from "supertest";
import { Keypair } from "@solana/web3.js";
import { createApp } from "../src/app";

const FAKE_MINT = "47TNsKC1iJvLTKYRMbfYjrod4a56YE1f4qv73hZkdWUZ";
const FAKE_RECIPIENT = "7dcFLm6QsT8Zo7MAXQFrmJaDDxf5RDZb7VuiHupuiNwZ";

function mockStablecoinState() {
  return {
    mint: { toBase58: () => FAKE_MINT },
    authority: { toBase58: () => FAKE_RECIPIENT },
    name: "Test USD",
    symbol: "TUSD",
    uri: "",
    decimals: 6,
    paused: false,
    total_minted: { toString: () => "0" },
    total_burned: { toString: () => "0" },
    enable_permanent_delegate: false,
    enable_transfer_hook: false,
    default_account_frozen: false,
  };
}

describe("API", () => {
  const testKeypair = Keypair.generate();

  const app = createApp({
    getKeypair: () => testKeypair,
    getMintAddress: () => FAKE_MINT,
    loadStable: async () =>
      ({
        getState: async () => mockStablecoinState(),
        getTotalSupply: async () => ({ toString: () => "0" }),
        mint: async () => "mock_sig_mint",
        burn: async () => "mock_sig_burn",
        pause: async () => "mock_sig_pause",
        unpause: async () => "mock_sig_unpause",
        freezeAccount: async () => "mock_sig_freeze",
        thawAccount: async () => "mock_sig_thaw",
        updateRoles: async () => "mock_sig_roles",
        compliance: { seize: async () => "mock_sig_seize" },
      }) as never,
  });

  describe("GET /health", () => {
    it("returns 200 with status, rpc, mint, compliance", async () => {
      const res = await request(app).get("/health");
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("status", "ok");
      expect(res.body).to.have.property("rpc");
      expect(res.body).to.have.property("mint");
      expect(res.body).to.have.property("compliance", true);
    });
  });

  describe("GET /status/:mint", () => {
    it("returns 200 and expected shape for valid mint", async () => {
      const res = await request(app).get("/status/" + FAKE_MINT);
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("mint", FAKE_MINT);
      expect(res.body).to.have.property("symbol", "TUSD");
      expect(res.body).to.have.property("supply");
      expect(res.body).to.have.property("decimals", 6);
      expect(res.body).to.have.property("paused", false);
      expect(res.body).to.have.property("preset");
    });
  });

  describe("POST /mint-request", () => {
    it("returns 200 and signature", async () => {
      const res = await request(app).post("/mint-request").send({ recipient: FAKE_RECIPIENT, amount: "1000" });
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("success", true);
      expect(res.body).to.have.property("signature");
    });
  });

  describe("POST /burn-request", () => {
    it("returns 200 and signature", async () => {
      const res = await request(app).post("/burn-request").send({ amount: "100" });
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("success", true);
      expect(res.body).to.have.property("signature");
    });
  });

  describe("POST /operations/pause", () => {
    it("returns 200 and signature", async () => {
      const res = await request(app).post("/operations/pause").send({ mint: FAKE_MINT });
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("success", true);
      expect(res.body).to.have.property("signature");
    });
  });

  describe("GET /compliance/audit-log", () => {
    it("returns 200 and array", async () => {
      const res = await request(app).get("/compliance/audit-log");
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("entries");
      expect(res.body.entries).to.be.an("array");
    });
  });

  describe("Protected routes when API_KEY is set", () => {
    const appWithAuth = createApp({
      getKeypair: () => testKeypair,
      getMintAddress: () => FAKE_MINT,
      loadStable: async () =>
        ({
          getState: async () => mockStablecoinState(),
          getTotalSupply: async () => ({ toString: () => "0" }),
          mint: async () => "mock_sig",
          burn: async () => "mock_sig",
          pause: async () => "mock_sig",
          unpause: async () => "mock_sig",
          freezeAccount: async () => "mock_sig",
          thawAccount: async () => "mock_sig",
          updateRoles: async () => "mock_sig",
          compliance: { seize: async () => "mock_sig" },
        }) as never,
    });

    before(() => {
      process.env.API_KEY = "test-secret-key";
    });
    after(() => {
      delete process.env.API_KEY;
    });

    it("returns 401 when X-API-Key is missing", async () => {
      const res = await request(appWithAuth)
        .post("/mint-request")
        .send({ recipient: FAKE_RECIPIENT, amount: "1000" });
      expect(res.status).to.equal(401);
      expect(res.body).to.have.property("error", "Unauthorized");
    });

    it("returns 401 when X-API-Key is wrong", async () => {
      const res = await request(appWithAuth)
        .post("/mint-request")
        .set("X-API-Key", "wrong-key")
        .send({ recipient: FAKE_RECIPIENT, amount: "1000" });
      expect(res.status).to.equal(401);
      expect(res.body).to.have.property("error", "Unauthorized");
    });

    it("returns 200 when X-API-Key is correct", async () => {
      const res = await request(appWithAuth)
        .post("/mint-request")
        .set("X-API-Key", "test-secret-key")
        .send({ recipient: FAKE_RECIPIENT, amount: "1000" });
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("success", true);
    });
  });

  describe("Validation abuse", () => {
    it("POST /mint-request with invalid body returns 400 and details", async () => {
      const res = await request(app).post("/mint-request").send({ amount: "1000" });
      expect(res.status).to.equal(400);
      expect(res.body).to.have.property("error", "Validation failed");
      expect(res.body).to.have.property("details");
    });

    it("POST /mint-request with missing mint (when MINT not in options) returns 500", async () => {
      const appNoMint = createApp({
        getKeypair: () => testKeypair,
        getMintAddress: () => undefined,
        loadStable: async () => ({} as never),
      });
      const res = await request(appNoMint)
        .post("/mint-request")
        .send({ recipient: FAKE_RECIPIENT, amount: "1000" });
      expect(res.status).to.equal(500);
      expect(res.body).to.have.property("error");
    });
  });
});
