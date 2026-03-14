import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import toast from "react-hot-toast";
import { useStablecoin } from "../hooks/useStablecoin";
import { getRoleAddress, getQuotaAddress, ROLE_MINTER } from "../utils/pda";
import { parseError } from "../utils/errors";
import { TrendingUp, Flame, Activity, Wallet } from "lucide-react";

interface Props { mintAddress: string }

export default function MintBurn({ mintAddress }: Props) {
  const wallet = useWallet();
  const { state, configPDA, program, currentSupply, decimals, refetch } = useStablecoin(mintAddress);
  const [tab, setTab] = useState<"mint" | "burn">("mint");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  if (!mintAddress || !state) {
    return <div className="flex items-center justify-center h-[40vh] text-slate-500 text-sm">Select a mint address to manage supply.</div>;
  }

  const divisor = 10 ** decimals;
  const supply = Number(currentSupply) / divisor;

  const handleMint = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy(true);
      const mint = new PublicKey(mintAddress);
      const dest = new PublicKey(recipient);
      const [minterRole] = getRoleAddress(configPDA, ROLE_MINTER, wallet.publicKey);
      const [minterQuota] = getQuotaAddress(configPDA, wallet.publicKey);
      const recipientATA = getAssociatedTokenAddressSync(mint, dest, false, TOKEN_2022_PROGRAM_ID);
      await (program.methods as any)
        .mintTokens(new BN(Math.round(Number(amount) * divisor)))
        .accounts({ minter: wallet.publicKey, config: configPDA, minterRole, minterQuota, mint, recipientTokenAccount: recipientATA, tokenProgram: TOKEN_2022_PROGRAM_ID })
        .rpc();
      toast.success(`Minted ${amount} tokens`);
      setAmount("");
      refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(false); }
  };

  const handleBurn = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy(true);
      const mint = new PublicKey(mintAddress);
      const burnerATA = getAssociatedTokenAddressSync(mint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
      await (program.methods as any)
        .burnTokens(new BN(Math.round(Number(amount) * divisor)))
        .accounts({ burner: wallet.publicKey, config: configPDA, mint, burnerTokenAccount: burnerATA, tokenProgram: TOKEN_2022_PROGRAM_ID })
        .rpc();
      toast.success(`Burned ${amount} tokens`);
      setAmount("");
      refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <h1 className="page-title mb-2">Mint / Burn</h1>
      <div className="flex items-center gap-2 mb-8">
        <Activity size={14} className="text-cyan-400" />
        <span className="text-sm text-slate-500">Current supply: <span className="text-cyan-400 font-mono font-semibold">{supply.toLocaleString()}</span></span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("mint")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
            tab === "mint" ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 shadow-[0_0_15px_rgba(52,211,153,0.1)]" : "bg-surface-2 text-slate-400 border border-border hover:text-slate-300 hover:border-border-light"
          }`}
        >
          <TrendingUp size={15} />
          Mint
        </button>
        <button
          onClick={() => setTab("burn")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
            tab === "burn" ? "bg-orange-400/10 text-orange-400 border border-orange-400/20 shadow-[0_0_15px_rgba(251,146,60,0.1)]" : "bg-surface-2 text-slate-400 border border-border hover:text-slate-300 hover:border-border-light"
          }`}
        >
          <Flame size={15} />
          Burn
        </button>
      </div>

      <div className="glass-card p-6 space-y-5 max-w-xl">
        {tab === "mint" && (
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Recipient Address</label>
            <div className="flex gap-2">
              <input value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} placeholder="Wallet address" className="flex-1 glass-input font-mono text-[13px]" />
              <button onClick={() => wallet.publicKey && setRecipient(wallet.publicKey.toBase58())} className="btn-secondary !py-2 flex items-center gap-1.5 text-xs">
                <Wallet size={13} />
                Me
              </button>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Amount</label>
          <input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full glass-input text-lg font-mono" />
        </div>
        <button
          onClick={tab === "mint" ? handleMint : handleBurn}
          disabled={busy || !wallet.publicKey || !amount}
          className={tab === "mint" ? "btn-primary w-full" : "btn-danger w-full"}
        >
          {busy ? "Processing..." : tab === "mint" ? "Mint Tokens" : "Burn Tokens"}
        </button>
        <p className="text-[11px] text-slate-600">{tab === "mint" ? "Requires Minter role and available quota" : "Burns from your wallet's token account"}</p>
      </div>
    </div>
  );
}
