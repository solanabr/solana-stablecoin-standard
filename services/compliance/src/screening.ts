import { query } from "@sss/shared";
import { Logger } from "@sss/shared";

export type ScreeningResult = "pass" | "flag" | "block";

export interface ScreeningProvider {
  screen(
    address: string,
  ): Promise<{ result: ScreeningResult; details?: unknown }>;
  readonly name: string;
}

/** No-op stub provider for development (always passes). */
class StubScreeningProvider implements ScreeningProvider {
  readonly name = "stub";

  async screen(
    _address: string,
  ): Promise<{ result: ScreeningResult; details?: unknown }> {
    return { result: "pass", details: { note: "stub provider — always passes" } };
  }
}

/** HTTP-based provider that calls an external sanctions API. */
class HttpScreeningProvider implements ScreeningProvider {
  readonly name = "external";

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  async screen(
    address: string,
  ): Promise<{ result: ScreeningResult; details?: unknown }> {
    const resp = await fetch(`${this.apiUrl}/screen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ address }),
    });

    if (!resp.ok) {
      throw new Error(`Screening API error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as { result: ScreeningResult; details?: unknown };
    return data;
  }
}

export function createScreeningProvider(
  apiUrl?: string,
  apiKey?: string,
): ScreeningProvider {
  if (apiUrl && apiKey) {
    return new HttpScreeningProvider(apiUrl, apiKey);
  }
  return new StubScreeningProvider();
}

export class ScreeningService {
  constructor(
    private readonly provider: ScreeningProvider,
    private readonly logger: Logger,
  ) {}

  async screen(address: string): Promise<{ result: ScreeningResult; details?: unknown }> {
    const outcome = await this.provider.screen(address);

    // Persist result
    await query(
      `INSERT INTO screening_results (address, provider, result, details)
       VALUES ($1, $2, $3, $4)`,
      [address, this.provider.name, outcome.result, JSON.stringify(outcome.details ?? null)],
    );

    this.logger.info(
      { address, result: outcome.result, provider: this.provider.name },
      "Screening complete",
    );

    return outcome;
  }
}
