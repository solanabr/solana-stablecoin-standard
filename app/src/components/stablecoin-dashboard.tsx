"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor/dist/browser/index.js";
import type { Idl, Wallet as AnchorWallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Keypair,
  ParsedAccountData,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Bell, Copy, PauseCircle, RefreshCw } from "lucide-react";

import rawIdl from "@sdk/idl/sss.json";
import type { StablecoinConfigData, UpdateRoleEntry } from "@sdk/types";
import {
  PROGRAM_ID,
  getBlacklistedEntryPda,
  getBlacklisterRolePda,
  getConfigPda,
  getEventAuthorityPda,
  getMasterRolePda,
  getMinterAccountPda,
  getMintAuthorityPda,
  getPauseAuthorityPda,
  getPauserRolePda,
  getRoleAccountPda,
  getSeizerRolePda,
  getBurnerRolePda,
} from "@sdk/pda";
import { getMintAddress, getWebhookCallbackUrl } from "@/lib/env";
import { useNotifications, type NotificationItem } from "@/lib/webhook";
import { formatDateTime, shortAddress } from "@/lib/utils";
import { WalletButton } from "@/components/wallet-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type RoleState = {
  isMaster: boolean;
  isMinter: boolean;
  isPauser: boolean;
  isBurner: boolean;
  isBlacklister: boolean;
  isSeizer: boolean;
  minter: {
    allowance: bigint;
    minted: bigint;
    remaining: bigint;
  } | null;
};

type BlacklistEntry = {
  pda: string;
  wallet: string;
  reason: string;
};

type MinterRow = {
  pda: string;
  allowance: bigint;
  minted: bigint;
};

type RawConfig = {
  bump: number;
  standard: StablecoinConfigData["standard"];
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
};

type RawMinterAccount = {
  allowance: BN;
  minted: BN;
  mint: PublicKey;
};

type RawBlacklistedEntry = {
  publicKey: PublicKey;
  account: {
    wallet: PublicKey;
    reason: string;
  };
};

const IDL = rawIdl as Idl;
const EVENT_AUTHORITY = getEventAuthorityPda(PROGRAM_ID);

