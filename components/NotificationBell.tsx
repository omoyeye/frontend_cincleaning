import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Trash2 } from 'lucide-react';
import { subscribeNnSync } from '../services/realtime';

export type InAppNotificationRow = {
  id: number;
  type: string;
  message: string;
  isRead: boolean;
  createdAt?: string | Date;
};

type Props = {
  fetchNotifications: () => Promise<InAppNotificationRow[]>;
  markRead: (id: number) => Promise<void>;
  deleteNotification: (id: number) => Promise<void>;
  className?: string;
};

export function NotificationBell({ fetchNotifications, markRead, deleteNotification, className }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InAppNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const list = await fetchNotifications();
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fetchNotifications]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeNnSync((scope) => {
      if (scope === 'notifications' || scope === 'all') void load();
    });
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const unread = items.filter((n) => !n.isRead).length;
  const hasChatUnread = items.some((n) => !n.isRead && n.type === 'chat_message');

  return (
    <div className={`relative ${className ?? ''}`} ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`relative p-2.5 rounded-xl hover:bg-muted text-foreground border border-border/60 bg-card/80 shadow-sm transition-all duration-300 ${
          unread > 0
            ? 'ring-2 ring-emerald-400/85 shadow-[0_0_18px_rgba(16,185,129,0.5)] hover:shadow-[0_0_22px_rgba(16,185,129,0.55)]'
            : ''
        }`}
        aria-label="Notifications"
      >
        <Bell className={`w-5 h-5 ${unread > 0 ? 'text-emerald-700 dark:text-emerald-400' : ''}`} />
        {unread > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full text-[10px] font-black flex items-center justify-center text-white shadow-sm ${
              hasChatUnread ? 'bg-emerald-500 ring-2 ring-white/90' : 'bg-primary'
            }`}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          {/* Mobile: dim backdrop so the centered sheet reads clearly. Hidden on sm+ */}
          <div
            className="sm:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[190]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top,0px)+5.5rem)] w-[min(92vw,22rem)] z-[200] sm:absolute sm:top-full sm:right-0 sm:left-auto sm:translate-x-0 sm:mt-2 sm:w-[min(100vw-2rem,22rem)] sm:z-[80] max-h-[min(70dvh,360px)] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl sm:shadow-xl animate-in fade-in zoom-in-95 duration-200"
            role="dialog"
            aria-label="Notifications"
          >
            <div className="p-3 border-b border-border/60 font-bold text-sm">Notifications</div>
          {loading && items.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">You’re all caught up.</div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3 border-b border-border/40 last:border-0 hover:bg-muted/50 ${n.isRead ? '' : 'bg-primary/5'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.isRead) void markRead(n.id).then(() => load());
                    }}
                    className="flex-1 text-left"
                  >
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">
                      {String(n.type || '').replace(/_/g, ' ')}
                    </div>
                    <div className="text-sm mt-1 leading-snug">{n.message}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void deleteNotification(n.id).then(() => load());
                    }}
                    className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete notification"
                    aria-label={`Delete notification ${n.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
          </div>
        </>
      )}
    </div>
  );
}
