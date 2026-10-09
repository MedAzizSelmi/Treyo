import { Client, type StompSubscription } from '@stomp/stompjs';
import { API_BASE_URL } from './api';

/**
 * The dashboard's live connection to the message broker.
 *
 * Group chat used to refresh on a 4-second timer, with the conversation
 * list on 15 — so an admin watching a group saw replies a few seconds
 * late and the app's members saw them instantly. The backend already
 * fans every group message out to each member's own destination, and
 * `resolveGroupMemberIds` counts every administrator as a member, so
 * the frames were arriving all along with nobody listening.
 *
 * One connection for the page, shared by both subscriptions. The
 * polling stays as a fallback for when this is down — a moderation
 * screen that silently stops updating is worse than one a beat behind.
 */

type Listener = (payload: any) => void;

/** Matches the mobile client: the server's user destinations. */
const DESTINATIONS = {
    'group-messages': '/user/queue/group-messages',
    'typing': '/user/queue/typing',
} as const;

export type Channel = keyof typeof DESTINATIONS;

let client: Client | null = null;
let connected = false;
const listeners: Record<Channel, Set<Listener>> = {
    'group-messages': new Set(),
    'typing': new Set(),
};
const subscriptions: Partial<Record<Channel, StompSubscription>> = {};

function wsUrl(): string {
    // SockJS's raw-WebSocket path. The endpoint is registered
    // withSockJS() for browsers behind proxies that block upgrades, and
    // this is the escape hatch that speaks plain WebSocket — which
    // avoids pulling in sockjs-client just to talk to it.
    return `${API_BASE_URL.replace(/^http/, 'ws')}/ws/websocket`;
}

function subscribeAll() {
    if (!client || !connected) return;
    (Object.keys(DESTINATIONS) as Channel[]).forEach((channel) => {
        if (subscriptions[channel]) return;
        subscriptions[channel] = client!.subscribe(DESTINATIONS[channel], (frame) => {
            let payload: any = frame.body;
            try {
                payload = JSON.parse(frame.body);
            } catch {
                // Not something our senders produce, but a listener
                // should see whatever did arrive.
            }
            listeners[channel].forEach((fn) => {
                try {
                    fn(payload);
                } catch (e) {
                    console.error('[realtime] listener threw', e);
                }
            });
        });
    });
}

/** Open the connection, or do nothing if it is already open. */
export function connectRealtime(): void {
    if (client?.active) return;
    const token = typeof window === 'undefined' ? null : localStorage.getItem('admin_token');
    if (!token) return;

    client = new Client({
        brokerURL: wsUrl(),
        // On the CONNECT frame, not the URL: a query string ends up in
        // access logs, and a token in a log is a credential in a log.
        connectHeaders: { Authorization: `Bearer ${token}` },
        reconnectDelay: 4000,
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,
        onConnect: () => {
            connected = true;
            subscribeAll();
        },
        onStompError: (frame) => {
            // The server refuses the socket outright on a bad or expired
            // token; retrying with the same one will not help.
            console.warn('[realtime] refused:', frame.headers['message']);
        },
        onWebSocketClose: () => {
            connected = false;
            (Object.keys(subscriptions) as Channel[]).forEach((c) => delete subscriptions[c]);
        },
        debug: () => {},
    });

    client.activate();
}

export function disconnectRealtime(): void {
    (Object.keys(subscriptions) as Channel[]).forEach((c) => delete subscriptions[c]);
    connected = false;
    client?.deactivate();
    client = null;
}

/**
 * Listen on a channel. Returns the unsubscribe function, which the
 * caller must run on unmount or the handler keeps setting state on a
 * component that is gone.
 */
export function onRealtime(channel: Channel, fn: Listener): () => void {
    listeners[channel].add(fn);
    connectRealtime();
    subscribeAll();
    return () => {
        listeners[channel].delete(fn);
    };
}

export function isRealtimeConnected(): boolean {
    return connected;
}
