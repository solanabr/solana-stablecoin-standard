import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA");

function getIdl(): any {
  const idlPath = path.resolve(process.cwd(), "..", "target", "idl", "stablecoin.json");
  if (!fs.existsSync(idlPath)) {
    throw new Error("IDL not found. Run 'anchor build' first.");
  }
  return JSON.parse(fs.readFileSync(idlPath, "utf-8"));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mintStr = searchParams.get("mint");
  const rpcUrl = searchParams.get("rpc") || "https://api.devnet.solana.com";

  if (!mintStr) {
    return NextResponse.json({ error: "mint parameter required" }, { status: 400 });
  }

  try {
    const mint = new PublicKey(mintStr);
    const connection = new Connection(rpcUrl, "confirmed");
    const idl = getIdl();

    const provider = new anchor.AnchorProvider(
      connection,
      { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t } as any,
      { commitment: "confirmed" }
    );

    const program = new anchor.Program(idl, provider);

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.toBuffer()],
      PROGRAM_ID
    );

    const config = await (program.account as any).stablecoinConfig.fetch(configPda);

    return NextResponse.json({
      mint: config.mint.toBase58(),
      name: config.name,
      symbol: config.symbol,
      decimals: config.decimals,
      preset: Object.keys(config.preset)[0],
      owner: config.owner.toBase58(),
      masterMinter: config.masterMinter.toBase58(),
      pauser: config.pauser.toBase58(),
      blacklister: config.blacklister.toBase58(),
      isPaused: config.isPaused,
      totalMinted: config.totalMinted.toString(),
      totalBurned: config.totalBurned.toString(),
      enableTransferHook: config.enableTransferHook,
      enablePermanentDelegate: config.enablePermanentDelegate,
      enableConfidentialTransfers: config.enableConfidentialTransfers,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
