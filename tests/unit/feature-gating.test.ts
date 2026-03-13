import assert from "node:assert/strict";
import test from "node:test";

import { Connection, Keypair } from "@solana/web3.js";
import { Presets, SolanaStablecoin } from "../../sdk/src/index.js";

test("SSS-1 rejects compliance calls", async () => {
  const stable = await SolanaStablecoin.create({
    connection: new Connection("http://localhost:8899", "confirmed"),
    authority: Keypair.generate(),
    preset: Presets.SSS_1,
    name: "Minimal USD",
    symbol: "mUSD",
    decimals: 6
  });

  await assert.rejects(
    stable.compliance.blacklistAdd(Keypair.generate().publicKey, "test"),
    /ComplianceNotEnabled/
  );
});
