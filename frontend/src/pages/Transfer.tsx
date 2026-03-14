import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedWithTransferHookInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import toast from "react-hot-toast";
import { useStablecoin } from "../hooks/useStablecoin";
import { parseError } from "../utils/errors";
import { Send, AlertCircle, Info } from "lucide-react";
import { motion } from "framer-motion";

interface Props { mintAddress: string }

export default function Transfer({ mintAddress }: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { state, loading, decimals, refetch } = useStablecoin(mintAddress);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  if (!mintAddress || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="w-12 h-12 text-slate-600 mb-4" />
        <h3 className="section-title mb-2">No Mint Selected</h3>
        <p className="text-slate-500 text-sm">Select a mint address to transfer tokens.</p>
      </div>
    );
  }

  const handleTransfer = async () => {
    if (!wallet.publicKey || !wallet.sendTransaction) return;
    try {
      setBusy(true);
      const mint = new PublicKey(mintAddress);
      const dest = new PublicKey(recipient);
      const senderATA = getAssociatedTokenAddressSync(mint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const recipientATA = getAssociatedTokenAddressSync(mint, dest, false, TOKEN_2022_PROGRAM_ID);
      const rawAmount = BigInt(Math.round(Number(amount) * 10 ** decimals));

      const tx = new Transaction();

      // Create recipient ATA if it doesn't exist
      const recipientInfo = await connection.getAccountInfo(recipientATA);
      if (!recipientInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey, recipientATA, dest, mint, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      if (state.complianceEnabled) {
        // SSS-2/3: use transfer hook instruction that resolves extra accounts
        const transferIx = await createTransferCheckedWithTransferHookInstruction(
          connection, senderATA, mint, recipientATA, wallet.publicKey, rawAmount, decimals, [], "confirmed", TOKEN_2022_PROGRAM_ID
        );
        tx.add(transferIx);
      } else {
        // SSS-1: standard transferChecked (import inline to keep simple)
        const { createTransferCheckedInstruction } = await import("@solana/spl-token");
        tx.add(
          createTransferCheckedInstruction(senderATA, mint, recipientATA, wallet.publicKey, rawAmount, decimals, [], TOKEN_2022_PROGRAM_ID)
        );
      }

      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      toast.success(`Transfer complete! Tx: ${sig.slice(0, 16)}...`);
      setAmount("");
      setRecipient("");
      refetch();
    } catch (err: any) {
      toast.error(parseError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Transfer Tokens</h1>

      {state.complianceEnabled && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="glass-card border-brand-400/20 bg-brand-400/5 mb-6"
        >
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-brand-400/90">
                Compliance is enabled — transfers go through the transfer hook which enforces blacklist{state.enableAllowlist ? " and allowlist" : ""} checks.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="glass-card space-y-6"
      >
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Recipient Address
          </label>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.trim())}
            placeholder="Recipient wallet address"
            className="glass-input font-mono"
          />
        </div>

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

        <button
          onClick={handleTransfer}
          disabled={busy || !wallet.publicKey || !amount || !recipient}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" />
          {busy ? "Sending..." : "Transfer"}
        </button>

        <div className="flex items-start gap-2 pt-2">
          <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500">
            Recipient's token account will be created automatically if it doesn't exist.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
