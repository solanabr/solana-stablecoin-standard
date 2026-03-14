import { useWallet } from '@solana/wallet-adapter-react';
import { Keypair, type PublicKey, type Transaction, type VersionedTransaction } from '@solana/web3.js';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_ENVIRONMENT, DEFAULT_RPC_URL } from '../app/constants';
import type {
  CreateStablecoinFormValues,
  Environment,
  HolderRecord,
  Lockfile,
  LogEntry,
  MinterRecord,
  NotificationItem,
  OperatorSigner,
  StablecoinSummary,
} from '../app/types';
import { explorerUrl } from '../lib/format';
import { downloadLockfile, parseLockfile } from '../lib/lockfile';
import { parseOperatorSigner, toKeypair } from '../lib/operatorSigner';
import { type ActiveSession, sssAdapter } from '../lib/sssAdapter';

type WalletAuthority = {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
  payer: ReturnType<typeof toKeypair>;
};

type TransactionAuthority = ReturnType<typeof toKeypair> | WalletAuthority;

type OperationName =
  | 'mint'
  | 'burn'
  | 'freeze'
  | 'thaw'
  | 'pause'
  | 'unpause'
  | 'add-minter'
  | 'remove-minter'
  | 'blacklist-add'
  | 'blacklist-remove'
  | 'seize';

interface SessionState {
  lockfile: Lockfile | null;
  summary: StablecoinSummary | null;
  minters: MinterRecord[];
  holders: HolderRecord[];
  logs: LogEntry[];
}

interface AppContextValue extends SessionState {
  activeTab: string;
  environment: Environment;
  rpcUrl: string;
  operatorSigner: OperatorSigner | null;
  walletAddress: string | null;
  notifications: NotificationItem[];
  setActiveTab: (value: string) => void;
  setRpcUrl: (value: string) => void;
  dismissNotification: (id: string) => void;
  clearSession: () => void;
  importOperatorSigner: (raw: string) => Promise<void>;
  clearOperatorSigner: () => void;
  loadLockfile: (raw?: string) => Promise<void>;
  saveLockfile: () => void;
  deployStablecoin: (values: CreateStablecoinFormValues) => Promise<void>;
  refreshData: () => Promise<void>;
  refreshMinters: () => Promise<void>;
  performOperation: (name: OperationName, payload?: Record<string, string>) => Promise<string>;
}

const AppContext = createContext<AppContextValue | null>(null);
const LOCKFILE_STORAGE_KEY = 'sss.lockfile';

