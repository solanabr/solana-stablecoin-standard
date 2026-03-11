import { Connection, PublicKey } from "@solana/web3.js";
import { withTransaction } from "@sss/shared";
import {
  decodeEventsFromLogs,
  decodeEventsFromInnerInstructions,
  type InnerInstructionGroup,
} from "@sss/shared";
import { Logger } from "@sss/shared";
import {
  getCursor,
  processEvent,
  updateCursor,
  publishProcessedEvent,
} from "./processor";

interface PollerOptions {
  connection: Connection;
  programId: string;
  pollIntervalMs: number;
  pollLimit: number;
  logger: Logger;
  /** When true, log verbose tx/CPI diagnostics (Tx parsed, Inner ix resolution, Decoded events, CPI decode failures). */
  debugLogs?: boolean;
}

function getAccountKeysFromTransaction(
  transaction: unknown,
  loadedAddresses?: { writable?: string[]; readonly?: string[] },
): string[] {
  const tx = transaction as {
    message?: {
      getAccountKeys?: (config?: { loadedAddresses?: { writable: PublicKey[]; readonly: PublicKey[] } }) => PublicKey[];
      accountKeys?: Array<{ toBase58?: () => string; pubkey?: string }>;
      staticAccountKeys?: string[];
    };
  };
  if (!tx?.message) return [];

  const loaded =
    loadedAddresses &&
    (loadedAddresses.writable?.length || loadedAddresses.readonly?.length)
      ? {
          writable: (loadedAddresses.writable ?? []).map((s) => new PublicKey(s)),
          readonly: (loadedAddresses.readonly ?? []).map((s) => new PublicKey(s)),
        }
      : undefined;

  if (typeof tx.message.getAccountKeys === "function") {
    try {
      const keys = tx.message.getAccountKeys({ loadedAddresses: loaded });
      return keys.map((k: PublicKey) => k.toBase58());
    } catch {
      // Fall through to static + loaded
    }
  }

  const staticKeys = tx.message.staticAccountKeys ?? tx.message.accountKeys ?? [];
  const staticStr = staticKeys.map((k: { toBase58?: () => string; pubkey?: string } | string) =>
    typeof k === "string" ? k : typeof (k as { toBase58?: () => string }).toBase58 === "function" ? (k as { toBase58: () => string }).toBase58() : (k as { pubkey?: string }).pubkey ?? String(k),
  );
  const writable = loadedAddresses?.writable ?? [];
  const readonly = loadedAddresses?.readonly ?? [];
  return [...staticStr, ...writable, ...readonly];
}

