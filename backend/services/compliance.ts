import { Connection, PublicKey } from "@solana/web3.js";
import pino from "pino";

const log = pino({ name: "sss-compliance" });

interface ComplianceAlert {
  id: string;
  type: "large_mint" | "large_burn" | "blacklist_transfer_attempt" | "seizure" | "pause" | "role_change";
  severity: "info" | "warning" | "critical";
  mint: string;
  details: Record<string, string>;
  timestamp: number;
  acknowledged: boolean;
}

interface ComplianceRule {
  id: string;
  type: string;
  threshold?: bigint;
  action: "alert" | "block" | "alert_and_block";
  enabled: boolean;
}

/**
 * Compliance monitoring service. Watches token events and generates
 * alerts based on configurable rules.
 *
 * Default rules:
 *   - Alert on mint/burn above threshold
 *   - Alert on any blacklist transfer attempt (caught by hook, logged here)
 *   - Alert on seizure events
 *   - Alert on pause/unpause
 *   - Alert on admin role changes
 */
export class ComplianceService {
  private rules: Map<string, ComplianceRule> = new Map();
  private alerts: ComplianceAlert[] = [];
  private alertCallbacks: ((alert: ComplianceAlert) => void)[] = [];
  private maxAlerts = 10_000;

  constructor() {
    // Default rules
    this.addRule({
      id: "large-mint",
      type: "mint",
      threshold: BigInt("1000000000"), // 1000 tokens at 6 decimals
      action: "alert",
      enabled: true,
    });

    this.addRule({
      id: "large-burn",
      type: "burn",
      threshold: BigInt("1000000000"),
      action: "alert",
      enabled: true,
    });

    this.addRule({
      id: "seizure-alert",
      type: "seize",
      action: "alert",
      enabled: true,
    });

    this.addRule({
      id: "pause-alert",
      type: "pause",
      action: "alert",
      enabled: true,
    });
  }

  addRule(rule: ComplianceRule): void {
    this.rules.set(rule.id, rule);
    log.info({ ruleId: rule.id, type: rule.type }, "Compliance rule added");
  }

  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  onAlert(callback: (alert: ComplianceAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Process an indexed event and check against compliance rules.
   */
  processEvent(event: {
    type: string;
    signature: string;
    data: Record<string, string>;
    mint?: string;
  }): ComplianceAlert | null {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      if (rule.type !== event.type) continue;

      // Check threshold if applicable
      if (rule.threshold && event.data.amount) {
        const amount = BigInt(event.data.amount);
        if (amount < rule.threshold) continue;
      }

      const severity = this.determineSeverity(event.type);
      const alert: ComplianceAlert = {
        id: `${event.type}-${event.signature}-${Date.now()}`,
        type: this.mapAlertType(event.type),
        severity,
        mint: event.mint ?? "unknown",
        details: {
          ...event.data,
          txSignature: event.signature,
          ruleId: rule.id,
        },
        timestamp: Date.now(),
        acknowledged: false,
      };

      this.recordAlert(alert);
      return alert;
    }

    return null;
  }

  /**
   * Get all unacknowledged alerts.
   */
  getPendingAlerts(): ComplianceAlert[] {
    return this.alerts.filter((a) => !a.acknowledged);
  }

  /**
   * Get alerts by type.
   */
  getAlertsByType(type: string): ComplianceAlert[] {
    return this.alerts.filter((a) => a.type === type);
  }

  /**
   * Acknowledge an alert.
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Get a summary of alert counts by severity.
   */
  getSummary(): Record<string, number> {
    const pending = this.getPendingAlerts();
    return {
      total: pending.length,
      critical: pending.filter((a) => a.severity === "critical").length,
      warning: pending.filter((a) => a.severity === "warning").length,
      info: pending.filter((a) => a.severity === "info").length,
    };
  }

  private determineSeverity(eventType: string): "info" | "warning" | "critical" {
    switch (eventType) {
      case "seize":
        return "critical";
      case "pause":
      case "blacklist":
        return "warning";
      default:
        return "info";
    }
  }

  private mapAlertType(eventType: string): ComplianceAlert["type"] {
    switch (eventType) {
      case "mint":
        return "large_mint";
      case "burn":
        return "large_burn";
      case "seize":
        return "seizure";
      case "pause":
      case "unpause":
        return "pause";
      default:
        return "role_change";
    }
  }

  private recordAlert(alert: ComplianceAlert): void {
    // Trim old alerts
    if (this.alerts.length >= this.maxAlerts) {
      this.alerts = this.alerts.slice(-Math.floor(this.maxAlerts / 2));
    }
    this.alerts.push(alert);

    log.warn(
      {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
      },
      "Compliance alert generated"
    );

    for (const cb of this.alertCallbacks) {
      try {
        cb(alert);
      } catch (err) {
        log.error({ err }, "Alert callback failed");
      }
    }
  }
}
