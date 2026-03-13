import assert from "node:assert/strict";

const { Connection, Keypair } = await import("@solana/web3.js");
const sdk = await import("../sdk/dist/index.js");

const connection = new Connection("http://127.0.0.1:8899", "confirmed");

async function main() {
  const version = await connection.getVersion();
  assert.ok(version["solana-core"], "Local validator did not report a Solana core version");

  const authority = Keypair.generate();
  const recipient = Keypair.generate();

  const sss1 = await sdk.SolanaStablecoin.create({
    connection,
    authority,
    preset: sdk.Presets.SSS_1,
    name: "Localnet Minimal USD",
    symbol: "lUSD",
    decimals: 6
  });

  const sss2 = await sdk.SolanaStablecoin.create({
    connection,
    authority,
    preset: sdk.Presets.SSS_2,
    name: "Localnet Regulated USD",
    symbol: "lrUSD",
    decimals: 6
  });

  const flows = [
    await sss1.buildInitializeTransaction(),
    await sss1.buildMintTransaction({ destination: recipient.publicKey, amount: 1_000_000n, minter: authority }),
    await sss1.buildPauseTransaction(true),
    await sss1.buildPauseTransaction(false),
    await sss2.buildInitializeTransaction(),
    await sss2.buildMintTransaction({ destination: recipient.publicKey, amount: 1_000_000n, minter: authority }),
    await sss2.buildSeizeTransaction({
      fromAccount: recipient.publicKey,
      toAccount: authority.publicKey,
      seizer: authority
    })
  ];

  for (const transaction of flows) {
    assert.equal(transaction.instructions.length, 1);
  }

  process.stdout.write("localnet-smoke:ok\n");
}

main().catch((error) => {
  process.stderr.write(`localnet-smoke:failed:${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
