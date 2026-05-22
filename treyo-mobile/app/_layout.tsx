import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from '../contexts/ThemeContext';
import { useState, useEffect } from 'react';
import SplashScreen1 from '../components/splash-screens/SplashScreen1';
import OnboardingCarousel from '../components/splash-screens/Onboardingcarousel';
import * as ExpoSplashScreen from 'expo-splash-screen';

// Keep native splash while loading
ExpoSplashScreen.preventAutoHideAsync();

export default function RootLayout() {
    const [splashStep, setSplashStep] = useState(1);

    useEffect(() => {
        ExpoSplashScreen.hideAsync();
    }, []);

    // SPLASH 1 - Logo animation
    if (splashStep === 1) {
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
                <Stack.Screen name="settings-security" />
                <Stack.Screen name="settings-payments" />
                <Stack.Screen name="favorites" />
                <Stack.Screen name="group-chat" />
                <Stack.Screen name="user-profile" />
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