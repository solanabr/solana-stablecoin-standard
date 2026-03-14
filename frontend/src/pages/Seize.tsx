import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { AlertTriangle, Ban, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useStablecoin } from "../hooks/useStablecoin";
import { getRoleAddress, getBlacklistAddress, ROLE_SEIZER } from "../utils/pda";
import { parseError } from "../utils/errors";

interface Props { mintAddress: string }

export default function Seize({ mintAddress }: Props) {
  const wallet = useWallet();
  const { state, configPDA, program, decimals, refetch } = useStablecoin(mintAddress);
  const [sourceAddr, setSourceAddr] = useState("");
  const [treasuryAddr, setTreasuryAddr] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  if (!mintAddress || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <AlertTriangle className="w-12 h-12 text-slate-600 mb-4" />
        <h3 className="text-lg font-semibold text-slate-400 mb-2">No Mint Selected</h3>
        <p className="text-sm text-slate-500">Select a mint address to continue.</p>
      </div>
    );
  }

  if (!state.complianceEnabled) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="page-title">Seize Tokens</h1>
        <div className="glass-card flex items-start gap-3 bg-amber-500/5 border-amber-500/20">
          <Ban className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-amber-400 mb-1">Compliance Not Enabled</h3>
            <p className="text-sm text-amber-400/80">
              Seize is only available for SSS-2 and SSS-3 tokens with compliance enabled.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  const handleSeize = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy(true);
      const mint = new PublicKey(mintAddress);
      const source = new PublicKey(sourceAddr);
      const treasury = new PublicKey(treasuryAddr);
      const [seizerRole] = getRoleAddress(configPDA, ROLE_SEIZER, wallet.publicKey);
      const [blacklistEntry] = getBlacklistAddress(configPDA, source);
      const sourceATA = getAssociatedTokenAddressSync(mint, source, false, TOKEN_2022_PROGRAM_ID);
      const treasuryATA = getAssociatedTokenAddressSync(mint, treasury, false, TOKEN_2022_PROGRAM_ID);

      await (program.methods as any)
        .seize(new BN(Math.round(Number(amount) * 10 ** decimals)))
        .accounts({
          seizer: wallet.publicKey,
          config: configPDA,
          seizerRole,
          blacklistEntry,
          targetOwner: source,
          mint,
          sourceTokenAccount: sourceATA,
          treasuryTokenAccount: treasuryATA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      toast.success("Tokens seized successfully");
      setSourceAddr(""); setAmount("");
      refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="page-title">Seize Tokens</h1>

      {/* Warning Banner */}
      <div className="glass-card flex items-start gap-3 bg-amber-500/5 border-amber-500/20 mb-6">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-amber-400 mb-1">Irreversible Action</h3>
          <p className="text-sm text-amber-400/80">
            Seize is irreversible. It thaws the target account, burns their tokens, refreezes the account, and mints equivalent tokens to the treasury.
          </p>
        </div>
      </div>

      <div className="glass-card space-y-6">
        {/* Source Address */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Source Address (blacklisted account)
          </label>
          <input
            value={sourceAddr}
            onChange={(e) => setSourceAddr(e.target.value.trim())}
            placeholder="Blacklisted wallet address"
            className="glass-input font-mono"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Amount
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="glass-input font-mono"
          />
        </div>

        {/* Treasury Address */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Treasury / Destination Address
          </label>
          <div className="flex gap-2">
            <input
              value={treasuryAddr}
              onChange={(e) => setTreasuryAddr(e.target.value.trim())}
              placeholder="Treasury wallet address"
              className="glass-input font-mono flex-1"
            />
            <button
              onClick={() => wallet.publicKey && setTreasuryAddr(wallet.publicKey.toBase58())}
              className="btn-secondary whitespace-nowrap flex items-center gap-2"
            >
              <Wallet className="w-4 h-4" />
              My Wallet
            </button>
          </div>
        </div>

        {/* Seize Button */}
        <button
          onClick={handleSeize}
          disabled={busy || !wallet.publicKey || !sourceAddr || !amount || !treasuryAddr}
          className="btn-danger w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Seizing..." : "Seize Tokens"}
        </button>

        <p className="text-xs text-slate-500 text-center">
          Requires Seizer role. Target must be blacklisted.
        </p>
      </div>
    </motion.div>
  );
}
