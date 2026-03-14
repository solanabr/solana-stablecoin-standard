import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "solana-stablecoin-sdk";
import { DashboardStats, OperationId, OperationItem, RoleFlags, TuiCapabilities } from "./types";
import { formatTokenAmount } from "./format";

export class SdkService {
  private stablecoin: SolanaStablecoin | null = null;
  private mintPk: PublicKey | null = null;

  constructor(
    private readonly connection: Connection,
    private readonly mintAddress: string | null,
    private readonly wallet: Keypair | null,
  ) {}

  async init(): Promise<void> {
    if (!this.mintAddress) return;
    this.mintPk = new PublicKey(this.mintAddress);
    const authority = this.wallet ?? Keypair.generate();
    this.stablecoin = await SolanaStablecoin.load(this.connection, this.mintPk, authority);
  }

  hasWritableClient(): boolean {
    return !!this.wallet && !!this.stablecoin;
  }

  getStablecoin(): SolanaStablecoin | null {
    return this.stablecoin;
  }

  getMintAddress(): string | null {
    return this.mintAddress;
  }

  getMintPublicKey(): PublicKey | null {
    return this.mintPk;
  }

  async fetchStats(): Promise<DashboardStats> {
    const blockHeight = await this.connection.getBlockHeight();
    const walletBalance = this.wallet
      ? `${(await this.connection.getBalance(this.wallet.publicKey) / LAMPORTS_PER_SOL).toFixed(4)} SOL`
      : "read-only";

    if (!this.stablecoin) {
      return {
        supply: "—",
        totalMinted: "—",
        totalBurned: "—",
        totalMintedValue: 0n,
        totalBurnedValue: 0n,
        minters: 0,
        holders: 0,
        paused: false,
        preset: "—",
        walletBalance,
        blockHeight,
      };
    }

    const [state, mintInfo, holders] = await Promise.all([
      this.stablecoin.getState(),
      this.stablecoin.getMintInfo(),
      this.stablecoin.getHolders(1n),
    ]);
    const minters = await this.safeListMinters();

    const decimals = mintInfo.decimals;
    const supply = formatTokenAmount(BigInt(mintInfo.supply.toString()), decimals);
    const totalMintedValue = BigInt(state.totalMinted.toString());
    const totalBurnedValue = BigInt(state.totalBurned.toString());
    const totalMinted = formatTokenAmount(totalMintedValue, decimals);
    const totalBurned = formatTokenAmount(totalBurnedValue, decimals);

    return {
      supply,
      totalMinted,
      totalBurned,
      totalMintedValue,
      totalBurnedValue,
      minters: minters.length,
      holders: holders.length,
      paused: !!state.paused,
      preset: state.complianceEnabled ? "SSS-2" : "SSS-1",
      walletBalance,
      blockHeight,
    };
  }

  async fetchTopHolders(limit = 8): Promise<Array<[string, string]>> {
    if (!this.stablecoin) return [["—", "—"]];
    const mintInfo = await this.stablecoin.getMintInfo();
    const decimals = mintInfo.decimals;
    const holders = await this.stablecoin.getHolders(1n);

    const rows: Array<[string, string]> = holders.slice(0, limit).map((holder) => [
      holder.owner.toBase58().slice(0, 10) + "…",
      formatTokenAmount(holder.balance, decimals),
    ] as [string, string]);

    return rows.length > 0 ? rows : [["No holders", "—"]];
  }

  ensureWritable(): SolanaStablecoin {
    if (!this.stablecoin || !this.wallet) {
      throw new Error("Wallet or mint missing. Run with --wallet and --mint for write operations");
    }
    return this.stablecoin;
  }

  async mint(recipient: string, amountBaseUnits: bigint): Promise<string> {
    const stable = this.ensureWritable();
    return stable.mintTokens({ recipient: new PublicKey(recipient), amount: amountBaseUnits, minter: this.wallet! });
  }

  async burn(from: string, amountBaseUnits: bigint): Promise<string> {
    const stable = this.ensureWritable();
    return stable.burn(new PublicKey(from), amountBaseUnits);
  }

  async transfer(to: string, amountBaseUnits: bigint): Promise<string> {
    const stable = this.ensureWritable();
    return stable.transfer({ from: this.wallet!, to: new PublicKey(to), amount: amountBaseUnits });
  }

  async togglePause(currentlyPaused: boolean): Promise<string> {
    const stable = this.ensureWritable();
    return currentlyPaused ? stable.unpause() : stable.pause();
  }

  async addMinter(minter: string, quota: bigint): Promise<string> {
    const stable = this.ensureWritable();
    return stable.addMinter(new PublicKey(minter), quota);
  }

  async removeMinter(minter: string): Promise<string> {
    const stable = this.ensureWritable();
    return stable.removeMinter(new PublicKey(minter));
  }

  async freeze(account: string): Promise<string> {
    const stable = this.ensureWritable();
    return stable.freeze(new PublicKey(account));
  }

  async thaw(account: string): Promise<string> {
    const stable = this.ensureWritable();
    return stable.thaw(new PublicKey(account));
  }

  async blacklistAdd(address: string, reason: string): Promise<string> {
    const stable = this.ensureWritable();
    return stable.compliance.blacklistAdd(new PublicKey(address), reason);
  }

