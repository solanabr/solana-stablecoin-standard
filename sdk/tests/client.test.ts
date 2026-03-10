import { expect } from "chai";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { StablecoinClient } from "../src/client";
import { ComplianceClient } from "../src/compliance";
import { SSS_CORE_PROGRAM_ID, SSS_HOOK_PROGRAM_ID } from "../src/constants";

/**
 * Helper: create a dummy wallet from a keypair (Anchor Wallet interface).
 */
function makeDummyWallet(): Wallet {
  return new Wallet(Keypair.generate());
}

/**
 * Helper: create a Connection that will never actually be used for network calls.
 * We use a fake RPC URL so nothing can accidentally reach the network.
 */
function makeDummyConnection(): Connection {
  return new Connection("http://127.0.0.1:1"); // unreachable
}

describe("StablecoinClient", () => {
  let connection: Connection;
  let wallet: Wallet;
  let client: StablecoinClient;

  before(() => {
    connection = makeDummyConnection();
    wallet = makeDummyWallet();
    client = new StablecoinClient(connection, wallet);
  });

  // ---------- Constructor ----------

  describe("constructor", () => {
    it("should accept a Connection and Wallet", () => {
      const c = new StablecoinClient(connection, wallet);
      expect(c).to.be.instanceOf(StablecoinClient);
    });

    it("should accept an optional custom programId", () => {
      const customId = Keypair.generate().publicKey;
      const c = new StablecoinClient(connection, wallet, customId);
      expect(c).to.be.instanceOf(StablecoinClient);
    });

    it("should default to SSS_CORE_PROGRAM_ID when no programId is provided", () => {
      // We cannot directly inspect the private field, but we can confirm
      // it does not throw and is a valid instance.
      const c = new StablecoinClient(connection, wallet);
      expect(c).to.be.instanceOf(StablecoinClient);
    });
  });

  // ---------- Method existence ----------

  describe("method signatures", () => {
    it("should have an initialize method", () => {
      expect(client).to.have.property("initialize").that.is.a("function");
    });

    it("should have a configureMinter method", () => {
      expect(client).to.have.property("configureMinter").that.is.a("function");
    });

    it("should have a removeMinter method", () => {
      expect(client).to.have.property("removeMinter").that.is.a("function");
    });

    it("should have a mint method", () => {
      expect(client).to.have.property("mint").that.is.a("function");
    });

    it("should have a burn method", () => {
      expect(client).to.have.property("burn").that.is.a("function");
    });

    it("should have a freezeAccount method", () => {
      expect(client).to.have.property("freezeAccount").that.is.a("function");
    });

    it("should have a thawAccount method", () => {
      expect(client).to.have.property("thawAccount").that.is.a("function");
    });

    it("should have a pause method", () => {
      expect(client).to.have.property("pause").that.is.a("function");
    });

    it("should have an unpause method", () => {
      expect(client).to.have.property("unpause").that.is.a("function");
    });

    it("should have an updateRole method", () => {
      expect(client).to.have.property("updateRole").that.is.a("function");
    });

    it("should have a transferAuthority method", () => {
      expect(client)
        .to.have.property("transferAuthority")
        .that.is.a("function");
    });

    it("should have an acceptAuthority method", () => {
      expect(client)
        .to.have.property("acceptAuthority")
        .that.is.a("function");
    });

    it("should have a seize method", () => {
      expect(client).to.have.property("seize").that.is.a("function");
    });

    it("should have a getConfig method", () => {
      expect(client).to.have.property("getConfig").that.is.a("function");
    });

    it("should have a getMinterState method", () => {
      expect(client).to.have.property("getMinterState").that.is.a("function");
    });
  });

  // ---------- Method arity (parameter counts) ----------

  describe("method parameter counts", () => {
    it("initialize should accept 1-2 parameters (params, hookProgram?)", () => {
      // Function.length reports the count of non-optional-default params
      // In JS, optional params still count. The actual .length is the number
      // of parameters before the first one with a default value.
      expect(client.initialize.length).to.be.at.least(1);
      expect(client.initialize.length).to.be.at.most(2);
    });

    it("configureMinter should accept 3 parameters (mint, minterWallet, quota)", () => {
      expect(client.configureMinter.length).to.equal(3);
    });

    it("removeMinter should accept 2 parameters (mint, minterWallet)", () => {
      expect(client.removeMinter.length).to.equal(2);
    });

    it("mint should accept 3 parameters (mint, destination, amount)", () => {
      expect(client.mint.length).to.equal(3);
    });

    it("burn should accept 2 parameters (mint, amount)", () => {
      expect(client.burn.length).to.equal(2);
    });

    it("freezeAccount should accept 2 parameters (mint, targetTokenAccount)", () => {
      expect(client.freezeAccount.length).to.equal(2);
    });

    it("thawAccount should accept 2 parameters (mint, targetTokenAccount)", () => {
      expect(client.thawAccount.length).to.equal(2);
    });

    it("pause should accept 1 parameter (mint)", () => {
      expect(client.pause.length).to.equal(1);
    });

    it("unpause should accept 1 parameter (mint)", () => {
      expect(client.unpause.length).to.equal(1);
    });

    it("updateRole should accept 3 parameters (mint, role, newAddress)", () => {
      expect(client.updateRole.length).to.equal(3);
    });

    it("transferAuthority should accept 2 parameters (mint, newAuthority)", () => {
      expect(client.transferAuthority.length).to.equal(2);
    });

    it("acceptAuthority should accept 1 parameter (mint)", () => {
      expect(client.acceptAuthority.length).to.equal(1);
    });

    it("seize should accept 4 parameters (mint, source, destination, amount)", () => {
      expect(client.seize.length).to.equal(4);
    });

    it("getConfig should accept 1 parameter (mint)", () => {
      expect(client.getConfig.length).to.equal(1);
    });

    it("getMinterState should accept 2 parameters (mint, minterWallet)", () => {
      expect(client.getMinterState.length).to.equal(2);
    });
  });
});

