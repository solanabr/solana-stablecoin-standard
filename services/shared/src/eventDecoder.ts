import path from "path";
import { BorshCoder, EventParser, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "@stbr/sss-token";
import bs58 from "bs58";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const IDL = require(path.join(__dirname, "idl", "sss.json")) as Idl;

/**
 * Anchor event CPI instruction tag: first 8 bytes of sha256("anchor:event").
 * The CPI instruction data is [this tag (8 bytes)] + [event discriminator (8 bytes)] + [event Borsh payload].
 * We must skip this prefix before passing to coder.events.decode().
 * See https://stackoverflow.com/questions/79242511/why-are-emit-cpi-calls-prefixed-with-e4-45-a5-2e-51-cb-9a-1d-hex
 */
const ANCHOR_EVENT_CPI_TAG = Buffer.from([
  0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d,
]);

/**
 * Decode inner instruction data string to raw bytes.
 * Solana RPC returns instruction data as base58 (see https://www.anchor-lang.com/docs/features/events).
 * Some providers or explorers may use base64 or hex.
 */
function instructionDataToBuffer(dataStr: string): Buffer | null {
  if (!dataStr || dataStr.length < 12) return null;
  try {
    const b58 = bs58.decode(dataStr);
    return Buffer.from(b58);
  } catch {
    // not base58
  }
  try {
    return Buffer.from(dataStr, "base64");
  } catch {
    // not base64
  }
  if (/^[0-9a-fA-F]+$/.test(dataStr) && dataStr.length % 2 === 0) {
    return Buffer.from(dataStr, "hex");
  }
  return null;
}

export interface DecodedSssEvent {
  name: string;
  data: Record<string, unknown>;
}

/** Inner instruction as returned by RPC (data is typically base58 per Anchor / Solana). */
export interface InnerInstruction {
  programIdIndex?: number;
  programId?: string;
  data: string | { type: string; data: string[] };
  accounts?: number[];
}

/** One group of inner instructions (per top-level instruction index). */
export interface InnerInstructionGroup {
  index: number;
  instructions: InnerInstruction[];
}

let _parser: EventParser | null = null;
let _coder: BorshCoder | null = null;

function getParser(): EventParser {
  if (!_parser) {
    const coder = getCoder();
    _parser = new EventParser(PROGRAM_ID, coder);
  }
  return _parser;
}

export function getCoder(): BorshCoder {
  if (!_coder) {
    _coder = new BorshCoder(IDL);
  }
  return _coder;
}

export function decodeEventsFromLogs(
  logs: string[],
): DecodedSssEvent[] {
  const parser = getParser();
  const decoded: DecodedSssEvent[] = [];

  try {
    for (const event of parser.parseLogs(logs)) {
      decoded.push({
        name: event.name,
        data: serializeEventData(event.data as Record<string, unknown>),
      });
    }
  } catch {
    // Logs that don't contain SSS events are silently ignored
  }

  return decoded;
}

/** Optional logger for decode diagnostics (e.g. from poller). */
export type EventDecoderLogger = {
  debug: (obj: Record<string, unknown>, msg: string) => void;
  info?: (obj: Record<string, unknown>, msg: string) => void;
};

/**
 * Extract instruction data as a string or Buffer from various RPC response shapes.
 * RPC can return: string (base58), { data: string }, { data: string[] }, or { data: number[] }.
 * Returns [string, null] for string data, or [null, Buffer] for raw bytes (caller converts to base64).
 */
function extractInstructionData(
  ix: InnerInstruction,
): { dataStr: string | null; dataBuffer: Buffer | null } {
  const d = ix.data;
  if (typeof d === "string" && d.length > 0) return { dataStr: d, dataBuffer: null };
  if (d && typeof d === "object") {
    const o = d as Record<string, unknown>;
    if (Array.isArray(o.data)) {
      const first = o.data[0];
      if (typeof first === "string") return { dataStr: first, dataBuffer: null };
      if (typeof first === "number" || (Array.isArray(o.data) && o.data.length > 0 && typeof o.data[0] === "number")) {
        const buf = Buffer.from(o.data as number[]);
        return { dataStr: null, dataBuffer: buf.length >= 9 ? buf : null };
      }
    }
    if (typeof o.data === "string") return { dataStr: o.data, dataBuffer: null };
  }
  return { dataStr: null, dataBuffer: null };
}

/**
 * Decode SSS events from CPI event instructions (emit_cpi!).
 * The program uses event_cpi, so events are in inner instruction data (8-byte discriminator + Borsh payload), not in logs.
 * Pass inner instruction groups and account keys from the transaction so we can filter by program and decode data.
 */
export function decodeEventsFromInnerInstructions(
  innerInstructionGroups: InnerInstructionGroup[],
  accountKeys: string[],
  programId: string,
  logger?: EventDecoderLogger,
): DecodedSssEvent[] {
  const coder = getCoder();
  const decoded: DecodedSssEvent[] = [];

  for (const group of innerInstructionGroups) {
    for (const ix of group.instructions) {
      const programIdIndex = ix.programIdIndex ?? (ix as { program_id_index?: number }).program_id_index;
      const programIdStr =
        ix.programId ?? (programIdIndex != null ? accountKeys[programIdIndex] : undefined);

      if (logger) {
        const dataShape =
          ix.data && typeof ix.data === "object"
            ? { keys: Object.keys(ix.data as object), hasDataArray: Array.isArray((ix.data as { data?: unknown }).data) }
            : null;
        logger.debug(
          {
            programIdIndex,
            programIdStr: programIdStr ?? null,
            expectedProgramId: programId,
            match: programIdStr === programId,
            dataType: typeof ix.data,
            dataShape,
          },
          "CPI inner ix check",
        );
      }

      if (programIdStr !== programId) continue;

      const { dataStr, dataBuffer: rawBufferFromRpc } = extractInstructionData(ix);
      const failReason = "CPI match but no event decoded";

      if (logger) {
        logger.debug(
          {
            dataStrLength: dataStr?.length ?? 0,
            dataStrPreview: dataStr ? `${dataStr.slice(0, 32)}...` : null,
            hasRawBuffer: !!rawBufferFromRpc,
            rawBufferLen: rawBufferFromRpc?.length ?? 0,
          },
          "CPI data extracted",
        );
      }

      let rawBuffer: Buffer | null = rawBufferFromRpc;
      if (!rawBuffer && dataStr) {
        rawBuffer = instructionDataToBuffer(dataStr);
      }

      if (!rawBuffer || rawBuffer.length < 9) {
        if (!dataStr && !rawBufferFromRpc) {
          logger?.info?.(
            {
              reason: "no_data_str",
              dataKeys: ix.data && typeof ix.data === "object" ? Object.keys(ix.data as object) : null,
            },
            failReason,
          );
        } else {
          logger?.info?.(
            {
              reason: "buffer_null_or_too_short",
              hadDataStr: !!dataStr,
              dataStrLength: dataStr?.length ?? 0,
              rawBufferLen: rawBuffer?.length ?? 0,
              dataKeys: ix.data && typeof ix.data === "object" ? Object.keys(ix.data as object) : null,
            },
            failReason,
          );
        }
        if (logger) {
          logger.debug(
            { rawBufferLen: rawBuffer?.length ?? 0 },
            "CPI skip: no data or buffer too short",
          );
        }
        continue;
      }

      // Anchor emit_cpi! instruction data is [8-byte "anchor:event" tag] + [8-byte event disc] + [payload].
      // Strip the tag so the decoder sees the event discriminator first.
      const eventPayload =
        rawBuffer.length >= 16 && rawBuffer.subarray(0, 8).equals(ANCHOR_EVENT_CPI_TAG)
          ? rawBuffer.subarray(8)
          : rawBuffer;

      const dataBase64 = eventPayload.toString("base64");
      try {
        const event = coder.events.decode(dataBase64);
        if (logger) {
          logger.debug(
            { eventName: event?.name ?? null, decoded: !!event },
            "CPI decode result",
          );
        }
        if (event) {
          decoded.push({
            name: event.name,
            data: serializeEventData(event.data as Record<string, unknown>),
          });
        } else {
          logger?.info?.(
            { reason: "decode_returned_null", dataLen: rawBuffer.length },
            failReason,
          );
        }
      } catch (e) {
        logger?.info?.(
          { reason: "decode_threw", err: e instanceof Error ? e.message : String(e) },
          failReason,
        );
        if (logger) {
          logger.debug(
            { err: e instanceof Error ? e.message : String(e) },
            "CPI decode threw",
          );
        }
      }
    }
  }

  return decoded;
}

function serializeEventData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof PublicKey) {
      result[key] = value.toBase58();
    } else if (typeof value === "bigint") {
      result[key] = value.toString();
    } else if (
      value !== null &&
      typeof value === "object" &&
      "toString" in value &&
      value.constructor?.name === "BN"
    ) {
      result[key] = (value as { toString(): string }).toString();
    } else if (Array.isArray(value)) {
      result[key] = value.map((v) =>
        v instanceof PublicKey ? v.toBase58() : v,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function extractMintFromEvent(event: DecodedSssEvent): string | null {
  const data = event.data;
  if (typeof data.mint === "string") return data.mint;
  return null;
}
