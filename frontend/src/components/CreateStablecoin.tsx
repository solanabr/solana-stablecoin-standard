"use client";
import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import { findConfigPda } from "../lib/pda";

const SSS_PROGRAM_ID_STR = "AeCfxEUv75EWAGgjnhAZhViFbkfsP1imLsg4xb3xuntm";
const HOOK_PROGRAM_ID_STR = "9bFjVjyZ3vVmNBFaVVKmjVrzcwwzRNuwWqYpqeM2pzF7";

interface CreateStablecoinProps {
  onCreated: (mint: string) => void;
}

export function CreateStablecoin({ onCreated }: CreateStablecoinProps) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [form, setForm] = useState({
    name: "",
    symbol: "",
    uri: "",
    decimals: "6",
    preset: "sss1" as "sss1" | "sss2",
  });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleCreate = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    setLoading(true);
    setStatus("Preparing transaction…");

    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const SSS_IDL = await fetch("/idl/sss_token.json").then((r) => r.json());
      const { PublicKey } = await import("@solana/web3.js");
      const sssProgramId = new PublicKey(SSS_PROGRAM_ID_STR);
      const program = new Program({ ...SSS_IDL, address: SSS_PROGRAM_ID_STR }, provider);

      const mintKp = Keypair.generate();
      const [configPda] = findConfigPda(mintKp.publicKey, sssProgramId);
      const isSss2 = form.preset === "sss2";
      const hookProgramId = isSss2 ? new PublicKey(HOOK_PROGRAM_ID_STR) : null;

      setStatus("Sending initialize transaction…");

      const tx = await program.methods
        .initialize({
          name: form.name,
          symbol: form.symbol,
          uri: form.uri || `https://sss.superteam.fun/token/${mintKp.publicKey.toBase58()}.json`,
          decimals: parseInt(form.decimals),
          enablePermanentDelegate: isSss2,
          enableTransferHook: isSss2,
          defaultAccountFrozen: false,
          transferHookProgramId: hookProgramId,
          burner: null,
          pauser: null,
          blacklister: isSss2 ? wallet.publicKey : null,
          seizer: isSss2 ? wallet.publicKey : null,
        })
        .accounts({
          authority: wallet.publicKey,
          mint: mintKp.publicKey,
          config: configPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKp])
        .rpc({ commitment: "confirmed" });

      setStatus(`✅ Created! Mint: ${mintKp.publicKey.toBase58()}`);
      onCreated(mintKp.publicKey.toBase58());
    } catch (e) {
      setStatus(`❌ Error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px", background: "#1a1f2e",
    border: "1px solid #2d3748", borderRadius: 8, color: "#e2e8f0",
    fontSize: 14, outline: "none",
  };

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Create Stablecoin</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>Preset</span>
          <select style={inputStyle} value={form.preset} onChange={set("preset")}>
            <option value="sss1">SSS-1 — Minimal (metadata + freeze)</option>
            <option value="sss2">SSS-2 — Compliant (+ blacklist + seize + hook)</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>Name</span>
          <input style={inputStyle} placeholder="My Stablecoin" value={form.name} onChange={set("name")} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>Symbol</span>
          <input style={inputStyle} placeholder="MYUSD" value={form.symbol} onChange={set("symbol")} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>Decimals</span>
          <input style={inputStyle} type="number" min={0} max={9} value={form.decimals} onChange={set("decimals")} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>Metadata URI (optional)</span>
          <input style={inputStyle} placeholder="https://…/metadata.json" value={form.uri} onChange={set("uri")} />
        </label>

        <button
          onClick={handleCreate}
          disabled={loading || !form.name || !form.symbol}
          style={{
            padding: "12px 24px", background: loading ? "#5b4a9a" : "#9945ff",
            color: "#fff", border: "none", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
            fontSize: 15, fontWeight: 600, marginTop: 8,
          }}
        >
          {loading ? "Creating…" : "Create Stablecoin"}
        </button>

        {status && (
          <div style={{
            padding: "12px 16px", background: "#1a1f2e", borderRadius: 8,
            fontSize: 13, color: status.startsWith("❌") ? "#f87171" : "#4ade80",
            wordBreak: "break-all",
          }}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
