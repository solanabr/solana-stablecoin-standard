import assert from "node:assert/strict";
import test from "node:test";

import { Connection, Keypair } from "@solana/web3.js";
import { Presets, SolanaStablecoin } from "../sdk/src/index.js";

test("SSS-2 preset enables compliance client", async () => {
  const connection = new Connection("http://localhost:8899", "confirmed");
  const authority = Keypair.generate();
  const badActor = Keypair.generate();
  const treasury = Keypair.generate();

  const stable = await SolanaStablecoin.create({
    connection,
    authority,
    preset: Presets.SSS_2,
    name: "Regulated USD",
    symbol: "rUSD",
    decimals: 6
  });

  const config = await stable.getConfig();
  assert.equal(config.enablePermanentDelegate, true);
  assert.equal(config.enableTransferHook, true);

  const result = await stable.compliance.blacklistAdd(badActor.publicKey, "OFAC match");
  assert.equal(result, "blacklist-added");

  const seizeResult = await stable.seize({
    fromAccount: badActor.publicKey,
    toAccount: treasury.publicKey,
    seizer: authority
  });

  assert.match(seizeResult, /seize:/);
});
