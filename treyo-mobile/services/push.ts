import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { deviceService } from './api';

// Expo Go in SDK 53+ dropped remote push support. The whole push
// pipeline still RUNS (we ask permission, try to fetch a token, etc.)
// but getExpoPushTokenAsync throws "Must use physical device for push
// notifications" or "expo-notifications: Android Push notifications
// (remote notifications) functionality provided by expo-notifications
// was removed from Expo Go". We detect Expo Go up front and short-
// circuit so logs stay clean during development. The same code runs
// normally once you switch to a dev client / standalone build.
const IS_EXPO_GO = (Constants as any)?.appOwnership === 'expo';

/**
 * Push notification plumbing.
 *
 * What's here:
 *   - configureNotifications(): foreground display behaviour. Call once
 *     at app start so notifications also show a banner while the app is
 *     in the foreground (otherwise they're silently delivered to the
 *     in-app listener and the user sees nothing).
 *
 *   - registerForPushNotifications(userId, userType): the full handshake.
 *     Asks for permission, fetches an Expo push token, and POSTs it to
 *     the backend under the current user. Idempotent — safe to call on
 *     every login. Returns the token (or null if anything failed; we
 *     never throw — push is best-effort).
 *
 *   - unregisterCurrentDevice(): called on explicit logout. Drops the
 *     token on the backend so the previous user doesn't keep getting
 *     pushes after they sign out.
 *
 * Notes:
 *   - Doesn't work on web (no native push channel).
 *   - On a simulator/emulator Notifications.getExpoPushTokenAsync()
 *     just fails — we log a friendly message and move on.
 *   - The token is cached in SecureStore so we can unregister cleanly
 *     without re-fetching it on logout.
 */

export function configureNotifications() {
    // setNotificationHandler runs every time a push arrives while the
    // app is in the foreground. Returning shouldShowBanner makes the
    // OS show its usual banner UI even while the app is active — what
    // users expect from Messenger / WhatsApp.
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
        }),
    });
}

export async function registerForPushNotifications(
    userId: string,
    userType?: string,
): Promise<string | null> {
    try {
        if (Platform.OS === 'web') return null;
        if (IS_EXPO_GO) {
            // Dev convenience — push not delivered in Expo Go, but the
            // rest of the app behaves identically.
            return null;
        }
        if (!Device.isDevice) {
            // Simulator / emulator — Expo's push API only works on real devices.
            return null;
        }

        // Permission state — ask only if undetermined. iOS shows the
        // system dialog the first time; Android 13+ also requires it.
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            console.log('[push] permission not granted');
            return null;
        }

        // Android needs an explicit notification channel before the OS
        // will surface heads-up banners. Doing this every app start is
        // cheap and idempotent.
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#7cce06',
                sound: 'default',
            });
        }

        // expo-notifications needs the EAS project id when running in a
        // dev client / standalone build. Expo Go can use it without one.
        const projectId =
            (Constants.expoConfig as any)?.extra?.eas?.projectId
            || (Constants as any)?.easConfig?.projectId
            || (Constants as any)?.manifest2?.extra?.eas?.projectId;

        const tokenRes = await Notifications.getExpoPushTokenAsync(
            projectId ? { projectId } : undefined,
        );
        const token = tokenRes.data;
        if (!token) return null;

        // Cache locally so the logout flow can unregister without
        // hitting Notifications again.
        await SecureStore.setItemAsync('push_token', token);

        // POST to backend. Failures don't propagate — push is a side
        // channel, the rest of the app still works.
        try {
            await deviceService.register({
                userId,
                userType,
                token,
                platform: Platform.OS,
            });
        } catch (e: any) {
            console.log('[push] backend register failed:', e?.message || e);
        }

        return token;
    } catch (e: any) {
        console.log('[push] registration error:', e?.message || e);
        return null;
    }
}

export async function unregisterCurrentDevice(): Promise<void> {
    try {
        const token = await SecureStore.getItemAsync('push_token');
        if (!token) return;
        try {
            await deviceService.unregister({ token });
        } catch (_) {}
        await SecureStore.deleteItemAsync('push_token');
    } catch (_) {}
}
