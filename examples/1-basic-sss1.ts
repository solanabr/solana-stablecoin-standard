// Example 1: SSS-1 minimal — init (preset SSS_1), mint, freeze, thaw, burn, load.

import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  SolanaStablecoin,
  getProgram,
} from "@stbr/sss-token";

const RPC = process.env.RPC_URL ?? "http://localhost:8899";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const authority = Keypair.generate();

  try {
    const sig = await connection.requestAirdrop(authority.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  } catch {
    console.log("Airdrop skipped (use localnet or devnet)");
  }

  const stable = await SolanaStablecoin.create(
    connection,
    {
      preset: "SSS_1",
      name: "My DAO Token",
      symbol: "DAO",
      uri: "https://example.com/dao.json",
      decimals: 6,
    },
    authority
  );

  console.log("Stablecoin created:");
  console.log("  Mint:", stable.mintAddress.toBase58());
  console.log("  Stablecoin PDA:", stable.stablecoin.toBase58());

  await stable.updateRoles(authority.publicKey, {
    holder: authority.publicKey,
    roles: {
      isMinter: true,
      isBurner: true,
      isPauser: true,
      isFreezer: false,
      isBlacklister: false,
      isSeizer: false,
    },
  });
  await stable.updateMinter(authority.publicKey, {
    minter: authority.publicKey,
    quota: BigInt(1_000_000_000_000),
  });

  const amount = BigInt(100_000_000);
  const txMint = await stable.mint(authority.publicKey, {
    recipient: authority.publicKey,
    amount,
    minter: authority.publicKey,
  });
  console.log("Mint tx:", txMint);

  const state = await stable.getState();
  console.log("Total minted:", state.total_minted.toString());
  const supply = await stable.getTotalSupply();
  console.log("Supply:", supply.toString());

  const provider = new AnchorProvider(connection, new Wallet(authority), {});
  const program = getProgram(provider);
  const loaded = await SolanaStablecoin.load(program, stable.mintAddress);
  console.log("Loaded same stablecoin:", loaded.mintAddress.toBase58());

  const authorityAta = stable.getRecipientTokenAccount(authority.publicKey);
  const txFreeze = await stable.freezeAccount(authority.publicKey, authorityAta);
  console.log("Freeze tx:", txFreeze);
  const txThaw = await stable.thawAccount(authority.publicKey, authorityAta);
  console.log("Thaw tx:", txThaw);

  const txBurn = await stable.burn(authority.publicKey, { amount: BigInt(50_000_000) });
  console.log("Burn tx:", txBurn);
  const supplyAfter = await stable.getTotalSupply();
  console.log("Supply after burn:", supplyAfter.toString());
}

main().catch(console.error);
