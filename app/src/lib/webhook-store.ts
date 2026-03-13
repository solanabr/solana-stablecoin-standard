/**
 * In-memory store for webhook notifications received at POST /api/webhook.
 * Used so the dashboard can show events that were pushed to this app's URL.
 *
 * Note: In serverless (e.g. Vercel) this store is per-instance and may be empty
 * on cold starts. For production at scale, consider a shared store (e.g. Redis).
 */

export type StoredNotification = {
  id: string;
  eventType: string;
  createdAt: string;
  mint: string;
  signature?: string;
  unread: boolean;
  payload: Record<string, unknown>;
};

const notifications: StoredNotification[] = [];
const MAX_STORED = 500;

export function getStoredNotifications(mint: string | null): StoredNotification[] {
  const list = mint
    ? notifications.filter((n) => n.mint === mint)
    : [...notifications];
  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function appendNotification(notification: StoredNotification): void {
  notifications.unshift(notification);
  if (notifications.length > MAX_STORED) {
    notifications.length = MAX_STORED;
  }
}

export function markNotificationRead(id: string): void {
  const n = notifications.find((x) => x.id === id);
  if (n) n.unread = false;
}

export function markAllNotificationsRead(mint: string | null): void {
  const target = mint ? notifications.filter((n) => n.mint === mint) : notifications;
  target.forEach((n) => (n.unread = false));
}
