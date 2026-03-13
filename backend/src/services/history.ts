/**
 * Supply history service — tracks supply snapshots over time.
 * @module services/history
 */

export interface SupplySnapshot {
  timestamp: string;
  supply: number;
  minted: number;
  burned: number;
}

export class HistoryService {
  private snapshots: SupplySnapshot[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  /** Record a new supply snapshot */
  record(supply: number, minted: number, burned: number): void {
    this.snapshots.push({
      timestamp: new Date().toISOString(),
      supply,
      minted,
      burned,
    });

    // Trim to max size
    if (this.snapshots.length > this.maxSize) {
      this.snapshots = this.snapshots.slice(-this.maxSize);
    }
  }

  /** Get all snapshots */
  getHistory(): SupplySnapshot[] {
    return [...this.snapshots];
  }

  /** Get snapshot count */
  get size(): number {
    return this.snapshots.length;
  }
}
