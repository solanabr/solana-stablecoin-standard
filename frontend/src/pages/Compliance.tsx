import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { useStablecoin } from '../contexts/StablecoinContext';
import { useToast } from '../contexts/ToastContext';
import {
  getIDL,
  findStatePDA,
  findFreezeAuthorityPDA,
  findBlacklistEntryPDA,
  findPermanentDelegatePDA,
  shortenAddress,
} from '../lib/program';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Badge from '../components/Badge';
import {
  Shield,
  ShieldOff,
  Snowflake,
  Sun,
  Ban,
  CheckCircle,
  Search,
  AlertTriangle,
  Grab,
} from 'lucide-react';

const Compliance: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { currentMint, stablecoinInfo } = useStablecoin();
  const { addToast } = useToast();

  // Freeze/Thaw
  const [freezeAddr, setFreezeAddr] = useState('');
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [thawLoading, setThawLoading] = useState(false);

  // Blacklist
  const [blacklistAddr, setBlacklistAddr] = useState('');
  const [blacklistReason, setBlacklistReason] = useState('');
  const [blAddLoading, setBlAddLoading] = useState(false);
  const [blRemoveLoading, setBlRemoveLoading] = useState(false);

  // Check blacklist
  const [checkAddr, setCheckAddr] = useState('');
  const [checkResult, setCheckResult] = useState<boolean | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);

  // Seize
  const [seizeAddr, setSeizeAddr] = useState('');
  const [seizeTreasury, setSeizeTreasury] = useState('');
  const [seizeLoading, setSeizeLoading] = useState(false);

  const getProgram = () => {
    const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
    return new Program(getIDL(), provider);
  };

  const handleFreeze = async () => {
    if (!currentMint || !freezeAddr.trim()) return;
    setFreezeLoading(true);
    try {
      const program = getProgram();
      const mint = new PublicKey(currentMint);
      const [statePDA] = findStatePDA(mint);
      const [freezeAuthority] = findFreezeAuthorityPDA(statePDA);
      const target = new PublicKey(freezeAddr.trim());
      const ata = getAssociatedTokenAddressSync(mint, target, false, TOKEN_2022_PROGRAM_ID);

      const sig = await program.methods
        .freezeAccount()
        .accounts({
          authority: wallet.publicKey!,
          state: statePDA,
          mint,
          tokenAccount: ata,
          freezeAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      addToast({ type: 'success', title: `Frozen: ${shortenAddress(freezeAddr.trim())}`, txSig: sig });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Freeze failed', message: err.message });
    } finally {
      setFreezeLoading(false);
    }
  };

  const handleThaw = async () => {
    if (!currentMint || !freezeAddr.trim()) return;
    setThawLoading(true);
    try {
      const program = getProgram();
      const mint = new PublicKey(currentMint);
      const [statePDA] = findStatePDA(mint);
      const [freezeAuthority] = findFreezeAuthorityPDA(statePDA);
      const target = new PublicKey(freezeAddr.trim());
      const ata = getAssociatedTokenAddressSync(mint, target, false, TOKEN_2022_PROGRAM_ID);

      const sig = await program.methods
        .thawAccount()
        .accounts({
          authority: wallet.publicKey!,
          state: statePDA,
          mint,
          tokenAccount: ata,
          freezeAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      addToast({ type: 'success', title: `Thawed: ${shortenAddress(freezeAddr.trim())}`, txSig: sig });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Thaw failed', message: err.message });
    } finally {
      setThawLoading(false);
    }
  };

  const handleBlacklistAdd = async () => {
    if (!currentMint || !blacklistAddr.trim()) return;
    setBlAddLoading(true);
    try {
      const program = getProgram();
      const mint = new PublicKey(currentMint);
      const [statePDA] = findStatePDA(mint);
      const target = new PublicKey(blacklistAddr.trim());
      const [blacklistEntry] = findBlacklistEntryPDA(statePDA, target);

      const sig = await program.methods
        .addToBlacklist(blacklistReason || 'Compliance action')
        .accounts({
          authority: wallet.publicKey!,
          state: statePDA,
          target,
          blacklistEntry,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      addToast({ type: 'success', title: `Blacklisted: ${shortenAddress(blacklistAddr.trim())}`, txSig: sig });
      setBlacklistAddr('');
      setBlacklistReason('');
    } catch (err: any) {
      addToast({ type: 'error', title: 'Blacklist add failed', message: err.message });
    } finally {
      setBlAddLoading(false);
    }
  };

  const handleBlacklistRemove = async () => {
    if (!currentMint || !blacklistAddr.trim()) return;
    setBlRemoveLoading(true);
    try {
      const program = getProgram();
      const mint = new PublicKey(currentMint);
      const [statePDA] = findStatePDA(mint);
      const target = new PublicKey(blacklistAddr.trim());
      const [blacklistEntry] = findBlacklistEntryPDA(statePDA, target);

      const sig = await program.methods
        .removeFromBlacklist(blacklistReason || 'Compliance review')
        .accounts({
          authority: wallet.publicKey!,
          state: statePDA,
          target,
          blacklistEntry,
        })
        .rpc();

      addToast({ type: 'success', title: `Removed from blacklist`, txSig: sig });
      setBlacklistAddr('');
      setBlacklistReason('');
    } catch (err: any) {
      addToast({ type: 'error', title: 'Blacklist remove failed', message: err.message });
    } finally {
      setBlRemoveLoading(false);
    }
  };

  const handleCheckBlacklist = async () => {
    if (!currentMint || !checkAddr.trim()) return;
    setCheckLoading(true);
    try {
      const mint = new PublicKey(currentMint);
      const [statePDA] = findStatePDA(mint);
      const target = new PublicKey(checkAddr.trim());
      const [blacklistEntry] = findBlacklistEntryPDA(statePDA, target);

      const info = await connection.getAccountInfo(blacklistEntry);
      setCheckResult(info !== null && info.lamports > 0);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Check failed', message: err.message });
    } finally {
      setCheckLoading(false);
    }
  };

  const handleSeize = async () => {
    if (!currentMint || !seizeAddr.trim() || !seizeTreasury.trim()) return;
    setSeizeLoading(true);
    try {
      const program = getProgram();
      const mint = new PublicKey(currentMint);
      const [statePDA] = findStatePDA(mint);
      const [permanentDelegate] = findPermanentDelegatePDA(statePDA);
      const target = new PublicKey(seizeAddr.trim());
      const treasury = new PublicKey(seizeTreasury.trim());
      const [blacklistEntry] = findBlacklistEntryPDA(statePDA, target);

      const fromAta = getAssociatedTokenAddressSync(mint, target, false, TOKEN_2022_PROGRAM_ID);
      const toAta = getAssociatedTokenAddressSync(mint, treasury, false, TOKEN_2022_PROGRAM_ID);

      const sig = await program.methods
        .seize()
        .accounts({
          authority: wallet.publicKey!,
          state: statePDA,
          mint,
          targetWallet: target,
          blacklistEntry,
          fromTokenAccount: fromAta,
          treasuryTokenAccount: toAta,
          permanentDelegate,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      addToast({ type: 'success', title: `Seized funds from ${shortenAddress(seizeAddr.trim())}`, txSig: sig });
      setSeizeAddr('');
    } catch (err: any) {
      addToast({ type: 'error', title: 'Seize failed', message: err.message });
    } finally {
      setSeizeLoading(false);
    }
  };

  if (!currentMint) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
        Load a stablecoin from the Dashboard first.
      </div>
    );
  }

  const isSS2 = stablecoinInfo?.enablePermanentDelegate && stablecoinInfo?.enableTransferHook;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 800 }}>
      {/* Freeze / Thaw */}
      <Card
        title="Freeze & Thaw Accounts"
        subtitle="Freeze or thaw individual token accounts"
        icon={<Snowflake size={16} color="var(--cyan)" />}
        accent="var(--cyan)"
      >
        <div style={{ display: 'flex', gap: 10 }}>
          <Input
            placeholder="Wallet address to freeze/thaw"
            value={freezeAddr}
            onChange={(e) => setFreezeAddr(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button
            onClick={handleFreeze}
            loading={freezeLoading}
            disabled={!freezeAddr.trim()}
            icon={<Snowflake size={14} />}
            size="sm"
          >
            Freeze
          </Button>
          <Button
            variant="success"
            onClick={handleThaw}
            loading={thawLoading}
            disabled={!freezeAddr.trim()}
            icon={<Sun size={14} />}
            size="sm"
          >
            Thaw
          </Button>
        </div>
      </Card>

      {/* SSS-2 Compliance Section */}
      {isSS2 ? (
        <>
          {/* Blacklist Management */}
          <Card
            title="Blacklist Management"
            subtitle="SSS-2 — Add or remove addresses from the on-chain blacklist"
            icon={<Ban size={16} color="var(--red)" />}
            accent="var(--red)"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Input
                label="Address"
                placeholder="Wallet address"
                value={blacklistAddr}
                onChange={(e) => setBlacklistAddr(e.target.value)}
              />
              <Input
                label="Reason"
                placeholder="Compliance reason (stored on-chain)"
                value={blacklistReason}
                onChange={(e) => setBlacklistReason(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <Button
                  variant="danger"
                  onClick={handleBlacklistAdd}
                  loading={blAddLoading}
                  disabled={!blacklistAddr.trim()}
                  icon={<Ban size={14} />}
                >
                  Add to Blacklist
                </Button>
                <Button
                  variant="success"
                  onClick={handleBlacklistRemove}
                  loading={blRemoveLoading}
                  disabled={!blacklistAddr.trim()}
                  icon={<CheckCircle size={14} />}
                >
                  Remove from Blacklist
                </Button>
              </div>
            </div>
          </Card>

          {/* Check Blacklist */}
          <Card
            title="Check Blacklist Status"
            subtitle="Look up if an address is blacklisted"
            icon={<Search size={16} color="var(--accent)" />}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <Input
                placeholder="Wallet address to check"
                value={checkAddr}
                onChange={(e) => { setCheckAddr(e.target.value); setCheckResult(null); }}
                style={{ flex: 1 }}
              />
              <Button
                onClick={handleCheckBlacklist}
                loading={checkLoading}
                disabled={!checkAddr.trim()}
                icon={<Search size={14} />}
                size="sm"
              >
                Check
              </Button>
            </div>
            {checkResult !== null && (
              <div style={{ marginTop: 12 }}>
                {checkResult ? (
                  <Badge color="var(--red)" bg="var(--red-bg)">
                    <Ban size={12} /> Blacklisted
                  </Badge>
                ) : (
                  <Badge color="var(--green)" bg="var(--green-bg)">
                    <CheckCircle size={12} /> Not Blacklisted
                  </Badge>
                )}
              </div>
            )}
          </Card>

          {/* Seize */}
          <Card
            title="Seize Funds"
            subtitle="SSS-2 — Transfer funds from a blacklisted account to treasury"
            icon={<Grab size={16} color="var(--yellow)" />}
            accent="var(--yellow)"
          >
            <div style={styles.warningBanner}>
              <AlertTriangle size={14} color="var(--yellow)" />
              <span>This operation uses the permanent delegate to forcefully transfer tokens. The account must be blacklisted first.</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <Input
                label="Target Account (blacklisted)"
                placeholder="Wallet address of the blacklisted user"
                value={seizeAddr}
                onChange={(e) => setSeizeAddr(e.target.value)}
              />
              <Input
                label="Treasury"
                placeholder="Treasury wallet to receive seized funds"
                value={seizeTreasury}
                onChange={(e) => setSeizeTreasury(e.target.value)}
              />
              <Button
                variant="danger"
                onClick={handleSeize}
                loading={seizeLoading}
                disabled={!seizeAddr.trim() || !seizeTreasury.trim()}
                icon={<Grab size={14} />}
              >
                Seize Funds
              </Button>
            </div>
          </Card>
        </>
      ) : (
        <Card style={{ textAlign: 'center', padding: '40px' }}>
          <ShieldOff size={40} color="var(--text-muted)" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            SSS-2 Compliance Not Enabled
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Blacklist and seize features require SSS-2 compliance preset (permanent delegate + transfer hook).
          </div>
        </Card>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  warningBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    background: 'var(--yellow-bg)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid rgba(234, 179, 8, 0.2)',
    fontSize: 12,
    color: 'var(--yellow)',
    lineHeight: 1.4,
  },
};

export default Compliance;
