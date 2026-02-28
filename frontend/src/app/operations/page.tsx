"use client";

import { useState, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { Navbar } from "@/components/navbar";
import { MintSelector } from "@/components/mint-selector";
import { TxFeedback } from "@/components/tx-feedback";
import { useCoreProgram } from "@/hooks/use-program";
import { useTransaction } from "@/hooks/use-transaction";
import { deriveConfigPda, deriveRolePda } from "@/lib/pda";
import { isValidPubkey } from "@/lib/validation";

const ROLE_MINTER = 1;
const ROLE_FREEZER = 2;
const ROLE_PAUSER = 3;
const ROLE_BURNER = 4;

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

function FormInput({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "primary",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "destructive" | "warning";
  disabled?: boolean;
}) {
  const styles = {
    primary: "bg-accent hover:bg-accent/80 text-white",
    destructive: "bg-destructive hover:bg-destructive/80 text-white",
    warning: "bg-warning hover:bg-warning/80 text-black",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${styles[variant]} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

export default function OperationsPage() {
  const { publicKey } = useWallet();
  const program = useCoreProgram();
  const { loading, error, signature, execute, reset } = useTransaction();

  const [activeMint, setActiveMint] = useState<string | null>(null);
  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [burnFrom, setBurnFrom] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [freezeAccount, setFreezeAccount] = useState("");
  const [thawAccount, setThawAccount] = useState("");

  const canOperate = !!publicKey && !!program && !!activeMint;

  const handleMint = useCallback(async () => {
    if (!canOperate) return;
    if (!mintTo || !isValidPubkey(mintTo)) return;
    if (!mintAmount || mintAmount === "0") return;
    reset();

    const mintPubkey = new PublicKey(activeMint!);
    const [configPda] = deriveConfigPda(mintPubkey);
    const [rolePda] = deriveRolePda(configPda, publicKey!, ROLE_MINTER);
    const toPubkey = new PublicKey(mintTo);

    const tx = await program!.methods
      .mintTokens(new BN(mintAmount))
      .accountsPartial({
        minter: publicKey!,
        config: configPda,
        minterRole: rolePda,
        mint: mintPubkey,
        to: toPubkey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .transaction();

    await execute(tx);
  }, [canOperate, mintTo, mintAmount, activeMint, publicKey, program, execute, reset]);

  const handleBurn = useCallback(async () => {
    if (!canOperate) return;
    if (!burnFrom || !isValidPubkey(burnFrom)) return;
    if (!burnAmount || burnAmount === "0") return;
    reset();

    const mintPubkey = new PublicKey(activeMint!);
    const [configPda] = deriveConfigPda(mintPubkey);
    const [rolePda] = deriveRolePda(configPda, publicKey!, ROLE_BURNER);
    const fromPubkey = new PublicKey(burnFrom);

    const tx = await program!.methods
      .burnTokens(new BN(burnAmount))
      .accountsPartial({
        burner: publicKey!,
        config: configPda,
        burnerRole: rolePda,
        mint: mintPubkey,
        from: fromPubkey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .transaction();

    await execute(tx);
  }, [canOperate, burnFrom, burnAmount, activeMint, publicKey, program, execute, reset]);

  const handleFreeze = useCallback(async () => {
    if (!canOperate) return;
    if (!freezeAccount || !isValidPubkey(freezeAccount)) return;
    reset();

    const mintPubkey = new PublicKey(activeMint!);
    const [configPda] = deriveConfigPda(mintPubkey);
    const [rolePda] = deriveRolePda(configPda, publicKey!, ROLE_FREEZER);
    const accountPubkey = new PublicKey(freezeAccount);

    const tx = await program!.methods
      .freezeAccount()
      .accountsPartial({
        freezer: publicKey!,
        config: configPda,
        freezerRole: rolePda,
        mint: mintPubkey,
        tokenAccount: accountPubkey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .transaction();

    await execute(tx);
  }, [canOperate, freezeAccount, activeMint, publicKey, program, execute, reset]);

  const handleThaw = useCallback(async () => {
    if (!canOperate) return;
    if (!thawAccount || !isValidPubkey(thawAccount)) return;
    reset();

    const mintPubkey = new PublicKey(activeMint!);
    const [configPda] = deriveConfigPda(mintPubkey);
    const [rolePda] = deriveRolePda(configPda, publicKey!, ROLE_FREEZER);
    const accountPubkey = new PublicKey(thawAccount);

    const tx = await program!.methods
      .thawAccount()
      .accountsPartial({
        freezer: publicKey!,
        config: configPda,
        freezerRole: rolePda,
        mint: mintPubkey,
        tokenAccount: accountPubkey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .transaction();

    await execute(tx);
  }, [canOperate, thawAccount, activeMint, publicKey, program, execute, reset]);

  const handlePause = useCallback(async () => {
    if (!canOperate) return;
    reset();

    const mintPubkey = new PublicKey(activeMint!);
    const [configPda] = deriveConfigPda(mintPubkey);
    const [rolePda] = deriveRolePda(configPda, publicKey!, ROLE_PAUSER);

    const tx = await program!.methods
      .pause()
      .accountsPartial({
        pauser: publicKey!,
        config: configPda,
        pauserRole: rolePda,
      })
      .transaction();

    await execute(tx);
  }, [canOperate, activeMint, publicKey, program, execute, reset]);

  const handleUnpause = useCallback(async () => {
    if (!canOperate) return;
    reset();

    const mintPubkey = new PublicKey(activeMint!);
    const [configPda] = deriveConfigPda(mintPubkey);
    const [rolePda] = deriveRolePda(configPda, publicKey!, ROLE_PAUSER);

    const tx = await program!.methods
      .unpause()
      .accountsPartial({
        pauser: publicKey!,
        config: configPda,
        pauserRole: rolePda,
      })
      .transaction();

    await execute(tx);
  }, [canOperate, activeMint, publicKey, program, execute, reset]);

  return (
    <div>
      <Navbar title="Token Operations" />
      <div className="p-6 space-y-6">
        <MintSelector onSelect={setActiveMint} currentMint={activeMint} />

        {!activeMint && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Select a mint address above to perform token operations.
            </p>
          </div>
        )}

        {!publicKey && (
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-5 text-center">
            <p className="text-sm text-warning">
              Connect your wallet to execute transactions.
            </p>
          </div>
        )}

        <TxFeedback loading={loading} error={error} signature={signature} />

        {/* Mint */}
        <SectionCard
          title="Mint Tokens"
          description="Issue new tokens to a recipient token account. Requires minter role."
        >
          <div className="space-y-3">
            <FormInput
              label="Recipient Token Account"
              placeholder="Enter recipient's associated token account..."
              value={mintTo}
              onChange={setMintTo}
            />
            <FormInput
              label="Amount (raw units)"
              placeholder="e.g. 1000000"
              value={mintAmount}
              onChange={setMintAmount}
              type="number"
            />
            <ActionButton onClick={handleMint} disabled={!canOperate}>
              Mint Tokens
            </ActionButton>
          </div>
        </SectionCard>

        {/* Burn */}
        <SectionCard
          title="Burn Tokens"
          description="Burn tokens from a token account. Reduces circulating supply. Requires minter role."
        >
          <div className="space-y-3">
            <FormInput
              label="Token Account"
              placeholder="Enter token account address..."
              value={burnFrom}
              onChange={setBurnFrom}
            />
            <FormInput
              label="Amount (raw units)"
              placeholder="e.g. 500000"
              value={burnAmount}
              onChange={setBurnAmount}
              type="number"
            />
            <ActionButton onClick={handleBurn} variant="destructive" disabled={!canOperate}>
              Burn Tokens
            </ActionButton>
          </div>
        </SectionCard>

        {/* Freeze / Thaw */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard
            title="Freeze Account"
            description="Freeze a token account to prevent all transfers. Requires freezer role."
          >
            <div className="space-y-3">
              <FormInput
                label="Account to Freeze"
                placeholder="Enter token account address..."
                value={freezeAccount}
                onChange={setFreezeAccount}
              />
              <ActionButton onClick={handleFreeze} variant="warning" disabled={!canOperate}>
                Freeze Account
              </ActionButton>
            </div>
          </SectionCard>

          <SectionCard
            title="Thaw Account"
            description="Unfreeze a previously frozen token account to restore transfers."
          >
            <div className="space-y-3">
              <FormInput
                label="Account to Thaw"
                placeholder="Enter token account address..."
                value={thawAccount}
                onChange={setThawAccount}
              />
              <ActionButton onClick={handleThaw} disabled={!canOperate}>
                Thaw Account
              </ActionButton>
            </div>
          </SectionCard>
        </div>

        {/* Pause / Unpause */}
        <SectionCard
          title="Emergency Controls"
          description="Pause or resume all stablecoin operations. Requires pauser role."
        >
          <div className="flex items-center gap-3">
            <ActionButton onClick={handlePause} variant="destructive" disabled={!canOperate}>
              Pause All Operations
            </ActionButton>
            <ActionButton onClick={handleUnpause} disabled={!canOperate}>
              Resume Operations
            </ActionButton>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Pausing halts all mint, burn, and transfer operations for this stablecoin.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
