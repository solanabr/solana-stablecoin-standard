import { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getTokenMetadata } from "@solana/spl-token";
import { FileText, Image as ImageIcon, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useStablecoin } from "../hooks/useStablecoin";
import { parseError } from "../utils/errors";

interface Props { mintAddress: string }

export default function Metadata({ mintAddress }: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { state, configPDA, program, refetch } = useStablecoin(mintAddress);
  const [meta, setMeta] = useState<{ name: string; symbol: string; uri: string } | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const [newUri, setNewUri] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mintAddress) fetchMetadata();
  }, [mintAddress]);

  const fetchMetadata = async () => {
    try {
      const metadata = await getTokenMetadata(connection, new PublicKey(mintAddress), "confirmed", TOKEN_2022_PROGRAM_ID);
      if (metadata) {
        setMeta({ name: metadata.name, symbol: metadata.symbol, uri: metadata.uri });
        if (metadata.uri) tryLoadImage(metadata.uri);
      }
    } catch { setMeta(null); }
  };

  const tryLoadImage = async (uri: string) => {
    if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(uri)) {
      setImageUrl(uri);
      return;
    }
    try {
      const res = await fetch(uri);
      const json = await res.json();
      if (json.image) setImageUrl(json.image);
    } catch { setImageUrl(""); }
  };

  const handleUpdate = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy(true);
      const input = {
        name: newName || null,
        symbol: newSymbol || null,
        uri: newUri || null,
      };

      await (program.methods as any)
        .setMetadata(input)
        .accounts({
          authority: wallet.publicKey,
          config: configPDA,
          mint: new PublicKey(mintAddress),
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      toast.success("Metadata updated");
      setNewName(""); setNewSymbol(""); setNewUri("");
      fetchMetadata(); refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(false); }
  };

  if (!mintAddress || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <FileText className="w-12 h-12 text-slate-600 mb-4" />
        <h3 className="text-lg font-medium text-slate-400 mb-2">No Mint Selected</h3>
        <p className="text-sm text-slate-500">Select a mint address to manage metadata.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Token Metadata</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="section-title">
            <FileText className="w-5 h-5" />
            Current Metadata
          </h2>
          {meta ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Name</label>
                <p className="text-sm text-slate-200">{meta.name}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Symbol</label>
                <p className="text-sm text-slate-200 font-mono">{meta.symbol}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">URI</label>
                {meta.uri ? (
                  <a
                    href={meta.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-400 hover:text-brand-300 underline break-all"
                  >
                    {meta.uri}
                  </a>
                ) : (
                  <p className="text-sm text-slate-500">Not set</p>
                )}
              </div>
              {imageUrl && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    <ImageIcon className="w-3.5 h-3.5 inline mr-1" />
                    Preview
                  </label>
                  <img
                    src={imageUrl}
                    alt="Token"
                    className="w-32 h-32 rounded-lg object-cover border border-border"
                    onError={() => setImageUrl("")}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <FileText className="w-10 h-10 text-slate-600 mb-3" />
              <p className="text-sm text-slate-500">No metadata found</p>
            </div>
          )}
          <button
            onClick={fetchMetadata}
            className="mt-4 text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </motion.div>

        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="section-title">
            <FileText className="w-5 h-5" />
            Update Metadata
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                New Name (leave empty to keep current)
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={meta?.name || "Token name"}
                className="glass-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                New Symbol
              </label>
              <input
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                placeholder={meta?.symbol || "SYMBOL"}
                className="glass-input w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                New URI
              </label>
              <input
                value={newUri}
                onChange={(e) => setNewUri(e.target.value)}
                placeholder={meta?.uri || "https://..."}
                className="glass-input w-full font-mono"
              />
            </div>
            <button
              onClick={handleUpdate}
              disabled={busy || !wallet.publicKey || (!newName && !newSymbol && !newUri)}
              className="btn-primary w-full"
            >
              {busy ? "Updating..." : "Update Metadata"}
            </button>
            <p className="text-xs text-slate-500">Authority only</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
