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

    // APP
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
                <Stack.Screen name="onboarding/student/step1" />
                <Stack.Screen name="onboarding/student/step2" />
                <Stack.Screen name="onboarding/student/step3" />
                <Stack.Screen name="onboarding/trainer/step1" />
                <Stack.Screen name="onboarding/trainer/step2" />
                <Stack.Screen name="onboarding/trainer/step3" />
                <Stack.Screen name="onboarding/trainer/step4" />
                <Stack.Screen name="(student-tabs)" />
                <Stack.Screen name="(trainer-tabs)" />
            </Stack>
        </ThemeProvider>
    );
}