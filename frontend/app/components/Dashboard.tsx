"use client";

import { useEffect, useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const MINT = new PublicKey(process.env.NEXT_PUBLIC_MINT_ADDRESS || "11111111111111111111111111111111");
const SSS_PROGRAM = new PublicKey(process.env.NEXT_PUBLIC_SSS_PROGRAM_ID || "E7iCiXrkudyt5j1nVHHmbuqCEyLP2hD4VGNJyuPAdWwP");

interface StablecoinInfo {
  name: string;
  symbol: string;
  decimals: number;
  paused: boolean;
  totalMinted: bigint;
  totalBurned: bigint;
}

interface HolderBalance {
  balance: bigint;
  frozen: boolean;
}

function formatAmount(raw: bigint, decimals: number): string {
  const str = raw.toString().padStart(decimals + 1, "0");
  const whole = str.slice(0, str.length - decimals) || "0";
  const frac = str.slice(str.length - decimals);
  return `${Number(whole).toLocaleString()}.${frac.slice(0, 2)}`;
}

export default function Dashboard() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [info, setInfo] = useState<StablecoinInfo | null>(null);
  const [balance, setBalance] = useState<HolderBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInfo = useCallback(async () => {
    try {
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("stablecoin_config"), MINT.toBuffer()],
        SSS_PROGRAM
      );
      const accountInfo = await connection.getAccountInfo(configPda);
      if (!accountInfo) {
        setInfo(null);
        setLoading(false);
        return;
      }

      // Parse the config account (Anchor discriminator = 8 bytes)
      const data = accountInfo.data;
      const d = 8; // skip discriminator
      // authority: 32, mint: 32, name(4+len), symbol(4+len), decimals: 1, paused: 1, totalMinted: 8, totalBurned: 8
      const nameLen = data.readUInt32LE(d + 64);
      const name = data.subarray(d + 68, d + 68 + nameLen).toString("utf8");
      const symOff = d + 68 + nameLen;
      const symLen = data.readUInt32LE(symOff);
      const symbol = data.subarray(symOff + 4, symOff + 4 + symLen).toString("utf8");
      const metaOff = symOff + 4 + symLen;
      const decimals = data[metaOff];
      const paused = data[metaOff + 1] === 1;
      const totalMinted = data.readBigUInt64LE(metaOff + 2);
      const totalBurned = data.readBigUInt64LE(metaOff + 10);

      setInfo({ name, symbol, decimals, paused, totalMinted, totalBurned });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load stablecoin info");
    } finally {
      setLoading(false);
    }
  }, [connection]);

  const fetchBalance = useCallback(async () => {
    if (!publicKey || !info) return;
    try {
      const ata = getAssociatedTokenAddressSync(MINT, publicKey, false, TOKEN_2022_PROGRAM_ID);
      const account = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
      setBalance({ balance: account.amount, frozen: account.isFrozen });
    } catch {
      setBalance({ balance: 0n, frozen: false });
    }
  }, [publicKey, info, connection]);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);
  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight">SSS Dashboard</h1>
        <WalletMultiButton />
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {loading && <p className="text-zinc-400">Loading...</p>}
        {error && <p className="text-red-400">{error}</p>}

        {!loading && !info && (
          <div className="rounded-lg border border-zinc-800 p-8 text-center">
            <p className="text-zinc-400">
              No stablecoin found. Set <code className="text-zinc-300">NEXT_PUBLIC_MINT_ADDRESS</code> in your <code className="text-zinc-300">.env.local</code> file.
            </p>
          </div>
        )}

        {info && (
          <>
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card label="Name" value={info.name} />
              <Card label="Symbol" value={info.symbol} />
              <Card label="Supply" value={formatAmount(info.totalMinted - info.totalBurned, info.decimals)} />
              <Card
                label="Status"
                value={info.paused ? "Paused" : "Active"}
                className={info.paused ? "text-red-400" : "text-green-400"}
              />
            </div>

            <div className="mb-8 grid grid-cols-2 gap-4">
              <Card label="Total Minted" value={formatAmount(info.totalMinted, info.decimals)} />
              <Card label="Total Burned" value={formatAmount(info.totalBurned, info.decimals)} />
            </div>

            {publicKey && (
              <div className="rounded-lg border border-zinc-800 p-6">
                <h2 className="mb-4 text-lg font-semibold">Your Wallet</h2>
                <p className="mb-2 text-sm text-zinc-400 break-all">{publicKey.toBase58()}</p>
                {balance ? (
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold">
                      {formatAmount(balance.balance, info.decimals)} {info.symbol}
                    </span>
                    {balance.frozen && (
                      <span className="rounded bg-red-900/50 px-2 py-1 text-xs text-red-300">Frozen</span>
                    )}
                  </div>
                ) : (
                  <p className="text-zinc-500">No token account found</p>
                )}
              </div>
            )}

            {!publicKey && (
              <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center">
                <p className="text-zinc-400">Connect your wallet to see your balance</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Card({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${className || ""}`}>{value}</p>
    </div>
  );
}