export function AppProvider({ children }: { children: ReactNode }) {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [environment] = useState<Environment>(DEFAULT_ENVIRONMENT);
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC_URL);
  const [operatorSigner, setOperatorSigner] = useState<OperatorSigner | null>(null);
  const [lockfile, setLockfile] = useState<Lockfile | null>(null);
  const [summary, setSummary] = useState<StablecoinSummary | null>(null);
  const [minters, setMinters] = useState<MinterRecord[]>([]);
  const [holders, setHolders] = useState<HolderRecord[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [session, setSession] = useState<ActiveSession | null>(null);

  const connectedWalletAuthority = useMemo<TransactionAuthority | null>(() => {
    if (!publicKey || !signTransaction) {
      return null;
    }

    return {
      publicKey,
      signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => signTransaction(tx) as Promise<T>,
      signAllTransactions: signAllTransactions
        ? signAllTransactions
        : async <T extends Transaction | VersionedTransaction>(txs: T[]) =>
            Promise.all(txs.map((tx) => signTransaction(tx))) as Promise<T[]>,
      payer: Keypair.generate(),
    };
  }, [publicKey, signTransaction, signAllTransactions]);

  const runtimeAuthority: TransactionAuthority | null = useMemo(() => {
    if (connectedWalletAuthority) {
      return connectedWalletAuthority;
    }
    if (operatorSigner) {
      return toKeypair(operatorSigner);
    }
    return null;
  }, [connectedWalletAuthority, operatorSigner]);

  function addLog(entry: Omit<LogEntry, 'id' | 'timestamp'>) {
    setLogs((current) => [
      {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
      ...current,
    ]);
  }

  function pushNotification(item: Omit<NotificationItem, 'id'>) {
    const id = crypto.randomUUID();
    setNotifications((current) => [...current, { ...item, id }]);
    window.setTimeout(() => {
      setNotifications((current) => current.filter((entry) => entry.id !== id));
    }, 8000);
  }

  function dismissNotification(id: string) {
    setNotifications((current) => current.filter((entry) => entry.id !== id));
  }

  function clearSession() {
    window.localStorage.removeItem(LOCKFILE_STORAGE_KEY);
    setLockfile(null);
    setSession(null);
    setSummary(null);
    setMinters([]);
    setHolders([]);
    setLogs([]);
    setActiveTab('dashboard');
  }

  async function refreshFromSession(nextSession: ActiveSession) {
    const nextSummary = await sssAdapter.getStatus(nextSession);
    const [nextMinters, nextHolders, nextLogs] = await Promise.all([
      sssAdapter.listMinters(nextSession).catch(() => []),
      sssAdapter.listHolders(nextSession).catch(() => []),
      sssAdapter.getAuditLog(nextSession, 10).catch(() => []),
    ]);
    setSummary(nextSummary);
    setMinters(nextMinters);
    setHolders(nextHolders);
    setLogs(nextLogs);
  }

  async function importOperator(raw: string) {
    const parsed = parseOperatorSigner(raw);
    setOperatorSigner(parsed);
    addLog({
      action: 'Operator Imported',
      details: `Loaded signer ${parsed.label}`,
      actor: 'System',
      status: 'success',
    });
  }

  async function loadLockfileAction(raw?: string) {
    const text = raw ?? window.prompt('Paste sss.lock.json');
    if (!text) {
      return;
    }

    const parsed = parseLockfile(text);
    const result = await sssAdapter.loadFromLockfile(parsed, {
      environment,
      rpcUrl,
      authority: runtimeAuthority,
    });
    setLockfile(parsed);
    setSession(result.session);
    setSummary(result.summary);
    window.localStorage.setItem(LOCKFILE_STORAGE_KEY, JSON.stringify(parsed));
    await refreshFromSession(result.session);
    addLog({
      action: 'Lockfile Loaded',
      details: `Attached to mint ${parsed.mint}`,
      actor: 'System',
      status: 'success',
    });
  }

  async function deploy(values: CreateStablecoinFormValues) {
    try {
      const result = await sssAdapter.createStablecoin(values, {
        environment,
        rpcUrl,
        authority: runtimeAuthority,
      });
      setLockfile(result.session.lockfile);
      setSession(result.session);
      setSummary(result.summary);
      window.localStorage.setItem(LOCKFILE_STORAGE_KEY, JSON.stringify(result.session.lockfile));
      setActiveTab('dashboard');
      await refreshFromSession(result.session);
      addLog({
        action: 'Stablecoin Deployed',
        details: `${values.name} (${values.preset}) created`,
        actor: connectedWalletAuthority?.publicKey.toBase58() ?? operatorSigner?.label ?? 'Operator',
        status: 'success',
        signature: result.session.lockfile.mint,
      });
      pushNotification({
        title: 'Deployment Successful',
        message: `${values.name} (${values.symbol}) is ready on ${environment}.`,
        variant: 'success',
        explorerUrl: explorerUrl(result.session.lockfile.mint, 'address', environment, rpcUrl),
      });
    } catch (error) {
      addLog({
        action: 'deploy',
        details: error instanceof Error ? error.message : String(error),
        actor: connectedWalletAuthority?.publicKey.toBase58() ?? operatorSigner?.label ?? 'Operator',
        status: 'failed',
      });
      pushNotification({
        title: 'Deployment Failed',
        message: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
      throw error;
    }
  }

  async function refreshData() {
    if (!session) {
      return;
    }
    await refreshFromSession(session);
  }

  async function refreshMinters() {
    if (!session) {
      return;
    }
    const nextMinters = await sssAdapter.listMinters(session);
    setMinters(nextMinters);
  }

  async function performOperation(name: OperationName, payload: Record<string, string> = {}) {
    if (!session) {
      throw new Error('Load a lockfile or deploy a stablecoin first.');
    }

    try {
      let signature = '';
      switch (name) {
        case 'mint':
          signature = await sssAdapter.mint(session, payload.recipient, BigInt(payload.amount));
          break;
        case 'burn':
          signature = await sssAdapter.burn(
            session,
            payload.sourceTokenAccount,
            BigInt(payload.amount),
          );
          break;
        case 'freeze':
          signature = await sssAdapter.freeze(session, payload.tokenAccount);
          break;
        case 'thaw':
          signature = await sssAdapter.thaw(session, payload.tokenAccount);
          break;
        case 'pause':
          signature = await sssAdapter.pause(session);
          break;
        case 'unpause':
          signature = await sssAdapter.unpause(session);
          break;
        case 'add-minter':
          signature = await sssAdapter.addMinter(
            session,
            payload.minter,
            BigInt(payload.quotaAmount),
            Number(payload.windowSeconds),
          );
          break;
        case 'remove-minter':
          signature = await sssAdapter.removeMinter(session, payload.minter);
          break;
        case 'blacklist-add':
          signature = await sssAdapter.blacklistAdd(session, payload.wallet, payload.reason);
          break;
        case 'blacklist-remove':
          signature = await sssAdapter.blacklistRemove(session, payload.wallet);
          break;
        case 'seize':
          signature = await sssAdapter.seize(
            session,
            payload.sourceTokenAccount,
            payload.sourceOwner,
            payload.destinationTokenAccount,
            BigInt(payload.amount),
          );
          break;
      }

      addLog({
        action: name,
        details: JSON.stringify(payload),
        actor: connectedWalletAuthority?.publicKey.toBase58() ?? operatorSigner?.label ?? 'Operator',
        status: 'success',
        signature,
      });
      pushNotification({
        title: `${name} successful`,
        message: `Transaction confirmed on ${environment}.`,
        variant: 'success',
        explorerUrl: explorerUrl(signature, 'tx', environment, rpcUrl),
      });
      await refreshData();
      return signature;
    } catch (error) {
      addLog({
        action: name,
        details: error instanceof Error ? error.message : String(error),
        actor: connectedWalletAuthority?.publicKey.toBase58() ?? operatorSigner?.label ?? 'Operator',
        status: 'failed',
      });
      pushNotification({
        title: `${name} failed`,
        message: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
      throw error;
    }
  }

  function saveLockfile() {
    if (!lockfile) {
      return;
    }
    downloadLockfile(lockfile);
  }

  useEffect(() => {
    const raw = window.localStorage.getItem(LOCKFILE_STORAGE_KEY);
    if (!raw || session) {
      return;
    }

    try {
      const parsed = parseLockfile(raw);
      void (async () => {
        const result = await sssAdapter.loadFromLockfile(parsed, {
          environment,
          rpcUrl,
          authority: runtimeAuthority,
        });
        setLockfile(parsed);
        setSession(result.session);
        setSummary(result.summary);
        await refreshFromSession(result.session);
      })();
    } catch {
      window.localStorage.removeItem(LOCKFILE_STORAGE_KEY);
    }
  }, [environment, rpcUrl, runtimeAuthority, session]);

  useEffect(() => {
    if (!session || !lockfile || !runtimeAuthority) {
      return;
    }

    if (session.authority.publicKey.equals(runtimeAuthority.publicKey)) {
      return;
    }

    void (async () => {
      const result = await sssAdapter.loadFromLockfile(lockfile, {
        environment,
        rpcUrl,
        authority: runtimeAuthority,
      });
      setSession(result.session);
      setSummary(result.summary);
      await refreshFromSession(result.session);
    })();
  }, [environment, lockfile, rpcUrl, runtimeAuthority, session]);

  const visibleSummary =
    summary && runtimeAuthority && summary.masterAuthority === runtimeAuthority.publicKey.toBase58()
      ? summary
      : null;

  const value = useMemo<AppContextValue>(
    () => ({
      activeTab,
      environment,
      rpcUrl,
      operatorSigner,
      walletAddress: publicKey?.toBase58() ?? null,
      notifications,
      lockfile,
      summary: visibleSummary,
      minters: visibleSummary ? minters : [],
      holders: visibleSummary ? holders : [],
      logs: visibleSummary ? logs : [],
      setActiveTab,
      setRpcUrl,
      dismissNotification,
      clearSession,
      importOperatorSigner: importOperator,
      clearOperatorSigner: () => setOperatorSigner(null),
      loadLockfile: loadLockfileAction,
      saveLockfile,
      deployStablecoin: deploy,
      refreshData,
      refreshMinters,
      performOperation,
    }),
    [activeTab, environment, rpcUrl, operatorSigner, publicKey, notifications, lockfile, visibleSummary, minters, holders, logs],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
