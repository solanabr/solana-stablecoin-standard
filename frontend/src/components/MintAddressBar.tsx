import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { shortenAddress, getConfigAddress } from "../utils/pda";
import { Copy, X, RefreshCw, ChevronDown, Hexagon } from "lucide-react";
import idl from "../idl/sss_core.json";

interface Props {
  mintAddress: string;
  onMintAddressChange: (addr: string) => void;
}

interface StablecoinEntry {
  mint: string;
  tier: string;
  tierColor: string;
  tierBg: string;
}

function detectTier(account: any): { tier: string; tierColor: string; tierBg: string } {
  const hasAllowlist = account.enableAllowlist;
  const hasCompliance = account.complianceEnabled;

  if (hasAllowlist && hasCompliance) {
    return { tier: "SSS-3", tierColor: "text-purple-400", tierBg: "bg-purple-400/10 border-purple-400/20" };
  }
  if (hasCompliance) {
    return { tier: "SSS-2", tierColor: "text-blue-400", tierBg: "bg-blue-400/10 border-blue-400/20" };
  }
  return { tier: "SSS-1", tierColor: "text-brand-400", tierBg: "bg-brand-400/10 border-brand-400/20" };
}

export default function MintAddressBar({ mintAddress, onMintAddressChange }: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [stablecoins, setStablecoins] = useState<StablecoinEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStablecoins = useCallback(async () => {
    if (!wallet.publicKey) {
      setStablecoins([]);
      return;
    }
    try {
      setLoading(true);
      const provider = new AnchorProvider(
        connection,
        wallet as any,
        { commitment: "confirmed" }
      );
      const program = new Program(idl as any, provider);
      const accounts = await (program.account as any).stablecoinConfig.all([
        { memcmp: { offset: 8, bytes: wallet.publicKey.toBase58() } },
      ]);

      const entries: StablecoinEntry[] = accounts.map((a: any) => {
        const { tier, tierColor, tierBg } = detectTier(a.account);
        return { mint: a.account.mint.toBase58(), tier, tierColor, tierBg };
      });
      setStablecoins(entries);
    } catch (err: any) {
      console.error("Failed to fetch stablecoins:", err);
    } finally {
      setLoading(false);
    }
  }, [connection, wallet.publicKey]);

  useEffect(() => {
    fetchStablecoins();
  }, [fetchStablecoins]);

  const selected = stablecoins.find(sc => sc.mint === mintAddress);

  return (
    <div className="px-4 md:px-6 py-3 bg-surface-0/60 border-b border-border/30 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <Hexagon size={14} className="text-slate-500" />
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Mint
          </label>
        </div>
        <div className="relative flex-1">
          <input
            type="text"
            value={mintAddress}
            onChange={(e) => onMintAddressChange(e.target.value.trim())}
            placeholder="Paste mint address or select from your tokens..."
            className="w-full glass-input font-mono text-[13px] pr-20"
          />
          {mintAddress && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                onClick={() => navigator.clipboard.writeText(mintAddress)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-brand-400/10 transition-colors"
                title="Copy"
              >
                <Copy size={13} />
              </button>
              <button
                onClick={() => onMintAddressChange("")}
                className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                title="Clear"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
        {selected && (
          <span className={`badge ${selected.tierBg} border shrink-0`}>
            <span className={selected.tierColor}>{selected.tier}</span>
          </span>
        )}
      </div>

      {wallet.publicKey && stablecoins.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest shrink-0">
            My Tokens
          </span>
          {stablecoins.map((sc) => (
            <button
              key={sc.mint}
              onClick={() => onMintAddressChange(sc.mint)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-all duration-200 border ${
                sc.mint === mintAddress
                  ? `${sc.tierBg} ${sc.tierColor}`
                  : "bg-surface-2 border-border/50 text-slate-400 hover:border-border-light hover:text-slate-300"
              }`}
            >
              <span className={`${sc.tierColor} font-sans font-semibold`}>{sc.tier}</span>
              {shortenAddress(sc.mint, 4)}
            </button>
          ))}
          <button
            onClick={fetchStablecoins}
            disabled={loading}
            className="p-1 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-brand-400/10 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      )}

      {wallet.publicKey && stablecoins.length === 0 && !loading && (
        <p className="mt-2 text-[11px] text-slate-600">
          No stablecoins found for this wallet. Create one via Initialize.
        </p>
      )}
    </div>
  );
}
