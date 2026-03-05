import { PublicKey } from '@solana/web3.js';

export type ViewingKeyScopeType = 'issuer' | 'compliance' | 'auditor';

export interface ViewingKeyConstraints {
  addresses?: string[];
  timeRange?: [string, string];
}

export interface ViewingKeyRegistration {
  scope: ViewingKeyScopeType;
  mint: string;
  constraints?: ViewingKeyConstraints;
}

export class PrivacyRelayClient {
  constructor(private readonly relayUrl: string) {}

  async transact(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request('/transact', payload);
  }

  async status(id: string): Promise<Record<string, unknown>> {
    return this.request(`/status/${id}`, undefined, 'GET');
  }

  async commitments(mint: PublicKey): Promise<Record<string, unknown>> {
    return this.request(`/commitments?mint=${mint.toBase58()}`, undefined, 'GET');
  }

  async registerViewingKey(registration: ViewingKeyRegistration): Promise<Record<string, unknown>> {
    return this.request('/viewing-key/register', registration);
  }

  private async request(
    path: string,
    body?: unknown,
    method: 'GET' | 'POST' = 'POST'
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.relayUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
      },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Relay request failed: ${response.status}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }
}
