import { PoolClient } from "pg";
import {
  DecodedSssEvent,
  extractMintFromEvent,
  publishEvent,
  SSS_EVENTS_CHANNEL,
} from "@sss/shared";
import { Logger } from "@sss/shared";

interface ProcessResult {
  eventId: bigint;
  eventType: string;
  mint: string;
}

export async function processEvent(
  client: PoolClient,
  event: DecodedSssEvent,
  signature: string,
  slot: number,
  blockTime: number | null,
  logger: Logger,
): Promise<ProcessResult | null> {
  const mint = extractMintFromEvent(event);
  if (!mint) {
    logger.warn({ event: event.name, signature }, "Event has no mint field, skipping");
    return null;
  }

  // INSERT into sss_events (upsert on signature)
  const insertResult = await client.query<{ id: string }>(
    `INSERT INTO sss_events (signature, slot, block_time, event_type, mint, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (signature) DO NOTHING
     RETURNING id`,
    [
      signature,
      slot,
      blockTime ? new Date(blockTime * 1000).toISOString() : null,
      event.name,
      mint,
      JSON.stringify(event.data),
    ],
  );

  if (insertResult.rowCount === 0) {
    // Already processed this signature
    return null;
  }

  const eventId = BigInt(insertResult.rows[0].id);

  // Update mint_state based on event type
  await upsertMintState(client, event, mint, slot);

  logger.debug({ eventType: event.name, mint, signature, eventId: eventId.toString() }, "Event processed");

  return { eventId, eventType: event.name, mint };
}

async function upsertMintState(
  client: PoolClient,
  event: DecodedSssEvent,
  mint: string,
  slot: number,
): Promise<void> {
  // Ensure the row exists
  await client.query(
    `INSERT INTO mint_state (mint, total_supply, is_paused, last_slot)
     VALUES ($1, 0, false, $2)
     ON CONFLICT (mint) DO NOTHING`,
    [mint, slot],
  );

  switch (event.name) {
    case "MintTokensEvent": {
      const amount = BigInt(String(event.data.amount ?? 0));
      await client.query(
        `UPDATE mint_state
         SET total_supply = total_supply + $1, last_slot = GREATEST(last_slot, $2), updated_at = now()
         WHERE mint = $3`,
        [amount.toString(), slot, mint],
      );
      break;
    }
    case "BurnTokensEvent": {
      const amount = BigInt(String(event.data.amount ?? 0));
      await client.query(
        `UPDATE mint_state
         SET total_supply = GREATEST(0, total_supply - $1), last_slot = GREATEST(last_slot, $2), updated_at = now()
         WHERE mint = $3`,
        [amount.toString(), slot, mint],
      );
      break;
    }
    case "PauseEvent": {
      await client.query(
        `UPDATE mint_state SET is_paused = true, last_slot = GREATEST(last_slot, $1), updated_at = now() WHERE mint = $2`,
        [slot, mint],
      );
      break;
    }
    case "UnpauseEvent": {
      await client.query(
        `UPDATE mint_state SET is_paused = false, last_slot = GREATEST(last_slot, $1), updated_at = now() WHERE mint = $2`,
        [slot, mint],
      );
      break;
    }
    default: {
      await client.query(
        `UPDATE mint_state SET last_slot = GREATEST(last_slot, $1), updated_at = now() WHERE mint = $2`,
        [slot, mint],
      );
    }
  }
}

export async function updateCursor(
  client: PoolClient,
  programId: string,
  signature: string,
  slot: number,
): Promise<void> {
  await client.query(
    `INSERT INTO indexer_cursor (program_id, last_signature, last_slot)
     VALUES ($1, $2, $3)
     ON CONFLICT (program_id) DO UPDATE
       SET last_signature = $2, last_slot = $3, updated_at = now()`,
    [programId, signature, slot],
  );
}

export async function getCursor(
  client: PoolClient,
  programId: string,
): Promise<{ lastSignature: string | null; lastSlot: number }> {
  const result = await client.query<{
    last_signature: string;
    last_slot: string;
  }>(
    `SELECT last_signature, last_slot FROM indexer_cursor WHERE program_id = $1`,
    [programId],
  );
  if (result.rowCount === 0) return { lastSignature: null, lastSlot: 0 };
  return {
    lastSignature: result.rows[0].last_signature,
    lastSlot: parseInt(result.rows[0].last_slot, 10),
  };
}

export async function publishProcessedEvent(
  eventId: bigint,
  eventType: string,
  mint: string,
  slot: number,
  signature: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await publishEvent(SSS_EVENTS_CHANNEL, {
    eventId: eventId.toString(),
    eventType,
    mint,
    slot,
    signature,
    payload,
  });
}
