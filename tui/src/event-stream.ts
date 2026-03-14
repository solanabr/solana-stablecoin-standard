import { BorshCoder, EventParser, Idl } from "@coral-xyz/anchor";
import { Connection, Logs, PublicKey } from "@solana/web3.js";
import SSS_TOKEN_IDL from "solana-stablecoin-sdk/dist/idl/sss_token.json";
import { UiEventItem } from "./types";
import { shortPk } from "./format";

type IdlWithAddress = Idl & { address: string };

export class EventStream {
  private subscriptionId: number | null = null;

  constructor(
    private readonly connection: Connection,
    private readonly mint: string,
    private readonly onEvent: (event: UiEventItem) => void,
    private readonly onError: (error: Error) => void,
  ) {}

  start(): void {
    try {
      const idl = SSS_TOKEN_IDL as IdlWithAddress;
      const coder = new BorshCoder(idl);
      const programId = new PublicKey(idl.address);
      const parser = new EventParser(programId, coder);

      this.subscriptionId = this.connection.onLogs(programId, (logs: Logs) => {
        try {
          for (const parsed of parser.parseLogs(logs.logs)) {
            const data = parsed.data as Record<string, unknown>;
            const mint = (data.mint as { toBase58?: () => string })?.toBase58?.() ?? "";
            if (mint !== this.mint) continue;

            this.onEvent({
              name: parsed.name,
              signature: logs.signature,
              timestamp: Date.now(),
              summary: this.formatSummary(parsed.name, data),
              primaryAddress: this.extractPrimaryAddress(parsed.name, data),
            });
          }
        } catch (error) {
          this.onError(error as Error);
        }
      }, "confirmed");
    } catch (error) {
      this.onError(error as Error);
    }
  }

  async stop(): Promise<void> {
    if (this.subscriptionId !== null) {
      await this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
    }
  }

  private formatSummary(name: string, data: Record<string, unknown>): string {
    const asPk = (value: unknown) => {
      const raw = (value as { toBase58?: () => string })?.toBase58?.();
      return raw ? shortPk(raw) : "—";
    };
    const asAmount = (value: unknown) => {
      const num = typeof value === "bigint" ? value.toString() : String(value ?? "0");
      return num;
    };

    switch (name) {
      case "TokensMinted":
        return `Minted ${asAmount(data.amount)} → ${asPk(data.recipient)}`;
      case "TokensBurned":
        return `Burned ${asAmount(data.amount)} from ${asPk(data.from)}`;
      case "MinterUpdated":
        return `${data.active ? "Enabled" : "Disabled"} minter ${asPk(data.minter)}`;
      case "ProtocolPaused":
        return "Protocol paused";
      case "ProtocolUnpaused":
        return "Protocol unpaused";
      case "AccountFrozen":
        return `Account frozen ${asPk(data.account)}`;
      case "AccountThawed":
        return `Account thawed ${asPk(data.account)}`;
      case "AddressBlacklisted":
        return `Blacklisted ${asPk(data.address)}`;
      case "AddressUnblacklisted":
        return `Unblacklisted ${asPk(data.address)}`;
      case "TokensSeized":
        return `Seized ${asAmount(data.amount)} from ${asPk(data.from)}`;
      default:
        return `${name} • tx ${shortPk(String(data.mint ?? ""), 4)}`;
    }
  }

  private extractPrimaryAddress(name: string, data: Record<string, unknown>): string | undefined {
    const readPk = (value: unknown): string | undefined =>
      (value as { toBase58?: () => string })?.toBase58?.();

    switch (name) {
      case "TokensMinted":
        return readPk(data.recipient);
      case "TokensBurned":
        return readPk(data.from);
      case "MinterUpdated":
        return readPk(data.minter);
      case "AccountFrozen":
      case "AccountThawed":
        return readPk(data.account);
      case "AddressBlacklisted":
      case "AddressUnblacklisted":
        return readPk(data.address);
      case "TokensSeized":
        return readPk(data.from);
      default:
        return undefined;
    }
  }
}
