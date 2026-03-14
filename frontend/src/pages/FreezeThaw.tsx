import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { useStablecoin } from '../contexts/StablecoinContext';
import { useToast } from '../contexts/ToastContext';
import {
  getIDL,
  findStatePDA,
  findFreezeAuthorityPDA,
  fetchStablecoinState,
  shortenAddress,
} from '../lib/program';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import { Snowflake, Sun, Settings } from 'lucide-react';

const FreezeThaw: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { currentMint } = useStablecoin();
  const { addToast } = useToast();

  const [freezeAddr, setFreezeAddr] = useState('');
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [thawLoading, setThawLoading] = useState(false);

  const [freezerAuthority, setFreezerAuthority] = useState('');
  const [authorityLoading, setAuthorityLoading] = useState(false);

  const getProgram = () => {
    const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
    return new Program(getIDL(), provider);
  };

  const roleToString = (value: unknown): string => {
    if (value && typeof value === 'object' && 'toBase58' in (value as Record<string, unknown>)) {
      try {
        return (value as { toBase58: () => string }).toBase58();
      } catch {
        return '';
      }
    }
    return '';
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

  const handleSetFreezeAuthority = async () => {
    if (!currentMint) return;
    setAuthorityLoading(true);
    try {
      const program = getProgram();
      const mint = new PublicKey(currentMint);
      const [statePDA] = findStatePDA(mint);
      const state = await fetchStablecoinState(connection, wallet, mint) as any;

      const sig = await program.methods
        .updateRoles({
          pauser: state?.pauser ?? null,
          freezer: freezerAuthority.trim() ? new PublicKey(freezerAuthority.trim()) : null,
          burner: state?.burner ?? null,
          blacklister: state?.blacklister ?? null,
          seizer: state?.seizer ?? null,
        })
        .accounts({
          authority: wallet.publicKey!,
          state: statePDA,
        })
        .rpc();

      addToast({
        type: 'success',
        title: freezerAuthority.trim() ? 'Freeze authority updated' : 'Freeze authority cleared',
        txSig: sig,
      });

      const refreshedState = await fetchStablecoinState(connection, wallet, mint) as any;
      setFreezerAuthority(roleToString(refreshedState?.freezer));
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to update freeze authority', message: err.message });
    } finally {
      setAuthorityLoading(false);
    }
  };

  const handleLoadCurrentFreezer = async () => {
    if (!currentMint) return;
    try {
      const mint = new PublicKey(currentMint);
      const state = await fetchStablecoinState(connection, wallet, mint) as any;
      setFreezerAuthority(roleToString(state?.freezer));
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load freeze authority', message: err.message });
    }
  };

  if (!currentMint) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
        Load a stablecoin from the Dashboard first.
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 800 }}>
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

      <Card
        title="Freeze Authority"
        subtitle="Set a wallet that can freeze and thaw accounts"
        icon={<Settings size={16} color="var(--yellow)" />}
        accent="var(--yellow)"
        actions={
          <Button variant="ghost" size="sm" onClick={handleLoadCurrentFreezer}>
            Load Current
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            label="Freezer Role"
            placeholder="Wallet address (leave empty to clear)"
            value={freezerAuthority}
            onChange={(e) => setFreezerAuthority(e.target.value)}
            hint="By default no freezer is assigned. Master authority can set one here."
          />
          <Button
            onClick={handleSetFreezeAuthority}
            loading={authorityLoading}
            icon={<Settings size={14} />}
          >
            {freezerAuthority.trim() ? 'Set Freeze Authority' : 'Clear Freeze Authority'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default FreezeThaw;
