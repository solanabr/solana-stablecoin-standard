import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";

import {
  getConfigAddress,
  getRoleAddress,
  getQuotaAddress,
  getBlacklistAddress,
  getAllowlistAddress,
  getOracleConfigAddress,
  getExtraAccountMetasAddress,
  deriveStablecoinAddresses,
  ROLE_MINTER,
  ROLE_FREEZER,
  ROLE_BLACKLISTER,
  ROLE_SEIZER,
  CONFIG_SEED,
  ROLE_SEED,
  QUOTA_SEED,
  BLACKLIST_SEED,
  ALLOWLIST_SEED,
  ORACLE_CONFIG_SEED,
} from "../src/pda";

const PROGRAM_ID = new PublicKey("G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL");
const HOOK_PROGRAM_ID = new PublicKey("EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389");

describe("PDA derivation", () => {
  const mint = PublicKey.unique();
  const holder = PublicKey.unique();

  describe("getConfigAddress", () => {
    it("derives deterministic config PDA from mint", () => {
      const [addr1, bump1] = getConfigAddress(PROGRAM_ID, mint);
      const [addr2, bump2] = getConfigAddress(PROGRAM_ID, mint);
      expect(addr1.toBase58()).to.equal(addr2.toBase58());
      expect(bump1).to.equal(bump2);
    });

    it("different mints produce different config PDAs", () => {
      const mint2 = PublicKey.unique();
      const [addr1] = getConfigAddress(PROGRAM_ID, mint);
      const [addr2] = getConfigAddress(PROGRAM_ID, mint2);
      expect(addr1.toBase58()).to.not.equal(addr2.toBase58());
    });

    it("config PDA matches manual derivation", () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [CONFIG_SEED, mint.toBuffer()],
        PROGRAM_ID,
      );
      const [actual] = getConfigAddress(PROGRAM_ID, mint);
      expect(actual.toBase58()).to.equal(expected.toBase58());
    });
  });

  describe("getRoleAddress", () => {
    const [config] = getConfigAddress(PROGRAM_ID, mint);

    it("derives role PDA for minter", () => {
      const [addr] = getRoleAddress(PROGRAM_ID, ROLE_MINTER, config, holder);
      expect(PublicKey.isOnCurve(addr.toBytes())).to.equal(false);
    });

    it("different roles produce different PDAs", () => {
      const [minterAddr] = getRoleAddress(PROGRAM_ID, ROLE_MINTER, config, holder);
      const [freezerAddr] = getRoleAddress(PROGRAM_ID, ROLE_FREEZER, config, holder);
      expect(minterAddr.toBase58()).to.not.equal(freezerAddr.toBase58());
    });

    it("different holders produce different PDAs", () => {
      const holder2 = PublicKey.unique();
      const [addr1] = getRoleAddress(PROGRAM_ID, ROLE_MINTER, config, holder);
      const [addr2] = getRoleAddress(PROGRAM_ID, ROLE_MINTER, config, holder2);
      expect(addr1.toBase58()).to.not.equal(addr2.toBase58());
    });

    it("role PDA matches manual derivation", () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [ROLE_SEED, config.toBuffer(), Buffer.from([ROLE_BLACKLISTER]), holder.toBuffer()],
        PROGRAM_ID,
      );
      const [actual] = getRoleAddress(PROGRAM_ID, ROLE_BLACKLISTER, config, holder);
      expect(actual.toBase58()).to.equal(expected.toBase58());
    });
  });

  describe("getQuotaAddress", () => {
    it("derives quota PDA", () => {
      const [config] = getConfigAddress(PROGRAM_ID, mint);
      const [quotaAddr] = getQuotaAddress(PROGRAM_ID, config, holder);
      const [expected] = PublicKey.findProgramAddressSync(
        [QUOTA_SEED, config.toBuffer(), holder.toBuffer()],
        PROGRAM_ID,
      );
      expect(quotaAddr.toBase58()).to.equal(expected.toBase58());
    });
  });

  describe("getBlacklistAddress", () => {
    it("derives blacklist PDA", () => {
      const [config] = getConfigAddress(PROGRAM_ID, mint);
      const target = PublicKey.unique();
      const [blAddr] = getBlacklistAddress(PROGRAM_ID, config, target);
      const [expected] = PublicKey.findProgramAddressSync(
        [BLACKLIST_SEED, config.toBuffer(), target.toBuffer()],
        PROGRAM_ID,
      );
      expect(blAddr.toBase58()).to.equal(expected.toBase58());
    });
  });

  describe("getAllowlistAddress", () => {
    it("derives allowlist PDA", () => {
      const [config] = getConfigAddress(PROGRAM_ID, mint);
      const target = PublicKey.unique();
      const [alAddr] = getAllowlistAddress(PROGRAM_ID, config, target);
      const [expected] = PublicKey.findProgramAddressSync(
        [ALLOWLIST_SEED, config.toBuffer(), target.toBuffer()],
        PROGRAM_ID,
      );
      expect(alAddr.toBase58()).to.equal(expected.toBase58());
    });

    it("different addresses produce different allowlist PDAs", () => {
      const [config] = getConfigAddress(PROGRAM_ID, mint);
      const addr1 = PublicKey.unique();
      const addr2 = PublicKey.unique();
      const [al1] = getAllowlistAddress(PROGRAM_ID, config, addr1);
      const [al2] = getAllowlistAddress(PROGRAM_ID, config, addr2);
      expect(al1.toBase58()).to.not.equal(al2.toBase58());
    });
  });

  describe("getOracleConfigAddress", () => {
    it("derives oracle config PDA", () => {
      const [config] = getConfigAddress(PROGRAM_ID, mint);
      const [oracleAddr] = getOracleConfigAddress(PROGRAM_ID, config);
      const [expected] = PublicKey.findProgramAddressSync(
        [ORACLE_CONFIG_SEED, config.toBuffer()],
        PROGRAM_ID,
      );
      expect(oracleAddr.toBase58()).to.equal(expected.toBase58());
    });

    it("different configs produce different oracle PDAs", () => {
      const mint2 = PublicKey.unique();
      const [config1] = getConfigAddress(PROGRAM_ID, mint);
      const [config2] = getConfigAddress(PROGRAM_ID, mint2);
      const [oracle1] = getOracleConfigAddress(PROGRAM_ID, config1);
      const [oracle2] = getOracleConfigAddress(PROGRAM_ID, config2);
      expect(oracle1.toBase58()).to.not.equal(oracle2.toBase58());
    });
  });

  describe("getExtraAccountMetasAddress", () => {
    it("derives extra account metas PDA under hook program", () => {
      const [addr] = getExtraAccountMetasAddress(HOOK_PROGRAM_ID, mint);
      expect(PublicKey.isOnCurve(addr.toBytes())).to.equal(false);
    });
  });

  describe("deriveStablecoinAddresses", () => {
    it("returns config and mint together", () => {
      const result = deriveStablecoinAddresses(PROGRAM_ID, mint);
      expect(result.mint.toBase58()).to.equal(mint.toBase58());
      const [expectedConfig] = getConfigAddress(PROGRAM_ID, mint);
      expect(result.config.toBase58()).to.equal(expectedConfig.toBase58());
    });
  });
});
