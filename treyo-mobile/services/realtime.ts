// StompJS parses frames with TextEncoder/TextDecoder, which Hermes does
// not always provide. The polyfill defines them only when missing, so
// this is a no-op on runtimes that already have them.
import 'fast-text-encoding';

import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL, refreshAccessToken } from './api';

/**
 * The real-time connection.
 *
 * One socket for the whole app, shared by every screen that wants live
 * updates. Chat screens come and go; opening a socket per screen would
 * mean reconnecting on every navigation and dropping messages in the gap.
 *
 * Everything arrives on the user's own destinations — the server refuses
 * a subscription to anything else — so there is no filtering to do here:
 * if a message arrives on /user/queue/messages, it was addressed to this
 * account.
 *
 * Delivery is best-effort. The socket drops on a tunnel, a backgrounded
 * app, a changed network; screens therefore still load their history
 * over REST and treat this as a live supplement, never as the only way a
 * message can arrive.
 */

type Listener = (payload: any) => void;

/** The server's user destinations, minus the /user prefix Spring adds. */
export type Channel = 'messages' | 'group-messages' | 'read-receipts' | 'typing';

const DESTINATIONS: Record<Channel, string> = {
    'messages': '/user/queue/messages',
    'group-messages': '/user/queue/group-messages',
    'read-receipts': '/user/queue/read-receipts',
    'typing': '/user/queue/typing',
};

let client: Client | null = null;
let connected = false;
const listeners: Record<Channel, Set<Listener>> = {
    'messages': new Set(),
    'group-messages': new Set(),
    'read-receipts': new Set(),
    'typing': new Set(),
};
const subscriptions: Partial<Record<Channel, StompSubscription>> = {};

function wsUrl(): string {
    // Plain WebSocket, not SockJS: SockJS exists for browsers behind
    // proxies that block upgrades, and React Native has none of that
    // problem. http -> ws, https -> wss.
    return `${API_BASE_URL.replace(/^http/, 'ws')}/ws/websocket`;
}

/** Seconds since the epoch at which a JWT expires, or null if unreadable. */
function expiresAt(token: string): number | null {
    try {
        // base64url, unpadded — restore what atob expects.
        const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(part + '='.repeat((4 - (part.length % 4)) % 4));
        const exp = JSON.parse(json)?.exp;
        return typeof exp === 'number' ? exp : null;
    } catch (_) {
        return null;
    }
}

/**
 * An access token good for at least the next minute, renewing the stored
 * one if it has run out. Null when the session cannot be renewed.
 *
 * Read again on every connection attempt, not once: access tokens last an
 * hour, and the socket reconnects whenever the app comes back from the
 * background or the network changes. It used to keep the token it was
 * first given, so after the first hour every reconnect was refused and
 * live chat stayed down until the app was killed and reopened.
 */
async function usableToken(): Promise<string | null> {
    const stored = await SecureStore.getItemAsync('jwt_token');
    if (!stored) return null;
    const exp = expiresAt(stored);
    if (exp !== null && exp * 1000 > Date.now() + 60_000) return stored;
    return refreshAccessToken();
}

function dispatch(channel: Channel, frame: IMessage) {
    let payload: any = frame.body;
    try {
        payload = JSON.parse(frame.body);
    } catch (_) {
        // A non-JSON body is not something any of our senders produce,
        // but a listener should get whatever did arrive rather than
        // nothing at all.
    }
    listeners[channel].forEach((fn) => {
        try {
            fn(payload);
        } catch (e) {
            console.log('[realtime] listener threw:', e);
        }
    });
}

function subscribeAll() {
    if (!client || !connected) return;
    (Object.keys(DESTINATIONS) as Channel[]).forEach((channel) => {
        if (subscriptions[channel]) return;
        subscriptions[channel] = client!.subscribe(
            DESTINATIONS[channel],
            (frame) => dispatch(channel, frame),
        );
    });
}

/**
 * Open the connection, or do nothing if it is already open.
 *
 * Safe to call on every app start and after every sign-in. Without a
 * stored token it returns quietly: the server refuses an unauthenticated
 * CONNECT, so there is nothing to attempt.
 */
export async function connectRealtime(): Promise<void> {
    if (client?.active) return;

    if (!(await SecureStore.getItemAsync('jwt_token'))) return;

    client = new Client({
        brokerURL: wsUrl(),
        // The token goes on the CONNECT frame, not the URL. A query
        // string lands in access logs and proxy logs, and an access
        // token in a log is a credential in a log. Set before every
        // attempt, reconnects included — see usableToken.
        beforeConnect: async (c) => {
            const token = await usableToken();
            if (!token) {
                // Signed out, or the session could not be renewed:
                // stop, rather than be refused every four seconds.
                await c.deactivate();
                return;
            }
            c.connectHeaders = { Authorization: `Bearer ${token}` };
        },
        // React Native's WebSocket cuts a text message at the first NULL
        // character, and every STOMP frame ends in one. Without these two
        // the CONNECT frame reached the server unterminated and the reply
        // came back the same way, so the socket never opened: messages
        // still arrived through the chat screen's 10 s poll, which looked
        // nearly live, but typing — socket-only — never worked at all.
        // Binary frames keep the NULL on the way out; the second puts it
        // back on what comes in. Both are stompjs's documented fix.
        forceBinaryWSFrames: true,
        appendMissingNULLonIncoming: true,
        reconnectDelay: 4000,
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,
        onConnect: () => {
            connected = true;
            subscribeAll();
            if (__DEV__) console.log('[realtime] connected');
        },
        onStompError: (frame) => {
            // The server refuses the socket on a bad or expired token.
            // The next attempt fetches a fresh one in beforeConnect.
            console.log('[realtime] refused:', frame.headers['message']);
        },
        onWebSocketClose: () => {
            connected = false;
            (Object.keys(subscriptions) as Channel[]).forEach((c) => delete subscriptions[c]);
        },
        debug: () => {},
    });

    client.activate();
}

/** Close it and forget the subscriptions. Called on sign-out. */
export async function disconnectRealtime(): Promise<void> {
    (Object.keys(subscriptions) as Channel[]).forEach((c) => delete subscriptions[c]);
    connected = false;
    if (client) {
        try {
            await client.deactivate();
        } catch (_) {}
        client = null;
    }
}

/**
 * Listen on one channel. Returns the unsubscribe function, which a
 * screen must call on unmount or its handler will keep running — and
 * keep setting state on a component that is gone.
 */
export function onRealtime(channel: Channel, fn: Listener): () => void {
    listeners[channel].add(fn);
    // A screen may mount before the socket finishes connecting; this
    // covers the case where that happened and nothing is subscribed yet.
    connectRealtime().catch(() => {});
    subscribeAll();
    return () => {
        listeners[channel].delete(fn);
    };
}

/** Whether the socket is live, for a "reconnecting" hint in the UI. */
export function isRealtimeConnected(): boolean {
    return connected;
}

/**
 * Tell a group that we are typing. Best-effort, never awaited.
 *
 * Throttled by the caller rather than here: this fires from an onChange
 * handler, and one frame per keystroke would be forty frames for a
 * short message.
 */
export function publishTyping(groupId: string): void {
    if (!client || !connected) return;
    try {
        client.publish({
            destination: '/app/typing',
            body: JSON.stringify({ groupId }),
        });
    } catch (_) {}
}
