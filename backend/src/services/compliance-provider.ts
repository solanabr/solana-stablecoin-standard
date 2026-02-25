import { logger } from "./logger";

export interface ScreeningResult {
  approved: boolean;
  reason?: string;
  provider: string;
  checkedAt: Date;
}

export interface ComplianceProvider {
  screenAddress(address: string): Promise<ScreeningResult>;
  screenTransaction(params: {
    from?: string;
    to: string;
    amount: string;
    action: "mint" | "burn" | "transfer";
  }): Promise<ScreeningResult>;
}

/**
 * Default no-op provider. Replace with Chainalysis, Elliptic, or TRM Labs
 * integration for production use.
 */
class DefaultComplianceProvider implements ComplianceProvider {
  async screenAddress(address: string): Promise<ScreeningResult> {
    logger.info("Compliance screening (no-op)", { address });
    return {
      approved: true,
      provider: "default",
      checkedAt: new Date(),
    };
  }

  async screenTransaction(params: {
    from?: string;
    to: string;
    amount: string;
    action: "mint" | "burn" | "transfer";
  }): Promise<ScreeningResult> {
    logger.info("Transaction screening (no-op)", params);
    return {
      approved: true,
      provider: "default",
      checkedAt: new Date(),
    };
  }
}

let provider: ComplianceProvider = new DefaultComplianceProvider();

export function setComplianceProvider(p: ComplianceProvider): void {
  provider = p;
}

export function getComplianceProvider(): ComplianceProvider {
  return provider;
}
