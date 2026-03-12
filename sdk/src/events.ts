import { PublicKey } from "@solana/web3.js";
import { BorshCoder, EventParser, Program } from "@coral-xyz/anchor";
import BN from "bn.js";

// Event type definitions matching the IDL
export interface StablecoinInitializedEvent {
  name: "stablecoinInitialized";
  data: {
    config: PublicKey;
    mint: PublicKey;
    masterAuthority: PublicKey;
    name: string;
    symbol: string;
    preset: number;
    timestamp: BN;
  };
}

export interface TokensMintedEvent {
  name: "tokensMinted";
  data: {
    config: PublicKey;
    minter: PublicKey;
    recipient: PublicKey;
    amount: BN;
    totalMinted: BN;
    timestamp: BN;
  };
}

export interface TokensBurnedEvent {
  name: "tokensBurned";
  data: {
    config: PublicKey;
    burner: PublicKey;
    from: PublicKey;
    amount: BN;
    totalBurned: BN;
    timestamp: BN;
  };
}

export interface AccountFrozenEvent {
  name: "accountFrozen";
  data: {
    config: PublicKey;
    authority: PublicKey;
    targetAccount: PublicKey;
    timestamp: BN;
  };
}

export interface AccountThawedEvent {
  name: "accountThawed";
  data: {
    config: PublicKey;
    authority: PublicKey;
    targetAccount: PublicKey;
    timestamp: BN;
  };
}

export interface ProgramPausedEvent {
  name: "programPaused";
  data: {
    config: PublicKey;
    pauser: PublicKey;
    timestamp: BN;
  };
}

export interface ProgramUnpausedEvent {
  name: "programUnpaused";
  data: {
    config: PublicKey;
    pauser: PublicKey;
    timestamp: BN;
  };
}

export interface RoleUpdatedEvent {
  name: "roleUpdated";
  data: {
    config: PublicKey;
    role: string;
    oldHolder: PublicKey;
    newHolder: PublicKey;
    updatedBy: PublicKey;
    timestamp: BN;
  };
}

export interface MinterUpdatedEvent {
  name: "minterUpdated";
  data: {
    config: PublicKey;
    minter: PublicKey;
    isActive: boolean;
    mintQuota: BN;
    updatedBy: PublicKey;
    timestamp: BN;
  };
}

export interface AuthorityTransferredEvent {
  name: "authorityTransferred";
  data: {
    config: PublicKey;
    oldAuthority: PublicKey;
    newAuthority: PublicKey;
    timestamp: BN;
  };
}

export interface AuthorityNominatedEvent {
  name: "authorityNominated";
  data: {
    config: PublicKey;
    oldAuthority: PublicKey;
    nominatedAuthority: PublicKey;
    timestamp: BN;
  };
}

export interface BlacklistAddedEvent {
  name: "blacklistAdded";
  data: {
    config: PublicKey;
    blockedAddress: PublicKey;
    reason: string;
    blacklistedBy: PublicKey;
    timestamp: BN;
  };
}

export interface BlacklistRemovedEvent {
  name: "blacklistRemoved";
  data: {
    config: PublicKey;
    unblockedAddress: PublicKey;
    removedBy: PublicKey;
    timestamp: BN;
  };
}

export interface AllowlistAddedEvent {
  name: "allowlistAdded";
  data: {
    config: PublicKey;
    address: PublicKey;
    addedBy: PublicKey;
    reason: string;
    timestamp: BN;
  };
}

export interface AllowlistRemovedEvent {
  name: "allowlistRemoved";
  data: {
    config: PublicKey;
    address: PublicKey;
    removedBy: PublicKey;
    timestamp: BN;
  };
}

export interface TokensSeizedEvent {
  name: "tokensSeized";
  data: {
    config: PublicKey;
    from: PublicKey;
    amount: BN;
    seizedBy: PublicKey;
    timestamp: BN;
  };
}

export interface AuditLogRecordedEvent {
  name: "auditLogRecorded";
  data: {
    config: PublicKey;
    index: BN;
    action: number;
    actor: PublicKey;
    timestamp: BN;
  };
}

export interface SupplyCapUpdatedEvent {
  name: "supplyCapUpdated";
  data: {
    config: PublicKey;
    oldCap: BN;
    newCap: BN;
    timestamp: BN;
  };
}

export interface MetadataUpdatedEvent {
  name: "metadataUpdated";
  data: {
    config: PublicKey;
    timestamp: BN;
  };
}

export type SSSEvent =
  | StablecoinInitializedEvent
  | TokensMintedEvent
  | TokensBurnedEvent
  | AccountFrozenEvent
  | AccountThawedEvent
  | ProgramPausedEvent
  | ProgramUnpausedEvent
  | RoleUpdatedEvent
  | MinterUpdatedEvent
  | AuthorityTransferredEvent
  | AuthorityNominatedEvent
  | BlacklistAddedEvent
  | BlacklistRemovedEvent
  | AllowlistAddedEvent
  | AllowlistRemovedEvent
  | TokensSeizedEvent
  | AuditLogRecordedEvent
  | SupplyCapUpdatedEvent
  | MetadataUpdatedEvent;

export function createEventParser(program: Program): EventParser {
  return new EventParser(program.programId, new BorshCoder(program.idl));
}

export function parseTransactionEvents(
  program: Program,
  logs: string[]
): SSSEvent[] {
  const parser = createEventParser(program);
  const events: SSSEvent[] = [];
  for (const event of parser.parseLogs(logs)) {
    events.push(event as unknown as SSSEvent);
  }
  return events;
}
