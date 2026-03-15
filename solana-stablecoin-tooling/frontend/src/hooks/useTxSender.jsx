import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { explorerUrl } from '../config';

export function useTxSender() {
  const { connection } = useConnection();
  const { sendTransaction, publicKey } = useWallet();
  const [status, setStatus] = useState({ state: 'idle', message: '', sig: null });

  const send = useCallback(async (buildFn, onSuccess) => {
    if (!publicKey) {
      setStatus({ state: 'error', message: 'Connect your wallet first', sig: null });
      return;
    }

    setStatus({ state: 'sending', message: 'Building transaction...', sig: null });

    try {
      const { tx, blockhash } = await buildFn();
      setStatus({ state: 'sending', message: 'Approve in wallet...', sig: null });

      console.log("Simulating tx...");
      const simResult = await connection.simulateTransaction(tx, { sigVerify: false });
      console.log("SIM RESULT:", JSON.stringify(simResult.value.err));
      console.log("SIM LOGS:", simResult.value.logs);
      if (simResult.value.err) { throw new Error("Sim failed: " + JSON.stringify(simResult.value.err) + " | " + (simResult.value.logs || []).join("\n")); }
      const sig = await sendTransaction(tx, connection);
      setStatus({ state: 'confirming', message: 'Confirming...', sig });

      await connection.confirmTransaction({
        signature: sig,
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
      });

      setStatus({ state: 'success', message: 'Transaction confirmed!', sig });
      if (onSuccess) onSuccess();
    } catch (e) {
      console.error("TX ERROR FULL:", e);
      console.error("TX LOGS:", e.logs || e.error?.logs || "no logs");
      console.error("TX ERROR CODE:", e.error?.code, e.error?.message);
      const msg = e.message?.includes('User rejected')
        ? 'Transaction cancelled by user'
        : e.message || 'Transaction failed';
      setStatus({ state: 'error', message: msg, sig: null });
    }
  }, [connection, sendTransaction, publicKey]);

  const reset = useCallback(() => {
    setStatus({ state: 'idle', message: '', sig: null });
  }, []);

  return { status, send, reset, publicKey };
}

export function TxStatus({ status, onReset }) {
  if (status.state === 'idle') return null;

  const colors = {
    sending: 'border-amber-800/40 bg-amber-950/20 text-amber-300',
    confirming: 'border-blue-800/40 bg-blue-950/20 text-blue-300',
    success: 'border-emerald-800/40 bg-emerald-950/20 text-emerald-300',
    error: 'border-red-800/40 bg-red-950/20 text-red-300',
  };

  const icons = { sending: '⏳', confirming: '🔄', success: '✅', error: '❌' };

  return (
    <div className={`mt-4 p-3 rounded-lg border ${colors[status.state]} text-sm animate-slide-up`}>
      <div className="flex items-center justify-between">
        <span>
          {icons[status.state]} {status.message}
        </span>
        {(status.state === 'success' || status.state === 'error') && (
          <button onClick={onReset} className="text-xs opacity-60 hover:opacity-100 ml-2">
            Dismiss
          </button>
        )}
      </div>
      {status.sig && (
        <a
          href={explorerUrl(status.sig, 'tx')}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-1.5 text-xs font-mono opacity-70 hover:opacity-100 truncate"
        >
          View on Explorer →
        </a>
      )}
    </div>
  );
}
