import { useCallback, useState } from "react";
import { PublicKey, Connection } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import BN from "bn.js";
import { Role } from "@sss/sdk";
import { useStablecoinContext } from "../contexts/StablecoinContext";

/** Read the owner (bytes 32-64) from a Token-2022 account on-chain. */
async function resolveTokenAccountOwner(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(tokenAccount);
  if (!info || info.data.length < 64)
    throw new Error("Invalid token account: " + tokenAccount.toBase58());
  return new PublicKey(info.data.slice(32, 64));
}

// ── Generic transaction state ───────────────────────────────────────────────

export interface TxState {
  loading: boolean;
  error:   string | null;
  txSig:   string | null;
}

function useTxState() {
  const [state, setState] = useState<TxState>({
    loading: false,
    error:   null,
    txSig:   null,
  });

  const run = useCallback(
    async (fn: () => Promise<string>): Promise<string | null> => {
      setState({ loading: true, error: null, txSig: null });
      try {
        const sig = await fn();
        setState({ loading: false, error: null, txSig: sig });
        return sig;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setState({ loading: false, error: msg, txSig: null });
        return null;
      }
    },
    []
  );

  return { state, run };
}

// ── useStablecoin ───────────────────────────────────────────────────────────

/**
 * Central hook providing all SDK-backed mutation operations.
 * Each operation returns the transaction signature on success, or null on failure.
 * Transaction state (loading / error / txSig) is tracked per-operation group.
 */
