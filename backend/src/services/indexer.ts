import { Connection, PublicKey, Logs } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { logger } from '../utils/logger.js';
import { dispatchWebhook } from '../routes/webhooks.js';

// SSS Program IDs
const SSS_TOKEN_PROGRAM = new PublicKey(
  process.env.SSS_PROGRAM_ID || '11111111111111111111111111111111'
);
const SSS_TRANSFER_HOOK = new PublicKey(
  process.env.SSS_TRANSFER_HOOK_ID || '11111111111111111111111111111111'
);

interface IndexerConfig {
  rpcUrl: string;
  programIds: PublicKey[];
  batchSize: number;
  pollInterval: number;
}

interface ParsedEvent {
  type: string;
  signature: string;
  slot: number;
  timestamp: number;
  data: Record<string, unknown>;
}

const includeToken2022Logs = process.env.INDEXER_INCLUDE_TOKEN_2022 === 'true';

export class SolanaIndexer {
  private connection: Connection;
  private config: IndexerConfig;
  private subscriptionIds: number[] = [];
  private isRunning = false;

  constructor(config?: Partial<IndexerConfig>) {
    this.config = {
      rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      // Default: only subscribe to SSS programs. Token-2022 global logs are extremely high-volume.
      programIds: includeToken2022Logs
        ? [SSS_TOKEN_PROGRAM, SSS_TRANSFER_HOOK, TOKEN_2022_PROGRAM_ID]
        : [SSS_TOKEN_PROGRAM, SSS_TRANSFER_HOOK],
      batchSize: 100,
      pollInterval: 1000,
      ...config,
    };

    this.connection = new Connection(this.config.rpcUrl, 'confirmed');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Indexer already running');
      return;
    }

    this.isRunning = true;
    logger.info('🔍 Starting Solana indexer...');

    // Subscribe to logs for each program
    for (const programId of this.config.programIds) {
      try {
        const subId = this.connection.onLogs(
          programId,
          (logs) => this.handleLogs(logs, programId),
          'confirmed'
        );
        this.subscriptionIds.push(subId);
        logger.info(`Subscribed to logs for ${programId.toBase58()}`);
      } catch (error) {
        logger.error(`Failed to subscribe to ${programId.toBase58()}:`, error);
      }
    }

    // Start historical sync
    this.syncHistorical();

    logger.info('✅ Indexer started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info('Stopping indexer...');

    // Unsubscribe from all logs
    for (const subId of this.subscriptionIds) {
      try {
        await this.connection.removeOnLogsListener(subId);
      } catch (error) {
        logger.error('Failed to remove log listener:', error);
      }
    }

    this.subscriptionIds = [];
    logger.info('Indexer stopped');
  }

  private async handleLogs(logs: Logs, programId: PublicKey): Promise<void> {
    try {
      const { signature, err, logs: logMessages } = logs;

      if (err) {
        logger.debug(`Transaction ${signature} failed:`, err);
        return;
      }

      const event = this.parseLogMessages(logMessages, signature, programId);
      
      if (event) {
        await this.processEvent(event);
      }
    } catch (error) {
      logger.error('Error handling logs:', error);
    }
  }

