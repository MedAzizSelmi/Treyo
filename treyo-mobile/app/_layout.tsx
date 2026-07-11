import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from '../contexts/ThemeContext';
import { useState, useEffect } from 'react';
import SplashScreen1 from '../components/splash-screens/SplashScreen1';
import OnboardingCarousel from '../components/splash-screens/Onboardingcarousel';
import * as ExpoSplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { configureNotifications, registerForPushNotifications } from '../services/push';
import { authService } from '../services/api';
import { initI18n } from '../i18n';

// Keep native splash while loading
ExpoSplashScreen.preventAutoHideAsync();

// Foreground-display behaviour. Has to be set before any push arrives,
// so we do it at module load — it's a no-op if called multiple times.
configureNotifications();

export default function RootLayout() {
    const [splashStep, setSplashStep] = useState(1);
    const [i18nReady, setI18nReady] = useState(false);
    const router = useRouter();

    useEffect(() => {
        ExpoSplashScreen.hideAsync();
        // Initialise i18n before any screen mounts, so the very first
        // render already shows the right language. Resources are
        // bundled, so this is a sub-frame operation in practice.
        initI18n().finally(() => setI18nReady(true));
    }, []);

    // ── Push notification wiring ──
    // On every app start, if a user is already signed in, refresh their
    // push token registration. This handles the case where the token
    // rotated (Expo can rotate them) or the user denied permission
    // before and just granted it from system settings.
    // Also handles taps on a notification while the app is killed/
    // backgrounded: opens the relevant chat / notifications screen.
    useEffect(() => {
        (async () => {
            try {
                const user = await authService.getCurrentUser();
                if (user?.userId) {
                    registerForPushNotifications(user.userId, user.role || user.userType).catch(() => {});
                }
            } catch (_) {}
        })();

        const sub = Notifications.addNotificationResponseReceivedListener(response => {
            const data: any = response?.notification?.request?.content?.data || {};
            // Deep-link by payload `type`. The backend sets these in
            // PushNotificationService when fanning out, so any new
            // notification type just needs a case here.
            try {
                if (data.type === 'group_message' && data.groupId) {
                    router.push({ pathname: '/group-chat' as any, params: { groupId: data.groupId } });
                } else if (data.type) {
                    // Generic notification → drop into the notifications tab.
                    // Both student and trainer tabs have one.
                    router.push('/(student-tabs)/notifications' as any);
                }
            } catch (_) {}
        });
        return () => sub.remove();
    }, []);

    // SPLASH 1 - Logo animation. We also gate on i18n being ready so
    // the welcome screen never flashes English when the user picked
    // another language. initI18n resolves in a few ms with bundled
    // resources, so this rarely blocks visibly.
    if (splashStep === 1 || !i18nReady) {
        return <SplashScreen1 onFinish={() => setSplashStep(2)} />;
    }

    // SPLASH 2, 3, 4 - Swipeable onboarding carousel
    if (splashStep === 2) {
        return <OnboardingCarousel onFinish={() => setSplashStep(3)} />;
    }

    // APP. Konnect doesn't need a client-side provider — payments happen
    // via expo-web-browser opening Konnect's hosted page, with the
    // backend driving init + verification end to end.
    return (
        <ThemeProvider>
            <StatusBar translucent backgroundColor="transparent" style="light" />
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="signup" />
                <Stack.Screen name="success" />
                <Stack.Screen name="edit-profile" />
                <Stack.Screen name="theme-settings" />
                <Stack.Screen name="notification-settings" />
                <Stack.Screen name="certificates" />
                <Stack.Screen name="help-support" />
                <Stack.Screen name="course-search" />
                <Stack.Screen name="course-detail" />
                <Stack.Screen name="trainer-edit-profile" />
                <Stack.Screen name="trainer-course-manage" />
                <Stack.Screen name="trainer-profile" />
                <Stack.Screen name="groups-forming" />
                <Stack.Screen name="recommended-courses" />
                <Stack.Screen name="settings-privacy" />
                <Stack.Screen name="settings-language" />
                <Stack.Screen name="settings-currency" />
                <Stack.Screen name="trainer-earnings" />
                <Stack.Screen name="settings-security" />
                <Stack.Screen name="settings-payments" />
                <Stack.Screen name="favorites" />
                <Stack.Screen name="group-chat" />
                <Stack.Screen name="user-profile" />
                <Stack.Screen name="schedule-sessions" />
                <Stack.Screen name="my-schedule" />
                <Stack.Screen name="course-review" />
                <Stack.Screen name="forgot-password" />
                <Stack.Screen name="reset-password" />
                <Stack.Screen name="feed" />
                <Stack.Screen name="saved-posts" />
                <Stack.Screen name="trainer-pending" />
                <Stack.Screen name="trainer-rejected" />
                <Stack.Screen name="trainer-course-create" />
                <Stack.Screen name="onboarding/student/step1" />
                <Stack.Screen name="onboarding/student/step2" />
                <Stack.Screen name="onboarding/student/step3" />
                <Stack.Screen name="onboarding/trainer/step1" />
                <Stack.Screen name="onboarding/trainer/step2" />
                <Stack.Screen name="onboarding/trainer/step3" />
                <Stack.Screen name="(student-tabs)" />
                <Stack.Screen name="(trainer-tabs)" />
            </Stack>
        </ThemeProvider>
    );
}