export function useStablecoin() {
  const { mintAddress, getSdk, refreshInfo } = useStablecoinContext();
  const { connection } = useConnection();

  const mintTx    = useTxState();
  const burnTx    = useTxState();
  const seizeTx   = useTxState();
  const roleTx    = useTxState();
  const pauseTx   = useTxState();
  const adminTx   = useTxState();
  const compliTx  = useTxState();
  const metaTx    = useTxState();

  const getMintPk = () => {
    if (!mintAddress) throw new Error("No mint address selected");
    return new PublicKey(mintAddress);
  };

  // ── Operations ─────────────────────────────────────────────────────────

  const mintTo = useCallback(
    async (to: string, amount: string, decimals: number): Promise<string | null> => {
      return mintTx.run(async () => {
        const sdk = await getSdk();
        const toPk = new PublicKey(to);
        const toOwner = await resolveTokenAccountOwner(connection, toPk);
        const sig = await sdk.mintTo({
          mint:    getMintPk(),
          to:      toPk,
          toOwner,
          amount:  new BN(amount).mul(new BN(10).pow(new BN(decimals))),
        });
        await refreshInfo();
        return sig;
      });
    },
    [getSdk, mintAddress, refreshInfo]
  );

  const burnFrom = useCallback(
    async (from: string, amount: string, decimals: number): Promise<string | null> => {
      return burnTx.run(async () => {
        const sdk = await getSdk();
        const fromPk = new PublicKey(from);
        const fromOwner = await resolveTokenAccountOwner(connection, fromPk);
        const sig = await sdk.burnFrom({
          mint:      getMintPk(),
          from:      fromPk,
          fromOwner,
          amount:    new BN(amount).mul(new BN(10).pow(new BN(decimals))),
        });
        await refreshInfo();
        return sig;
      });
    },
    [getSdk, mintAddress, refreshInfo]
  );

  const seize = useCallback(
    async (
      from: string,
      treasuryAta: string,
      amount: string,
      decimals: number
    ): Promise<string | null> => {
      return seizeTx.run(async () => {
        const sdk = await getSdk();
        const fromPk = new PublicKey(from);
        const fromOwner = await resolveTokenAccountOwner(connection, fromPk);
        const sig = await sdk.seize({
          mint:        getMintPk(),
          from:        fromPk,
          fromOwner,
          treasuryAta: new PublicKey(treasuryAta),
          amount:      new BN(amount).mul(new BN(10).pow(new BN(decimals))),
        });
        await refreshInfo();
        return sig;
      });
    },
    [getSdk, mintAddress, refreshInfo]
  );

  const grantRole = useCallback(
    async (
      holder: string,
      role: Role,
      allowance: string
    ): Promise<string | null> => {
      return roleTx.run(async () => {
        const sdk = await getSdk();
        return sdk.grantRole({
          mint:      getMintPk(),
          holder:    new PublicKey(holder),
          role,
          allowance: new BN(allowance),
        });
      });
    },
    [getSdk, mintAddress]
  );

  const revokeRole = useCallback(
    async (holder: string, role: Role): Promise<string | null> => {
      return roleTx.run(async () => {
        const sdk = await getSdk();
        return sdk.revokeRole(getMintPk(), new PublicKey(holder), role);
      });
    },
    [getSdk, mintAddress]
  );

  const incrementAllowance = useCallback(
    async (minterHolder: string, amount: string): Promise<string | null> => {
      return roleTx.run(async () => {
        const sdk = await getSdk();
        return sdk.incrementAllowance(
          getMintPk(),
          new PublicKey(minterHolder),
          new BN(amount)
        );
      });
    },
    [getSdk, mintAddress]
  );

  const pause = useCallback(async (): Promise<string | null> => {
    return pauseTx.run(async () => {
      const sdk = await getSdk();
      const sig = await sdk.pause(getMintPk());
      await refreshInfo();
      return sig;
    });
  }, [getSdk, mintAddress, refreshInfo]);

  const unpause = useCallback(async (): Promise<string | null> => {
    return pauseTx.run(async () => {
      const sdk = await getSdk();
      const sig = await sdk.unpause(getMintPk());
      await refreshInfo();
      return sig;
    });
  }, [getSdk, mintAddress, refreshInfo]);

  const blacklist = useCallback(
    async (wallet: string): Promise<string | null> => {
      return compliTx.run(async () => {
        const sdk = await getSdk();
        return sdk.blacklist({ mint: getMintPk(), wallet: new PublicKey(wallet) });
      });
    },
    [getSdk, mintAddress]
  );

  const unblacklist = useCallback(
    async (wallet: string): Promise<string | null> => {
      return compliTx.run(async () => {
        const sdk = await getSdk();
        return sdk.unblacklist({
          mint:   getMintPk(),
          wallet: new PublicKey(wallet),
        });
      });
    },
    [getSdk, mintAddress]
  );

  const freezeAccount = useCallback(
    async (tokenAccount: string): Promise<string | null> => {
      return compliTx.run(async () => {
        const sdk = await getSdk();
        return sdk.freezeAccount(getMintPk(), new PublicKey(tokenAccount));
      });
    },
    [getSdk, mintAddress]
  );

  const thawAccount = useCallback(
    async (tokenAccount: string): Promise<string | null> => {
      return compliTx.run(async () => {
        const sdk = await getSdk();
        return sdk.thawAccount(getMintPk(), new PublicKey(tokenAccount));
      });
    },
    [getSdk, mintAddress]
  );

  const transferAdmin = useCallback(
    async (newAdmin: string): Promise<string | null> => {
      return adminTx.run(async () => {
        const sdk = await getSdk();
        return sdk.transferAdmin(getMintPk(), new PublicKey(newAdmin));
      });
    },
    [getSdk, mintAddress]
  );

  const acceptAdmin = useCallback(async (): Promise<string | null> => {
    return adminTx.run(async () => {
      const sdk = await getSdk();
      const sig = await sdk.acceptAdmin(getMintPk());
      await refreshInfo();
      return sig;
    });
  }, [getSdk, mintAddress, refreshInfo]);

  const setMetadata = useCallback(
    async (name: string, symbol: string, uri: string): Promise<string | null> => {
      return metaTx.run(async () => {
        const sdk = await getSdk();
        return sdk.setMetadata({ mint: getMintPk(), name, symbol, uri });
      });
    },
    [getSdk, mintAddress]
  );

  return {
    // Mint / burn / seize
    mintTo,
    mintTxState: mintTx.state,
    burnFrom,
    burnTxState: burnTx.state,
    seize,
    seizeTxState: seizeTx.state,

    // Roles
    grantRole,
    revokeRole,
    incrementAllowance,
    roleTxState: roleTx.state,

    // Pause
    pause,
    unpause,
    pauseTxState: pauseTx.state,

    // Compliance
    blacklist,
    unblacklist,
    freezeAccount,
    thawAccount,
    compliTxState: compliTx.state,

    // Admin
    transferAdmin,
    acceptAdmin,
    adminTxState: adminTx.state,

    // Metadata
    setMetadata,
    metaTxState: metaTx.state,
  };
}
