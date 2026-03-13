"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type NotificationItem = {
  id: string;
  eventType: string;
  createdAt: string;
  mint: string;
  signature?: string;
  unread: boolean;
  payload: Record<string, unknown>;
};

/**
 * Loads notifications from this app's API: events that were received at
 * POST /api/webhook (same payload shape the webhook service sends to subscriber URLs).
 * Subscribe your app's webhook URL at POST http://localhost:3003/subscriptions
 * so events are pushed here and shown in the dashboard.
 */
async function fetchNotifications(mint: string | null): Promise<NotificationItem[]> {
  if (!mint) return [];
  const params = new URLSearchParams({ mint });
  const res = await fetch(`/api/notifications?${params}`);
  if (!res.ok) throw new Error(`Notifications API error (${res.status})`);
  const data = (await res.json()) as { notifications: NotificationItem[] };
  return data.notifications ?? [];
}

export function useNotifications(mint: string | null) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = useMemo(
    () => items.reduce((count, item) => count + (item.unread ? 1 : 0), 0),
    [items],
  );

  const load = useCallback(async () => {
    if (!mint) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchNotifications(mint);
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [mint]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((item) => ({ ...item, unread: false })));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true, mint }),
      });
    } catch {
      // ignore
    }
  }, [mint]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, unread: false } : item)),
    );
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // ignore
    }
  }, []);

  return {
    items,
    unreadCount,
    loading,
    error,
    reload: load,
    markAllRead,
    markRead,
  };
}
