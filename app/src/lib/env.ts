import { PublicKey } from "@solana/web3.js";

export function getRpcUrl(): string {
  return process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
}

/**
 * Returns the stablecoin mint public key, or null if NEXT_PUBLIC_STABLECOIN_MINT is not set.
 * Use this so the app can render "missing config" instead of throwing during SSR/hydration.
 */
export function getMintAddress(): PublicKey | null {
  const raw = process.env.NEXT_PUBLIC_STABLECOIN_MINT;
  if (!raw || !raw.trim()) return null;
  try {
    return new PublicKey(raw.trim());
  } catch {
    return null;
  }
}

/**
 * Returns the webhook API base URL, or empty string if not set (notifications will be skipped).
 */
export function getWebhookApiUrl(): string {
  return process.env.NEXT_PUBLIC_WEBHOOK_API_URL?.trim() ?? "";
}

export function getWebhookTargetUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_WEBHOOK_TARGET_URL;
}

/**
 * URL the webhook service (e.g. in Docker) should POST to. When the service runs in Docker
 * and the app runs on the host, use host.docker.internal so the container can reach the host:
 * e.g. NEXT_PUBLIC_WEBHOOK_CALLBACK_URL=http://host.docker.internal:3000/api/webhook
 */
export function getWebhookCallbackUrl(): string {
  const url = process.env.NEXT_PUBLIC_WEBHOOK_CALLBACK_URL?.trim();
  if (url) return url;
  if (typeof window !== "undefined") return `${window.location.origin}/api/webhook`;
  return "/api/webhook";
}