function uiToBaseUnits(value: string, decimals: number): bigint {
  const normalized = value.trim();
  if (!normalized) return 0n;
  const [whole, fraction = ""] = normalized.split(".");
  const fracPadded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

function baseUnitsToUi(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

function parsePausedFromMint(parsed: ParsedAccountData | null): boolean | null {
  if (!parsed) return null;
  const info = parsed.parsed?.info as
    | {
        isPaused?: boolean;
        paused?: boolean;
        extensions?: Array<Record<string, unknown>>;
      }
    | undefined;
  if (!info) return null;
  if (typeof info.isPaused === "boolean") return info.isPaused;
  if (typeof info.paused === "boolean") return info.paused;
  for (const extension of info.extensions ?? []) {
    const key = String(extension.extension ?? extension.type ?? "").toLowerCase();
    if (!key.includes("paus")) continue;
    const state = extension.state as { paused?: boolean } | undefined;
    if (typeof state?.paused === "boolean") return state.paused;
    if (typeof extension.paused === "boolean") return extension.paused as boolean;
  }
  return null;
}

function getAnchorWallet(wallet: ReturnType<typeof useWallet>) {
  if (!wallet.publicKey || !wallet.signTransaction) return null;
  const signAllTransactions =
    wallet.signAllTransactions ??
    (async (transactions: Parameters<NonNullable<typeof wallet.signTransaction>>[0][]) =>
      Promise.all(transactions.map((tx) => wallet.signTransaction!(tx))));
  return {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction,
    signAllTransactions,
  };
}

export function StablecoinDashboard() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const mintAddress = useMemo(() => getMintAddress(), []);

  const anchorWallet = useMemo(() => getAnchorWallet(wallet), [wallet]);

  const provider = useMemo(() => {
    if (!anchorWallet) return null;
    return new AnchorProvider(connection, anchorWallet as unknown as AnchorWallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
  }, [connection, anchorWallet]);

  const program = useMemo(
    () => (provider ? new Program(IDL, provider) : null),
    [provider],
  );

  const readOnlyProgram = useMemo(() => {
    const dummyWallet = Keypair.generate() as unknown as AnchorWallet;
    const readOnlyProvider = new AnchorProvider(connection, dummyWallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    return new Program(IDL, readOnlyProvider);
  }, [connection]);

  const [config, setConfig] = useState<StablecoinConfigData | null>(null);
  const [supply, setSupply] = useState<bigint>(0n);
  const [roles, setRoles] = useState<RoleState | null>(null);
  const [paused, setPaused] = useState<boolean | null>(null);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [masterMinters, setMasterMinters] = useState<MinterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mintRecipient, setMintRecipient] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [minterAddress, setMinterAddress] = useState("");
  const [minterAllowance, setMinterAllowance] = useState("0");
  const [roleWallet, setRoleWallet] = useState("");
  const [roleOldWallet, setRoleOldWallet] = useState("");
  const [roleName, setRoleName] = useState<UpdateRoleEntry["role"]>("pauser");
  const [roleAllowance, setRoleAllowance] = useState("0");
  const [blacklistWallet, setBlacklistWallet] = useState("");
  const [blacklistReason, setBlacklistReason] = useState("");

  const mintString = mintAddress?.toBase58() ?? null;
  const notifications = useNotifications(mintString);
  const [notificationDetail, setNotificationDetail] = useState<NotificationItem | null>(null);

  const loadDashboard = useCallback(async () => {
    const programToUse = program ?? readOnlyProgram;
    if (!programToUse || !mintAddress) return;
    setLoading(true);
    setError(null);
    try {
      const accountApi = programToUse.account as unknown as {
        stablecoinConfig: {
          fetch: (pubkey: PublicKey) => Promise<RawConfig>;
        };
        minterAccount: {
          fetch: (pubkey: PublicKey) => Promise<RawMinterAccount>;
        };
        blacklistedEntry: {
          all: (filters: unknown[]) => Promise<RawBlacklistedEntry[]>;
        };
      };
      const coderAccounts = programToUse.coder.accounts as unknown as {
        decode: (name: "MinterAccount", data: Buffer | Uint8Array) => RawMinterAccount;
      };

      const [configPda] = getConfigPda(PROGRAM_ID, mintAddress);
      const raw = await accountApi.stablecoinConfig.fetch(configPda);
      const nextConfig: StablecoinConfigData = {
        bump: raw.bump as number,
        standard: raw.standard as StablecoinConfigData["standard"],
        name: raw.name as string,
        symbol: raw.symbol as string,
        uri: raw.uri as string,
        decimals: raw.decimals as number,
        enablePermanentDelegate: raw.enablePermanentDelegate as boolean,
        enableTransferHook: raw.enableTransferHook as boolean,
        defaultAccountFrozen: raw.defaultAccountFrozen as boolean,
      };
      setConfig(nextConfig);

      const supplyInfo = await connection.getTokenSupply(mintAddress);
      setSupply(BigInt(supplyInfo.value.amount));

      const mintAccount = await connection.getParsedAccountInfo(mintAddress);
      if ("parsed" in (mintAccount.value?.data ?? {})) {
        setPaused(parsePausedFromMint(mintAccount.value?.data as ParsedAccountData));
      } else {
        setPaused(null);
      }

      if (wallet.publicKey) {
        const [masterRole] = getMasterRolePda(PROGRAM_ID, mintAddress, wallet.publicKey);
        const [minterRole] = getMinterAccountPda(PROGRAM_ID, mintAddress, wallet.publicKey);
        const [pauserRole] = getPauserRolePda(PROGRAM_ID, mintAddress, wallet.publicKey);
        const [burnerRole] = getBurnerRolePda(PROGRAM_ID, mintAddress, wallet.publicKey);
        const [blacklisterRole] = getBlacklisterRolePda(
          PROGRAM_ID,
          mintAddress,
          wallet.publicKey,
        );
        const [seizerRole] = getSeizerRolePda(PROGRAM_ID, mintAddress, wallet.publicKey);

        const roleAccounts = await connection.getMultipleAccountsInfo([
          masterRole,
          minterRole,
          pauserRole,
          burnerRole,
          blacklisterRole,
          seizerRole,
        ]);

        let minter = null;
        if (roleAccounts[1]) {
          try {
            const minterAccount = await accountApi.minterAccount.fetch(minterRole);
            const allowance = BigInt(minterAccount.allowance.toString());
            const minted = BigInt(minterAccount.minted.toString());
            minter = {
              allowance,
              minted,
              remaining: allowance > minted ? allowance - minted : 0n,
            };
          } catch {
            minter = null;
          }
        }

        setRoles({
          isMaster: !!roleAccounts[0],
          isMinter: !!roleAccounts[1],
          isPauser: !!roleAccounts[2],
          isBurner: !!roleAccounts[3],
          isBlacklister: !!roleAccounts[4],
          isSeizer: !!roleAccounts[5],
          minter,
        });
      } else {
        setRoles(null);
      }

      const blacklistedAccounts = await accountApi.blacklistedEntry.all([
        {
          memcmp: {
            offset: 9,
            bytes: mintAddress.toBase58(),
          },
        },
      ]);
      setBlacklist(
        blacklistedAccounts.map((entry) => ({
          pda: (entry.publicKey as PublicKey).toBase58(),
          wallet: (entry.account.wallet as PublicKey).toBase58(),
          reason: String(entry.account.reason),
        })),
      );

      const minterRows: MinterRow[] = [];
      const allAccounts = await connection.getProgramAccounts(PROGRAM_ID);
      for (const account of allAccounts) {
        try {
          const decoded = coderAccounts.decode("MinterAccount", account.account.data);
          if ((decoded.mint as PublicKey).toBase58() !== mintAddress.toBase58()) continue;
          minterRows.push({
            pda: account.pubkey.toBase58(),
            allowance: BigInt(decoded.allowance.toString()),
            minted: BigInt(decoded.minted.toString()),
          });
        } catch {
          continue;
        }
      }
      setMasterMinters(minterRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [connection, mintAddress, program, readOnlyProgram, wallet.publicKey]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const runAction = useCallback(
    async (label: string, fn: () => Promise<string>) => {
      setError(null);
      setMessage(null);
      try {
        const signature = await fn();
        setMessage(`${label} succeeded: ${shortAddress(signature, 6)}`);
        await loadDashboard();
        await notifications.reload();
      } catch (err) {
        if (err instanceof Error) {
          const msg = err.message.toLowerCase();
          if (
            err.name === "WalletSignTransactionError" ||
            msg.includes("user rejected") ||
            msg.includes("request rejected")
          ) {
            return;
          }
        }
        setError(err instanceof Error ? err.message : `${label} failed`);
      }
    },
    [loadDashboard, notifications],
  );

  const handleMint = useCallback(async () => {
    if (!program || !wallet.publicKey || !mintAddress || !config) return;
    const recipient = new PublicKey(mintRecipient);
    const amount = uiToBaseUnits(mintAmount, config.decimals);
    const toAta = getAssociatedTokenAddressSync(
      mintAddress,
      recipient,
      true,
      TOKEN_2022_PROGRAM_ID,
    );
    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      toAta,
      recipient,
      mintAddress,
      TOKEN_2022_PROGRAM_ID,
    );
    const [minterAccount] = getMinterAccountPda(PROGRAM_ID, mintAddress, wallet.publicKey);
    const [mintAuthority] = getMintAuthorityPda(PROGRAM_ID, mintAddress);

    await runAction("Mint", () =>
      program.methods
        .mintTokens(new BN(amount.toString()))
        .accountsStrict({
          minter: wallet.publicKey!,
          mint: mintAddress,
          to: toAta,
          minterAccount,
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          eventAuthority: EVENT_AUTHORITY,
          program: PROGRAM_ID,
        })
        .preInstructions([createAtaIx])
        .rpc(),
    );
  }, [config, mintAddress, mintAmount, mintRecipient, program, runAction, wallet.publicKey]);

  const handlePauseToggle = useCallback(
    async (next: "pause" | "unpause") => {
      if (!program || !wallet.publicKey || !mintAddress) return;
      const [pauserRole] = getPauserRolePda(PROGRAM_ID, mintAddress, wallet.publicKey);
      const [pauseAuthority] = getPauseAuthorityPda(PROGRAM_ID, mintAddress);
      await runAction(next === "pause" ? "Pause" : "Unpause", () =>
        program.methods[next]()
          .accountsStrict({
            pauser: wallet.publicKey!,
            mint: mintAddress,
            pauserRole,
            pauseAuthority,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            eventAuthority: EVENT_AUTHORITY,
            program: PROGRAM_ID,
          })
          .rpc(),
      );
    },
    [mintAddress, program, runAction, wallet.publicKey],
  );

  const handleUpdateMinter = useCallback(
    async (operation: "add" | "remove") => {
      if (!program || !wallet.publicKey || !mintAddress || !config) return;
      const target = new PublicKey(minterAddress);
      const allowance = uiToBaseUnits(minterAllowance, config.decimals);
      const [masterRole] = getMasterRolePda(PROGRAM_ID, mintAddress, wallet.publicKey);
      const [updateMinterPda] = getMinterAccountPda(PROGRAM_ID, mintAddress, target);
      await runAction(operation === "add" ? "Add minter" : "Remove minter", () =>
        program.methods
          .updateMinter(
            operation,
            target,
            new BN((operation === "add" ? allowance : 0n).toString()),
          )
          .accountsStrict({
            master: wallet.publicKey!,
            mint: mintAddress,
            masterRole,
            updateMinter: updateMinterPda,
            systemProgram: SystemProgram.programId,
            eventAuthority: EVENT_AUTHORITY,
            program: PROGRAM_ID,
          })
          .rpc(),
      );
    },
    [
      config,
      minterAddress,
      minterAllowance,
      mintAddress,
      program,
      runAction,
      wallet.publicKey,
    ],
  );

  const handleUpdateRole = useCallback(async () => {
    if (!program || !wallet.publicKey || !mintAddress || !config) return;
    const newWallet = new PublicKey(roleWallet);
    const oldWallet = roleOldWallet ? new PublicKey(roleOldWallet) : null;
    const roleSeed = new TextEncoder().encode(roleName);
    const remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];
    if (oldWallet) {
      const [oldPda] = getRoleAccountPda(PROGRAM_ID, mintAddress, roleSeed, oldWallet);
      remainingAccounts.push({ pubkey: oldPda, isSigner: false, isWritable: true });
    }
    const [newPda] = getRoleAccountPda(PROGRAM_ID, mintAddress, roleSeed, newWallet);
    remainingAccounts.push({ pubkey: newPda, isSigner: false, isWritable: true });

    const [masterRole] = getMasterRolePda(PROGRAM_ID, mintAddress, wallet.publicKey);
    const allowance = uiToBaseUnits(roleAllowance, config.decimals);
    const roleEntry = {
      role: roleName,
      oldKey: oldWallet,
      newKey: newWallet,
      allowance: new BN(allowance.toString()),
    };

    await runAction("Update role", () =>
      program.methods
        .updateRoles([roleEntry])
        .accountsStrict({
          master: wallet.publicKey!,
          mint: mintAddress,
          masterRole,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
          eventAuthority: EVENT_AUTHORITY,
          program: PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .rpc(),
    );
  }, [
    config,
    mintAddress,
    program,
    roleAllowance,
    roleName,
    roleOldWallet,
    roleWallet,
    runAction,
    wallet.publicKey,
  ]);

  const handleBlacklistAdd = useCallback(async () => {
    if (!program || !wallet.publicKey || !mintAddress) return;
    const target = new PublicKey(blacklistWallet);
    const [configPda] = getConfigPda(PROGRAM_ID, mintAddress);
    const [blacklistedEntry] = getBlacklistedEntryPda(PROGRAM_ID, mintAddress, target);
    await runAction("Add to blacklist", () =>
      program.methods
        .addToBlacklist(target, blacklistReason)
        .accountsStrict({
          blacklister: wallet.publicKey!,
          mint: mintAddress,
          config: configPda,
          blacklistedEntry,
          systemProgram: SystemProgram.programId,
          eventAuthority: EVENT_AUTHORITY,
          program: PROGRAM_ID,
        })
        .rpc(),
    );
  }, [
    blacklistReason,
    blacklistWallet,
    mintAddress,
    program,
    runAction,
    wallet.publicKey,
  ]);

  const handleBlacklistRemove = useCallback(
    async (walletAddress: string) => {
      if (!program || !wallet.publicKey || !mintAddress) return;
      const target = new PublicKey(walletAddress);
      const [configPda] = getConfigPda(PROGRAM_ID, mintAddress);
      const [blacklistedEntry] = getBlacklistedEntryPda(PROGRAM_ID, mintAddress, target);
      await runAction("Remove from blacklist", () =>
        program.methods
          .removeFromBlacklist(target)
          .accountsStrict({
            blacklister: wallet.publicKey!,
            mint: mintAddress,
            config: configPda,
            blacklistedEntry,
            systemProgram: SystemProgram.programId,
            eventAuthority: EVENT_AUTHORITY,
            program: PROGRAM_ID,
          })
          .rpc(),
      );
    },
    [mintAddress, program, runAction, wallet.publicKey],
  );

  if (!mounted) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center p-6">
        <div className="text-slate-500">Loading…</div>
      </main>
    );
  }

  if (!mintAddress) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Alert variant="destructive">
          <AlertTitle>Missing env configuration</AlertTitle>
          <AlertDescription>
            Set <code>NEXT_PUBLIC_STABLECOIN_MINT</code>, <code>NEXT_PUBLIC_RPC_URL</code>, and{" "}
            <code>NEXT_PUBLIC_WEBHOOK_API_URL</code> in <code>.env.local</code> in the <code>app</code>{" "}
            directory. Restart the dev server after changing env vars.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            {config?.name ?? "Stablecoin"} {config ? `(${config.symbol})` : ""}
          </h1>
          <p className="text-sm text-slate-500">Mint: {mintAddress.toBase58()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!wallet.connected && (
            <p className="text-sm text-slate-600">
              Connect your wallet to perform actions (mint, pause, roles, blacklist).
            </p>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" onClick={notifications.markAllRead}>
                <span className="relative inline-flex">
                  <Bell className="h-4 w-4" />
                  {notifications.unreadCount > 0 && (
                    <span
                      className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background"
                      aria-label={`${notifications.unreadCount} unread`}
                    />
                  )}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="px-2 py-1 text-xs font-medium text-slate-500">
                Unread: {notifications.unreadCount}
              </div>
              <Separator />
              <ScrollArea className="h-72">
                {notifications.items.length === 0 && (
                  <div className="px-2 py-3 text-sm text-slate-500">No notifications</div>
                )}
                {notifications.items.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    onSelect={() => {
                      notifications.markRead(item.id);
                      setNotificationDetail(item);
                    }}
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium">{item.eventType}</div>
                      <div className="text-[11px] text-slate-500">
                        {formatDateTime(item.createdAt)}
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </ScrollArea>
            </DropdownMenuContent>
          </DropdownMenu>
          <WalletButton />
        </div>
      </header>

      {paused && (
        <Alert variant="destructive">
          <AlertTitle className="flex items-center gap-2">
            <PauseCircle className="h-4 w-4" />
            Mint is currently paused
          </AlertTitle>
          <AlertDescription>
            Transfers, mints, and burns are halted for this token.
            {roles?.isPauser && (
              <Button
                className="ml-3"
                size="sm"
                variant="outline"
                onClick={() => void handlePauseToggle("unpause")}
              >
                Unpause
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {message && (
        <Alert>
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Token & StablecoinConfig</CardTitle>
          <CardDescription>
            On-chain token information and enabled extensions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {config && "sss2" in config.standard ? "SSS-2" : "SSS-1"}
            </Badge>
            <Badge variant={paused ? "destructive" : "default"}>
              {paused ? "Paused" : "Active"}
            </Badge>
            {roles?.isMaster && <Badge variant="outline">Master</Badge>}
            {roles?.isMinter && <Badge variant="outline">Minter</Badge>}
            {roles?.isPauser && <Badge variant="outline">Pauser</Badge>}
            {roles?.isBlacklister && <Badge variant="outline">Blacklister</Badge>}
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div>Name: {config?.name ?? "-"}</div>
            <div>Symbol: {config?.symbol ?? "-"}</div>
            <div>Decimals: {config?.decimals ?? "-"}</div>
            <div>
              Supply:{" "}
              {config ? baseUnitsToUi(supply, config.decimals) : "-"}
            </div>
            <div>Transfer hook: {String(config?.enableTransferHook ?? false)}</div>
            <div>Permanent delegate: {String(config?.enablePermanentDelegate ?? false)}</div>
            <div>Default account frozen: {String(config?.defaultAccountFrozen ?? false)}</div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(mintAddress.toBase58())}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy mint
            </Button>
            <Button variant="outline" size="sm" onClick={() => void loadDashboard()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="controls">
        <TabsList>
          <TabsTrigger value="controls">Controls</TabsTrigger>
          <TabsTrigger value="blacklist">Blacklist</TabsTrigger>
          <TabsTrigger value="master">Master</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="controls" className="grid gap-6 lg:grid-cols-2">
          {!wallet.connected && (
            <Card className="lg:col-span-2">
              <CardContent className="flex flex-col items-center justify-center gap-3 py-8">
                <p className="text-sm text-slate-600">
                  Connect your wallet to perform actions. If your wallet has minter or pauser role,
                  controls will appear here.
                </p>
                <WalletButton />
              </CardContent>
            </Card>
          )}
          {(roles?.isMinter || roles?.isMaster) && (
            <Card>
              <CardHeader>
                <CardTitle>Mint & quota</CardTitle>
                <CardDescription>
                  Minter allowance and minting form.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-600">
                  Allowance:{" "}
                  {config && roles?.minter
                    ? baseUnitsToUi(roles.minter.allowance, config.decimals)
                    : "-"}
                </p>
                <p className="text-sm text-slate-600">
                  Minted:{" "}
                  {config && roles?.minter
                    ? baseUnitsToUi(roles.minter.minted, config.decimals)
                    : "-"}
                </p>
                <p className="text-sm text-slate-600">
                  Remaining:{" "}
                  {config && roles?.minter
                    ? baseUnitsToUi(roles.minter.remaining, config.decimals)
                    : "-"}
                </p>
                <input
                  className="w-full rounded border p-2 text-sm"
                  placeholder="Recipient wallet"
                  value={mintRecipient}
                  onChange={(event) => setMintRecipient(event.target.value)}
                />
                <input
                  className="w-full rounded border p-2 text-sm"
                  placeholder="Amount"
                  value={mintAmount}
                  onChange={(event) => setMintAmount(event.target.value)}
                />
                <Button onClick={() => void handleMint()}>Mint</Button>
              </CardContent>
            </Card>
          )}

          {roles?.isPauser && (
            <Card>
              <CardHeader>
                <CardTitle>Pause controls</CardTitle>
                <CardDescription>Pause or unpause the mint.</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-3">
                <Button variant="destructive" onClick={() => void handlePauseToggle("pause")}>
                  Pause
                </Button>
                <Button variant="outline" onClick={() => void handlePauseToggle("unpause")}>
                  Unpause
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="blacklist">
          <Card>
            <CardHeader>
              <CardTitle>Blacklisted accounts</CardTitle>
              <CardDescription>
                For SSS-2 compliance mints, blacklisters can add/remove entries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>PDA</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blacklist.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>No blacklisted accounts</TableCell>
                    </TableRow>
                  )}
                  {blacklist.map((entry) => (
                    <TableRow key={entry.pda}>
                      <TableCell>{entry.wallet}</TableCell>
                      <TableCell>{entry.reason}</TableCell>
                      <TableCell>{shortAddress(entry.pda, 6)}</TableCell>
                      <TableCell>
                        {roles?.isBlacklister && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleBlacklistRemove(entry.wallet)}
                          >
                            Remove
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {roles?.isBlacklister && (
                <div className="grid gap-2 md:grid-cols-3">
                  <input
                    className="rounded border p-2 text-sm"
                    placeholder="Wallet to blacklist"
                    value={blacklistWallet}
                    onChange={(event) => setBlacklistWallet(event.target.value)}
                  />
                  <input
                    className="rounded border p-2 text-sm"
                    placeholder="Reason"
                    value={blacklistReason}
                    onChange={(event) => setBlacklistReason(event.target.value)}
                  />
                  <Button onClick={() => void handleBlacklistAdd()}>Add to blacklist</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="master" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Master tools</CardTitle>
              <CardDescription>
                Best-effort view: minter accounts are listable by mint; generic role accounts do
                not include holder wallet in account data, so full role-holder enumeration is not
                always possible.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!roles?.isMaster && (
                <Alert>
                  <AlertTitle>Master role required</AlertTitle>
                  <AlertDescription>
                    Connect a wallet that has the master role for this mint.
                  </AlertDescription>
                </Alert>
              )}
              {roles?.isMaster && (
                <>
                  <div className="grid gap-2 md:grid-cols-3">
                    <input
                      className="rounded border p-2 text-sm"
                      placeholder="Minter wallet"
                      value={minterAddress}
                      onChange={(event) => setMinterAddress(event.target.value)}
                    />
                    <input
                      className="rounded border p-2 text-sm"
                      placeholder="Allowance"
                      value={minterAllowance}
                      onChange={(event) => setMinterAllowance(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => void handleUpdateMinter("add")}>Add minter</Button>
                      <Button
                        variant="outline"
                        onClick={() => void handleUpdateMinter("remove")}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-4">
                    <input
                      className="rounded border p-2 text-sm"
                      placeholder="New role wallet"
                      value={roleWallet}
                      onChange={(event) => setRoleWallet(event.target.value)}
                    />
                    <select
                      className="rounded border p-2 text-sm"
                      value={roleName}
                      onChange={(event) =>
                        setRoleName(event.target.value as UpdateRoleEntry["role"])
                      }
                    >
                      <option value="master">master</option>
                      <option value="minter">minter</option>
                      <option value="burner">burner</option>
                      <option value="pauser">pauser</option>
                      <option value="blacklister">blacklister</option>
                      <option value="seizer">seizer</option>
                    </select>
                    <input
                      className="rounded border p-2 text-sm"
                      placeholder="Old wallet (optional)"
                      value={roleOldWallet}
                      onChange={(event) => setRoleOldWallet(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <input
                        className="w-full rounded border p-2 text-sm"
                        placeholder="Allowance for minter"
                        value={roleAllowance}
                        onChange={(event) => setRoleAllowance(event.target.value)}
                      />
                      <Button onClick={() => void handleUpdateRole()}>Apply role</Button>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Minter PDA</TableHead>
                        <TableHead>Allowance</TableHead>
                        <TableHead>Minted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {masterMinters.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3}>No minter accounts found for this mint</TableCell>
                        </TableRow>
                      )}
                      {masterMinters.map((row) => (
                        <TableRow key={row.pda}>
                          <TableCell>{row.pda}</TableCell>
                          <TableCell>
                            {config
                              ? baseUnitsToUi(row.allowance, config.decimals)
                              : row.allowance.toString()}
                          </TableCell>
                          <TableCell>
                            {config
                              ? baseUnitsToUi(row.minted, config.decimals)
                              : row.minted.toString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification center</CardTitle>
              <CardDescription>
                Events pushed to this app when you subscribe the webhook URL below.
              </CardDescription>
              <p className="text-xs text-muted-foreground mt-1 break-all">
                Subscribe this URL at{" "}
                <code className="rounded bg-muted px-1">
                  {getWebhookCallbackUrl()}
                </code>{" "}
                via{" "}
                <code className="rounded bg-muted px-1">
                  POST /subscriptions
                </code>{" "}
                (e.g. curl to your webhook service) to receive events here.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {notifications.error && (
                <Alert variant="destructive">
                  <AlertDescription>{notifications.error}</AlertDescription>
                </Alert>
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void notifications.reload()}>
                  Refresh notifications
                </Button>
                <span className="text-xs text-slate-500">
                  {notifications.loading ? "Loading..." : `${notifications.items.length} events`}
                </span>
              </div>
              <ScrollArea className="h-[420px] rounded border p-3">
                <div className="space-y-2">
                  {notifications.items.map((item) => (
                    <div
                      key={item.id}
                      className="cursor-pointer rounded border p-3 transition-colors hover:bg-slate-50"
                      onClick={() => {
                        notifications.markRead(item.id);
                        setNotificationDetail(item);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{item.eventType}</div>
                        <Badge variant={item.unread ? "default" : "secondary"}>
                          {item.unread ? "Unread" : "Read"}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatDateTime(item.createdAt)} - {shortAddress(item.mint, 6)}
                      </div>
                    </div>
                  ))}
                  {notifications.items.length === 0 && (
                    <p className="text-sm text-slate-500">No events available yet.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {loading && <p className="text-sm text-slate-500">Refreshing on-chain data...</p>}

      <Dialog open={!!notificationDetail} onOpenChange={(open) => !open && setNotificationDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {notificationDetail?.eventType ?? "Notification details"}
            </DialogTitle>
          </DialogHeader>
          {notificationDetail && (
            <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-500">Event type</dt>
                <dd className="font-medium">{notificationDetail.eventType}</dd>
                <dt className="text-slate-500">Time</dt>
                <dd>{formatDateTime(notificationDetail.createdAt)}</dd>
                <dt className="text-slate-500">Mint</dt>
                <dd className="font-mono text-xs break-all">{notificationDetail.mint}</dd>
                {notificationDetail.signature != null && (
                  <>
                    <dt className="text-slate-500">Signature</dt>
                    <dd className="font-mono text-xs break-all">{notificationDetail.signature}</dd>
                  </>
                )}
              </dl>
              {Object.keys(notificationDetail.payload).length > 0 && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-700">Event data</div>
                  <pre className="rounded border bg-slate-50 p-3 text-xs overflow-auto max-h-64">
                    {JSON.stringify(notificationDetail.payload, null, 2)}
                  </pre>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => setNotificationDetail(null)}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
