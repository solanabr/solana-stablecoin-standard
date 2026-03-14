import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { useStablecoin } from '../contexts/StablecoinContext';
import { useToast } from '../contexts/ToastContext';
import {
  getIDL,
  findStatePDA,
  findMinterInfoPDA,
  formatAmount,
  parseAmount,
  shortenAddress,
  fetchMinters,
  fetchStablecoinState,
} from '../lib/program';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import {
  Pause,
  Play,
  UserPlus,
  UserMinus,
  Users,
  Settings,
  RefreshCw,
} from 'lucide-react';

const Manage: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { currentMint, stablecoinInfo } = useStablecoin();
  const { addToast } = useToast();

  const [minters, setMinters] = useState<any[]>([]);
  const [loadingMinters, setLoadingMinters] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  // Add minter form
  const [newMinter, setNewMinter] = useState('');
  const [newQuota, setNewQuota] = useState('');
  const [addMinterLoading, setAddMinterLoading] = useState(false);

  // Roles form
  const [rolesPauser, setRolesPauser] = useState('');
  const [rolesFreezer, setRolesFreezer] = useState('');
  const [rolesBurner, setRolesBurner] = useState('');
  const [rolesLoading, setRolesLoading] = useState(false);

  const getProgram = () => {
    const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
    return new Program(getIDL(), provider);
  };

  const loadMinters = async () => {
    if (!currentMint || !wallet.publicKey) return;
    setLoadingMinters(true);
    try {
      const [statePDA] = findStatePDA(new PublicKey(currentMint));
      const data = await fetchMinters(connection, wallet, statePDA);
      setMinters(data);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load minters', message: err.message });
    } finally {
      setLoadingMinters(false);
    }
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

  const loadRoles = async () => {
    if (!currentMint || !wallet.publicKey) return;
    try {
      const state = await fetchStablecoinState(connection, wallet, new PublicKey(currentMint));
      setRolesPauser(roleToString((state as any)?.pauser));
      setRolesFreezer(roleToString((state as any)?.freezer));
      setRolesBurner(roleToString((state as any)?.burner));
    } catch {
      setRolesPauser('');
      setRolesFreezer('');
      setRolesBurner('');
    }
  };

  useEffect(() => {
    loadMinters();
    loadRoles();
  }, [currentMint, wallet.publicKey]);

  const handlePauseToggle = async () => {
    if (!currentMint) return;
    setPauseLoading(true);
    try {
      const program = getProgram();
      const [statePDA] = findStatePDA(new PublicKey(currentMint));
      const method = stablecoinInfo?.paused ? 'unpause' : 'pause';

      const sig = await program.methods[method]()
        .accounts({
          authority: wallet.publicKey!,
          state: statePDA,
        })
        .rpc();

      addToast({ type: 'success', title: stablecoinInfo?.paused ? 'Unpaused' : 'Paused', txSig: sig });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to toggle pause', message: err.message });
    } finally {
      setPauseLoading(false);
    }
  };

  const handleAddMinter = async () => {
    if (!currentMint || !newMinter.trim()) return;
    setAddMinterLoading(true);
    try {
      const program = getProgram();
      const mint = new PublicKey(currentMint);
      const [statePDA] = findStatePDA(mint);
      const minterPk = new PublicKey(newMinter.trim());
      const [minterInfo] = findMinterInfoPDA(statePDA, minterPk);

      const quota = newQuota ? parseAmount(newQuota, stablecoinInfo?.decimals || 6) : new BN(0);

      const sig = await program.methods
        .addMinter(quota)
        .accounts({
          authority: wallet.publicKey!,
          state: statePDA,
          minter: minterPk,
          minterInfo,
          systemProgram: new PublicKey('11111111111111111111111111111111'),
        })
        .rpc();

      addToast({ type: 'success', title: 'Minter added', txSig: sig });
      setNewMinter('');
      setNewQuota('');
      loadMinters();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to add minter', message: err.message });
    } finally {
      setAddMinterLoading(false);
    }
  };

  const handleRemoveMinter = async (minterAddr: string) => {
    if (!currentMint) return;
    try {
      const program = getProgram();
      const mint = new PublicKey(currentMint);
      const [statePDA] = findStatePDA(mint);
      const minterPk = new PublicKey(minterAddr);
      const [minterInfo] = findMinterInfoPDA(statePDA, minterPk);

      const sig = await program.methods
        .removeMinter()
        .accounts({
          authority: wallet.publicKey!,
          state: statePDA,
          minter: minterPk,
          minterInfo,
        })
        .rpc();

      addToast({ type: 'success', title: 'Minter removed', txSig: sig });
      loadMinters();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to remove minter', message: err.message });
    }
  };

  const handleUpdateRoles = async () => {
    if (!currentMint) return;
    setRolesLoading(true);
    try {
      const program = getProgram();
      const [statePDA] = findStatePDA(new PublicKey(currentMint));

      const sig = await program.methods
        .updateRoles({
          pauser: rolesPauser ? new PublicKey(rolesPauser) : null,
          freezer: rolesFreezer ? new PublicKey(rolesFreezer) : null,
          burner: rolesBurner ? new PublicKey(rolesBurner) : null,
          blacklister: null,
          seizer: null,
        })
        .accounts({
          authority: wallet.publicKey!,
          state: statePDA,
        })
        .rpc();

      addToast({ type: 'success', title: 'Roles updated', txSig: sig });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to update roles', message: err.message });
    } finally {
      setRolesLoading(false);
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
      {/* Pause/Unpause */}
      <Card
        title="Protocol Control"
        subtitle="Pause or unpause all operations"
        icon={stablecoinInfo?.paused ? <Pause size={16} color="var(--red)" /> : <Play size={16} color="var(--green)" />}
        actions={
          <Button
            variant={stablecoinInfo?.paused ? 'success' : 'danger'}
            size="sm"
            onClick={handlePauseToggle}
            loading={pauseLoading}
            icon={stablecoinInfo?.paused ? <Play size={14} /> : <Pause size={14} />}
          >
            {stablecoinInfo?.paused ? 'Unpause' : 'Pause'}
          </Button>
        }
      >
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {stablecoinInfo?.paused
            ? 'The protocol is currently paused. All mint, burn, and transfer operations are halted.'
            : 'The protocol is active. All operations are functioning normally.'}
        </div>
      </Card>

      {/* Minter Management */}
      <Card
        title="Minter Management"
        subtitle="Add, remove, and monitor authorized minters"
        icon={<Users size={16} color="var(--accent)" />}
        actions={
          <Button variant="ghost" size="sm" onClick={loadMinters} icon={<RefreshCw size={14} />}>
            Refresh
          </Button>
        }
      >
        {/* Add Minter Form */}
        <div style={{ marginBottom: 16, padding: '14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Add New Minter
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Input
              placeholder="Minter wallet address"
              value={newMinter}
              onChange={(e) => setNewMinter(e.target.value)}
              style={{ flex: 2 }}
            />
            <Input
              placeholder="Quota (0 = unlimited)"
              value={newQuota}
              onChange={(e) => setNewQuota(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button
              onClick={handleAddMinter}
              loading={addMinterLoading}
              disabled={!newMinter.trim()}
              icon={<UserPlus size={14} />}
              size="sm"
            >
              Add
            </Button>
          </div>
        </div>

        {/* Minters List */}
        {loadingMinters ? (
          <Spinner label="Loading minters..." />
        ) : minters.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No minters registered yet.
          </div>
        ) : (
          <div>
            <div style={styles.tableHeader}>
              <span style={{ flex: 2 }}>Minter</span>
              <span style={{ flex: 1, textAlign: 'right' }}>Quota</span>
              <span style={{ flex: 1, textAlign: 'right' }}>Minted</span>
              <span style={{ width: 80, textAlign: 'center' }}>Status</span>
              <span style={{ width: 80, textAlign: 'right' }}>Action</span>
            </div>
            {minters.map((m: any) => (
              <div key={m.publicKey} style={styles.tableRow}>
                <span style={{ flex: 2, fontFamily: 'monospace', fontSize: 13 }}>
                  {shortenAddress(m.minter, 6)}
                </span>
                <span style={{ flex: 1, textAlign: 'right', fontSize: 13 }}>
                  {m.quota === '0' ? '∞' : formatAmount(m.quota, stablecoinInfo?.decimals || 6)}
                </span>
                <span style={{ flex: 1, textAlign: 'right', fontSize: 13 }}>
                  {formatAmount(m.mintedTotal, stablecoinInfo?.decimals || 6)}
                </span>
                <span style={{ width: 80, textAlign: 'center' }}>
                  <Badge
                    color={m.active ? 'var(--green)' : 'var(--red)'}
                    bg={m.active ? 'var(--green-bg)' : 'var(--red-bg)'}
                  >
                    {m.active ? 'Active' : 'Removed'}
                  </Badge>
                </span>
                <span style={{ width: 80, textAlign: 'right' }}>
                  {m.active && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemoveMinter(m.minter)}
                      icon={<UserMinus size={12} />}
                    >
                      Remove
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Role Management */}
      <Card
        title="Role Management"
        subtitle="Assign specialized roles (pauser, freezer, burner)"
        icon={<Settings size={16} color="var(--yellow)" />}
        accent="var(--yellow)"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            label="Pauser"
            placeholder="Wallet address of the pauser role"
            value={rolesPauser}
            onChange={(e) => setRolesPauser(e.target.value)}
            hint="Can pause/unpause the protocol"
          />
          <Input
            label="Burner"
            placeholder="Wallet address of the burner role"
            value={rolesBurner}
            onChange={(e) => setRolesBurner(e.target.value)}
            hint="Can burn tokens from any account"
          />
          <Input
            label="Freeze Authority"
            placeholder="Wallet address of the freezer role"
            value={rolesFreezer}
            onChange={(e) => setRolesFreezer(e.target.value)}
            hint="Can freeze and thaw token accounts"
          />
          <Button
            onClick={handleUpdateRoles}
            loading={rolesLoading}
            icon={<Settings size={14} />}
          >
            Update Roles
          </Button>
        </div>
      </Card>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  tableHeader: {
    display: 'flex',
    padding: '8px 0',
    borderBottom: '1px solid var(--border)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid rgba(42, 48, 80, 0.4)',
  },
};

export default Manage;
