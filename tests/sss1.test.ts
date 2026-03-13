import assert from "node:assert/strict";
import test from "node:test";

import { Connection, Keypair } from "@solana/web3.js";
import { Presets, SolanaStablecoin } from "../sdk/src/index.js";

test("SSS-1 preset initializes and enforces pause gating", async () => {
  const connection = new Connection("http://localhost:8899", "confirmed");
  const authority = Keypair.generate();
  const recipient = Keypair.generate();

  const stable = await SolanaStablecoin.create({
    connection,
    authority,
    preset: Presets.SSS_1,
    name: "Test USD",
    symbol: "TUSD",
    decimals: 6
  });

  const config = await stable.getConfig();
  assert.equal(config.enablePermanentDelegate, false);
  assert.equal(config.enableTransferHook, false);

  await stable.mint({
    destination: recipient.publicKey,
    amount: 1_000_000n,
    minter: authority
  });

  assert.equal(await stable.getTotalSupply(), 1_000_000n);

  await stable.pause();
  await assert.rejects(
    stable.mint({ destination: recipient.publicKey, amount: 1n, minter: authority }),
    /Paused/
  );
});