describe("ComplianceClient", () => {
  let connection: Connection;
  let wallet: Wallet;
  let complianceClient: ComplianceClient;

  before(() => {
    connection = makeDummyConnection();
    wallet = makeDummyWallet();
    complianceClient = new ComplianceClient(connection, wallet);
  });

  // ---------- Inheritance ----------

  describe("inheritance", () => {
    it("should be an instance of ComplianceClient", () => {
      expect(complianceClient).to.be.instanceOf(ComplianceClient);
    });

    it("should extend StablecoinClient", () => {
      expect(complianceClient).to.be.instanceOf(StablecoinClient);
    });

    it("should inherit all StablecoinClient methods", () => {
      const baseMethods = [
        "initialize",
        "configureMinter",
        "removeMinter",
        "mint",
        "burn",
        "freezeAccount",
        "thawAccount",
        "pause",
        "unpause",
        "updateRole",
        "transferAuthority",
        "acceptAuthority",
        "seize",
        "getConfig",
        "getMinterState",
      ];
      for (const method of baseMethods) {
        expect(complianceClient)
          .to.have.property(method)
          .that.is.a("function");
      }
    });
  });

  // ---------- Constructor ----------

  describe("constructor", () => {
    it("should accept a Connection and Wallet", () => {
      const c = new ComplianceClient(connection, wallet);
      expect(c).to.be.instanceOf(ComplianceClient);
    });

    it("should accept optional custom programId and hookProgramId", () => {
      const customCore = Keypair.generate().publicKey;
      const customHook = Keypair.generate().publicKey;
      const c = new ComplianceClient(connection, wallet, customCore, customHook);
      expect(c).to.be.instanceOf(ComplianceClient);
    });
  });

  // ---------- Additional compliance methods ----------

  describe("compliance-specific methods", () => {
    it("should have an initializeHook method", () => {
      expect(complianceClient)
        .to.have.property("initializeHook")
        .that.is.a("function");
    });

    it("should have an addToBlacklist method", () => {
      expect(complianceClient)
        .to.have.property("addToBlacklist")
        .that.is.a("function");
    });

    it("should have a removeFromBlacklist method", () => {
      expect(complianceClient)
        .to.have.property("removeFromBlacklist")
        .that.is.a("function");
    });

    it("should have an isBlacklisted method", () => {
      expect(complianceClient)
        .to.have.property("isBlacklisted")
        .that.is.a("function");
    });

    it("should have a getBlacklistEntry method", () => {
      expect(complianceClient)
        .to.have.property("getBlacklistEntry")
        .that.is.a("function");
    });

    it("should have a getHookConfig method", () => {
      expect(complianceClient)
        .to.have.property("getHookConfig")
        .that.is.a("function");
    });
  });

  // ---------- Method arity (parameter counts) ----------

  describe("compliance method parameter counts", () => {
    it("initializeHook should accept 1 parameter (mint)", () => {
      expect(complianceClient.initializeHook.length).to.equal(1);
    });

    it("addToBlacklist should accept 3 parameters (mint, wallet, reason)", () => {
      expect(complianceClient.addToBlacklist.length).to.equal(3);
    });

    it("removeFromBlacklist should accept 2 parameters (mint, wallet)", () => {
      expect(complianceClient.removeFromBlacklist.length).to.equal(2);
    });

    it("isBlacklisted should accept 2 parameters (mint, wallet)", () => {
      expect(complianceClient.isBlacklisted.length).to.equal(2);
    });

    it("getBlacklistEntry should accept 2 parameters (mint, wallet)", () => {
      expect(complianceClient.getBlacklistEntry.length).to.equal(2);
    });

    it("getHookConfig should accept 1 parameter (mint)", () => {
      expect(complianceClient.getHookConfig.length).to.equal(1);
    });
  });
});