  async blacklistRemove(address: string, reason: string): Promise<string> {
    const stable = this.ensureWritable();
    return stable.compliance.blacklistRemove(new PublicKey(address), reason);
  }

  async seize(targetWallet: string, treasuryWallet: string): Promise<string> {
    const stable = this.ensureWritable();
    return stable.compliance.seize(new PublicKey(targetWallet), new PublicKey(treasuryWallet));
  }

  async detectCapabilities(): Promise<TuiCapabilities> {
    const emptyRoles: RoleFlags = {
      isMaster: false,
      isMinter: false,
      isBurner: false,
      isPauser: false,
      isFreezer: false,
      isBlacklister: false,
      isSeizer: false,
    };

    if (!this.stablecoin || !this.mintAddress) {
      return {
        preset: "unknown",
        roles: emptyRoles,
        operations: this.buildOperations("unknown", emptyRoles),
      };
    }

    const state = await this.stablecoin.getState();
    const walletPk = this.wallet?.publicKey?.toBase58();
    const minters = await this.safeListMinters();
    const activeMinterSet = new Set(
      minters.filter((m) => m.active).map((m) => m.address.toBase58()),
    );

    const roles: RoleFlags = {
      isMaster: walletPk !== undefined && state.masterAuthority?.toBase58?.() === walletPk,
      isMinter: walletPk !== undefined && activeMinterSet.has(walletPk),
      isBurner: walletPk !== undefined && state.burner?.toBase58?.() === walletPk,
      isPauser: walletPk !== undefined && state.pauser?.toBase58?.() === walletPk,
      isFreezer: walletPk !== undefined && state.freezer?.toBase58?.() === walletPk,
      isBlacklister: walletPk !== undefined && state.blacklister?.toBase58?.() === walletPk,
      isSeizer: walletPk !== undefined && state.seizer?.toBase58?.() === walletPk,
    };

    const preset: TuiCapabilities["preset"] = state.complianceEnabled ? "SSS-2" : "SSS-1";

    return {
      preset,
      roles,
      operations: this.buildOperations(preset, roles),
    };
  }

  private buildOperations(
    preset: TuiCapabilities["preset"],
    roles: RoleFlags,
  ): OperationItem[] {
    const writable = this.hasWritableClient();
    const can = (allowed: boolean): boolean => writable && allowed;

    const common: OperationItem[] = [
      {
        id: OperationId.Mint,
        label: "Mint Tokens",
        enabled: can(roles.isMinter),
        reason: "Requires minter role",
      },
      {
        id: OperationId.Burn,
        label: "Burn Tokens",
        enabled: can(true),
        reason: "Requires connected wallet (burner/master can burn others in SSS-2 with permanent delegate)",
      },
      {
        id: OperationId.Transfer,
        label: "Transfer Tokens",
        enabled: can(true),
        reason: "Requires connected wallet",
      },
      {
        id: OperationId.PauseToggle,
        label: "Pause / Unpause",
        enabled: can(roles.isPauser),
        reason: "Requires pauser role",
      },
      {
        id: OperationId.AddMinter,
        label: "Add Minter",
        enabled: can(roles.isMaster),
        reason: "Requires master role",
      },
      {
        id: OperationId.RemoveMinter,
        label: "Remove Minter",
        enabled: can(roles.isMaster),
        reason: "Requires master role",
      },
      {
        id: OperationId.Freeze,
        label: "Freeze Account",
        enabled: can(roles.isFreezer),
        reason: "Requires freezer role",
      },
      {
        id: OperationId.Thaw,
        label: "Thaw Account",
        enabled: can(roles.isFreezer),
        reason: "Requires freezer role",
      },
    ];

    const sss2: OperationItem[] = preset === "SSS-2"
      ? [
          {
            id: OperationId.BlacklistAdd,
            label: "Blacklist Address",
            enabled: can(roles.isBlacklister),
            reason: "Requires blacklister role",
          },
          {
            id: OperationId.BlacklistRemove,
            label: "Unblacklist Address",
            enabled: can(roles.isBlacklister),
            reason: "Requires blacklister role",
          },
          {
            id: OperationId.Seize,
            label: "Seize Blacklisted",
            enabled: can(roles.isSeizer),
            reason: "Requires seizer role",
          },
        ]
      : [];

    const refresh: OperationItem = {
      id: OperationId.Refresh,
      label: "Refresh Data",
      enabled: true,
    };

    const merged = [...common, ...sss2, refresh];
    if (writable) return merged;

    return merged.map((item) =>
      item.id === OperationId.Refresh
        ? item
        : { ...item, enabled: false, reason: "Connect wallet + mint for write actions" },
    );
  }

  private async safeListMinters(): Promise<Array<{
    address: PublicKey;
    quota: bigint;
    mintedTotal: bigint;
    active: boolean;
  }>> {
    if (!this.stablecoin) return [];
    try {
      const raw = await this.stablecoin.listMinters();
      return (raw as Array<any>).map((minter) => ({
        address: minter.address,
        quota: BigInt(minter.quota ?? 0),
        mintedTotal: BigInt(minter.mintedTotal ?? minter.mintedThisEpoch ?? 0),
        active: !!minter.active,
      }));
    } catch {
      return [];
    }
  }
}
