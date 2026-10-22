import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A learner's recent course searches, kept on the device.
 *
 * Stored per account. It used to live under one key for the whole device,
 * so whoever signed in next on the same phone saw the previous learner's
 * searches — and that is personal: what someone is looking to learn. The
 * history is not tied to the session, so it is not wiped on logout; it
 * waits for its owner and is invisible to everyone else.
 *
 * The server keeps its own search log for recommendations
 * (POST /api/searches/log). This is only the "Recent searches" list.
 */

export const HISTORY_LIMIT = 10;

/** The old device-wide key. Its contents belong to nobody in particular. */
const LEGACY_KEY = 'student_search_history';

const keyFor = (userId: string) => `search_history:${userId}`;

export async function loadSearchHistory(userId: string): Promise<string[]> {
    try {
        // Not migrated: there is no telling whose searches it holds.
        await AsyncStorage.removeItem(LEGACY_KEY);
        const raw = await AsyncStorage.getItem(keyFor(userId));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

export async function saveSearchHistory(userId: string, terms: string[]): Promise<void> {
    try {
        await AsyncStorage.setItem(keyFor(userId), JSON.stringify(terms.slice(0, HISTORY_LIMIT)));
    } catch (_) {}
}

export async function clearSearchHistory(userId: string): Promise<void> {
    try {
        await AsyncStorage.multiRemove([keyFor(userId), LEGACY_KEY]);
    } catch (_) {}
}