export class Poller {
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: PollerOptions) {}

  start(): void {
    this.running = true;
    this.opts.logger.info(
      { programId: this.opts.programId, intervalMs: this.opts.pollIntervalMs },
      "Poller started",
    );
    void this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.opts.logger.info("Poller stopped");
  }

  private schedule(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => void this.poll(), this.opts.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    const { connection, programId, pollLimit, logger } = this.opts;
    const debugLogs = this.opts.debugLogs ?? false;
    const programPubkey = new PublicKey(programId);

    try {
      const lastSig = await withTransaction(async (client) => {
        const cursor = await getCursor(client, programId);
        return cursor.lastSignature;
      });

      const signatures = await connection.getSignaturesForAddress(
        programPubkey,
        {
          until: lastSig ?? undefined,
          limit: pollLimit,
        },
        "confirmed",
      );

      if (signatures.length === 0) {
        this.schedule();
        return;
      }

      // Process oldest first
      const ordered = [...signatures].reverse();
      logger.debug({ count: ordered.length }, "Fetched signatures");

      for (const sigInfo of ordered) {
        if (!this.running) break;

        const txResponse = await connection.getTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        });

        if (!txResponse || !txResponse.meta) {
          logger.debug(
            { signature: sigInfo.signature, hasTx: !!txResponse, hasMeta: !!txResponse?.meta },
            "Tx fetch skip: no tx or no meta",
          );
          continue;
        }

        const meta = txResponse.meta as {
          innerInstructions?: InnerInstructionGroup[];
          inner_instructions?: InnerInstructionGroup[];
          logMessages?: string[];
          log_messages?: string[];
          loadedAddresses?: { writable?: string[]; readonly?: string[] };
          loaded_addresses?: { writable?: string[]; readonly?: string[] };
        };
        const innerGroups =
          meta.innerInstructions ??
          meta.inner_instructions ??
          [];
        const logMessages = meta.logMessages ?? meta.log_messages ?? [];
        const loadedAddresses = meta.loadedAddresses ?? meta.loaded_addresses;

        const accountKeys = getAccountKeysFromTransaction(
          txResponse.transaction,
          loadedAddresses,
        );

        if (accountKeys.length === 0) {
          logger.warn(
            { signature: sigInfo.signature },
            "Tx has no account keys extracted; CPI events cannot be matched",
          );
        }

        if (debugLogs) {
          logger.info(
            {
              signature: sigInfo.signature,
              slot: sigInfo.slot,
              innerGroupCount: innerGroups.length,
              totalInnerIxCount: innerGroups.reduce((n, g) => n + g.instructions.length, 0),
              logMessageCount: logMessages.length,
              accountKeyCount: accountKeys.length,
            },
            "Tx parsed: meta counts",
          );

          const innerIxProgramIds = innerGroups.flatMap((g, gi) =>
            g.instructions.map((ix, ii) => {
              const progIndex = ix.programIdIndex ?? (ix as { program_id_index?: number }).program_id_index;
              const resolved = progIndex != null ? accountKeys[progIndex] : undefined;
              return { groupIndex: gi, innerIndex: ii, programIdIndex: progIndex, programId: resolved };
            }),
          );
          const ourProgramIndex = accountKeys.indexOf(programId);
          const matchingInnerIx = innerIxProgramIds.filter((p) => p.programId === programId);

          logger.info(
            {
              signature: sigInfo.signature,
              expectedProgramId: programId,
              ourProgramIndexInAccountKeys: ourProgramIndex >= 0 ? ourProgramIndex : null,
              accountKeyIndicesUsedByInnerIx: [...new Set(innerIxProgramIds.map((p) => p.programIdIndex))],
              innerIxMatchingOurProgram: matchingInnerIx.length,
              matchingIndices: matchingInnerIx.map((p) => p.programIdIndex),
            },
            "Inner ix program id resolution",
          );

          for (let gi = 0; gi < innerGroups.length; gi++) {
            const g = innerGroups[gi];
            for (let ii = 0; ii < g.instructions.length; ii++) {
              const ix = g.instructions[ii];
              const progIndex = ix.programIdIndex ?? (ix as { program_id_index?: number }).program_id_index;
              const resolvedProgramId = progIndex != null ? accountKeys[progIndex] : undefined;
              const dataStr = typeof ix.data === "string" ? ix.data : (ix.data as { data?: string[] })?.data?.[0];
              logger.debug(
                {
                  signature: sigInfo.signature,
                  groupIndex: gi,
                  innerIndex: ii,
                  programIdIndex: progIndex,
                  resolvedProgramId,
                  isOurProgram: resolvedProgramId === programId,
                  dataLength: dataStr?.length ?? 0,
                  dataPreview: dataStr ? `${dataStr.slice(0, 24)}...` : undefined,
                },
                "Inner instruction",
              );
            }
          }
        }

        const eventsFromCpi = decodeEventsFromInnerInstructions(
          innerGroups,
          accountKeys,
          programId,
          debugLogs ? logger : undefined,
        );
        const eventsFromLogs = decodeEventsFromLogs(logMessages);
        const events =
          eventsFromCpi.length > 0 ? eventsFromCpi : eventsFromLogs;

        if (debugLogs) {
          logger.info(
            {
              signature: sigInfo.signature,
              eventsFromCpi: eventsFromCpi.length,
              eventsFromLogs: eventsFromLogs.length,
              eventNames: events.map((e) => e.name),
            },
            "Decoded events",
          );
        }

        if (events.length === 0) {
          if (debugLogs) {
            logger.debug(
              { signature: sigInfo.signature },
              "No SSS events in tx, updating cursor and skipping",
            );
          }
          await withTransaction(async (client) => {
            await updateCursor(client, programId, sigInfo.signature, sigInfo.slot);
          });
          continue;
        }

        await withTransaction(async (client) => {
          for (const event of events) {
            const result = await processEvent(
              client,
              event,
              sigInfo.signature,
              sigInfo.slot,
              sigInfo.blockTime ?? null,
              logger,
            );

            if (result) {
              await publishProcessedEvent(
                result.eventId,
                result.eventType,
                result.mint,
                sigInfo.slot,
                sigInfo.signature,
                event.data,
              );
            }
          }
          await updateCursor(client, programId, sigInfo.signature, sigInfo.slot);
        });
        if (debugLogs) {
          logger.info(
            { signature: sigInfo.signature, eventCount: events.length },
            "Tx events written and cursor updated",
          );
        }
      }

      logger.info(
        { processed: ordered.length, latest: ordered[ordered.length - 1]?.signature },
        "Poll complete",
      );
    } catch (err) {
      logger.error({ err }, "Poll error");
    }

    this.schedule();
  }
}