  private parseLogMessages(
    logMessages: string[],
    signature: string,
    programId: PublicKey
  ): ParsedEvent | null {
    // Parse SSS-specific log patterns
    for (const log of logMessages) {
      // Transfer events
      if (log.includes('Transfer') || log.includes('TransferChecked')) {
        return {
          type: 'transfer',
          signature,
          slot: 0,
          timestamp: Date.now(),
          data: {
            programId: programId.toBase58(),
            raw: log,
          },
        };
      }

      // Confidential Transfer events
      if (log.includes('ConfidentialTransfer')) {
        const ctType = log.includes('Deposit')
          ? 'confidential_deposit'
          : log.includes('Withdraw')
          ? 'confidential_withdraw'
          : 'confidential_transfer';

        return {
          type: ctType,
          signature,
          slot: 0,
          timestamp: Date.now(),
          data: {
            programId: programId.toBase58(),
            raw: log,
          },
        };
      }

      // Mint events
      if (log.includes('MintTo') || log.includes('MintToChecked')) {
        return {
          type: 'mint',
          signature,
          slot: 0,
          timestamp: Date.now(),
          data: {
            programId: programId.toBase58(),
            raw: log,
          },
        };
      }

      // Burn events
      if (log.includes('Burn') || log.includes('BurnChecked')) {
        return {
          type: 'burn',
          signature,
          slot: 0,
          timestamp: Date.now(),
          data: {
            programId: programId.toBase58(),
            raw: log,
          },
        };
      }

      // Freeze events
      if (log.includes('FreezeAccount') || log.includes('ThawAccount')) {
        return {
          type: 'freeze',
          signature,
          slot: 0,
          timestamp: Date.now(),
          data: {
            programId: programId.toBase58(),
            action: log.includes('Freeze') ? 'freeze' : 'thaw',
            raw: log,
          },
        };
      }
    }

    return null;
  }

  private async processEvent(event: ParsedEvent): Promise<void> {
    logger.debug(`Processing event: ${event.type} - ${event.signature}`);

    // Store in database (implement with your DB of choice)
    await this.storeEvent(event);

    // Dispatch webhooks
    await dispatchWebhook(event.type, {
      event: event.type,
      signature: event.signature,
      timestamp: new Date(event.timestamp).toISOString(),
      data: event.data,
    });

    // Update metrics
    this.updateMetrics(event);
  }

  private async storeEvent(event: ParsedEvent): Promise<void> {
    // In production, store to PostgreSQL/TimescaleDB
    // This is a placeholder for the database operation
    logger.debug(`Storing event ${event.signature} of type ${event.type}`);
  }

  private updateMetrics(event: ParsedEvent): void {
    // Update Prometheus metrics or internal counters
    logger.debug(`Updated metrics for ${event.type}`);
  }

  private async syncHistorical(): Promise<void> {
    logger.info('Starting historical sync...');

    try {
      // Get recent signatures for each program
      for (const programId of this.config.programIds) {
        const signatures = await this.connection.getSignaturesForAddress(
          programId,
          { limit: this.config.batchSize }
        );

        logger.info(
          `Found ${signatures.length} recent transactions for ${programId.toBase58()}`
        );

        // Process in batches
        for (const sig of signatures) {
          if (!this.isRunning) break;

          try {
            const tx = await this.connection.getParsedTransaction(
              sig.signature,
              { maxSupportedTransactionVersion: 0 }
            );

            if (tx?.meta?.logMessages) {
              const event = this.parseLogMessages(
                tx.meta.logMessages,
                sig.signature,
                programId
              );

              if (event) {
                event.slot = sig.slot;
                event.timestamp = (sig.blockTime || 0) * 1000;
                await this.processEvent(event);
              }
            }
          } catch (error) {
            logger.error(`Failed to process ${sig.signature}:`, error);
          }

          // Rate limit
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      logger.info('Historical sync complete');
    } catch (error) {
      logger.error('Historical sync failed:', error);
    }
  }

  async getStatus(): Promise<{
    running: boolean;
    subscriptions: number;
    lastSlot: number;
    rpcUrl: string;
  }> {
    const slot = await this.connection.getSlot();
    return {
      running: this.isRunning,
      subscriptions: this.subscriptionIds.length,
      lastSlot: slot,
      rpcUrl: this.config.rpcUrl,
    };
  }
}

// Singleton instance
let indexerInstance: SolanaIndexer | null = null;

export function getIndexer(): SolanaIndexer {
  if (!indexerInstance) {
    indexerInstance = new SolanaIndexer();
  }
  return indexerInstance;
}

export async function startIndexer(): Promise<void> {
  const indexer = getIndexer();
  await indexer.start();
}

export async function stopIndexer(): Promise<void> {
  if (indexerInstance) {
    await indexerInstance.stop();
    indexerInstance = null;
  }
}
