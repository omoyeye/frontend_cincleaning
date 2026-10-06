import { getWsUrl } from './api';

type SyncScope = 'bookings' | 'notifications' | 'all' | string;

/** Subscribe to server `nn_sync` events so all portals refetch from the DB together. */
export function subscribeNnSync(onSync: (scope: SyncScope) => void): () => void {
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
        if (closed) return;
        try {
            ws = new WebSocket(getWsUrl());
        } catch {
            scheduleReconnect();
            return;
        }
        ws.onmessage = (ev) => {
            try {
                const d = JSON.parse(ev.data as string) as { type?: string; scope?: SyncScope };
                if (d.type === 'nn_sync' && d.scope) {
                    onSync(d.scope);
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('nn_sync', { detail: { scope: d.scope } }));
                    }
                }
            } catch {
                /* ignore */
            }
        };
        ws.onclose = () => {
            if (!closed) scheduleReconnect();
        };
        ws.onerror = () => {
            try {
                ws?.close();
            } catch {
                /* ignore */
            }
        };
    };

    const scheduleReconnect = () => {
        if (closed || reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, 2500);
    };

    connect();

    return () => {
        closed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        try {
            ws?.close();
        } catch {
            /* ignore */
        }
    };
}
