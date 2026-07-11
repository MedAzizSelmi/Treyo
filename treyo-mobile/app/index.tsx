import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/api';
import * as SecureStore from 'expo-secure-store';

// Use 'screen' (full physical screen) not 'window' (safe area). On Android
// 'window' excludes the system nav bar, which shrinks the gradient view
// and pulls the strong-green bottom of the glow into the visible area.
// 'screen' restores the off-screen positioning the design assumes.
const { width, height } = Dimensions.get('screen');


export default function WelcomeScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    // `checking` covers the brief moment between mount and "we've decided
    // where to send you". We render a spinner instead of the welcome
    // buttons so a logged-in user never sees Sign In / Get Started flash
    // before being redirected to their tabs.
    const [checking, setChecking] = useState(true);

    // Persistent session: on mount, look for a stored JWT + user. If both
    // exist, route straight to the role's tab home (the JWT is good for
    // 90 days, and any API call that hits an expired token will 401 and
    // get caught downstream — at which point we re-route to login from
    // here). This is what gives the app its "always signed in until you
    // tap log out" behavior.
    useEffect(() => {
        (async () => {
            try {
                const token = await SecureStore.getItemAsync('jwt_token');
                const user = await authService.getCurrentUser();
                if (token && user?.userId) {
                    // Onboarding gate — if the user hasn't finished step 3,
                    // we still want them to land back where they left off
                    // rather than the tabs.
                    if (user.onboardingComplete === false) {
                        const isTrainer = String(user.role || user.userType || '').toUpperCase().includes('TRAINER');
                        router.replace(isTrainer ? '/onboarding/trainer/step1' as any : '/onboarding/student/step1' as any);
                        return;
                    }
                    const isTrainer = String(user.role || user.userType || '').toUpperCase().includes('TRAINER');
                    router.replace(isTrainer ? '/(trainer-tabs)/home' as any : '/(student-tabs)/home' as any);
                    return;
                }
            } catch (_) {
                // Fall through to welcome screen on any error.
            }
            setChecking(false);
        })();
    }, []);

    if (checking) {
        return (
            <View style={styles.container}>
                <LinearGradient colors={['#160e45', '#02000e']} style={StyleSheet.absoluteFill} />
                <View style={styles.checkingWrap}>
                    <ActivityIndicator size="large" color="#7cce06" />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Background (same as onboarding).
                Wrapped in a `direction: 'ltr'` layer so RN's RTL auto-flip
                doesn't move the side glows in Arabic — keeps the background
                identical in every language. */}
            <View style={[StyleSheet.absoluteFill, { direction: 'ltr' }]} pointerEvents="none">
                <LinearGradient colors={['#160e45', '#02000e']} style={StyleSheet.absoluteFill} />
                <LinearGradient
                    colors={['rgba(124,206,6,0.6)', 'rgba(124,206,6,0.25)', 'transparent']}
                    style={styles.topGlow}
                />
                <LinearGradient
                    colors={['transparent', 'rgba(124,206,6,0.25)', 'rgba(124,206,6,0.6)']}
                    style={styles.bottomGlow}
                />
                <LinearGradient
                    colors={['rgba(19,5,107,1)', 'transparent']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.leftGlow}
                />
                <LinearGradient
                    colors={['transparent', 'rgba(19,5,107,1)']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.rightGlow}
                />
            </View>

            {/* Content */}
            <View style={styles.content}>
                {/* Logo */}
                <Image
                    source={require('../assets/images/logo-white.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />

                {/* App Name */}
                <Text style={styles.appName}>
                    Tr<Text style={styles.green}>e</Text>yo
                </Text>

                {/* Slogan */}
                <Text style={styles.slogan}>
                    Smart match, swift growth
                </Text>
            </View>

            {/* Buttons */}
            <View style={styles.buttons}>
                <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => router.push('/signup' as any)}
                    activeOpacity={0.8}
                >
                    <LinearGradient
                        colors={['#7cce06', '#6bb805']}
                        style={styles.buttonGradient}
                    >
                        <Text style={styles.primaryButtonText}>{t('auth.getStarted')}</Text>
                    </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => router.push('/login' as any)}
                    activeOpacity={0.8}
                >
                    <Text style={styles.secondaryButtonText}>{t('auth.signIn')}</Text>
                </TouchableOpacity>

                <Text style={styles.terms}>{t('auth.terms')}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#02000e',
    },

    checkingWrap: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
    },

    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },

    logo: {
        width: 140,
        height: 140,
        marginBottom: 20,
    },

    appName: {
        fontSize: 56,
        fontWeight: 'bold',
        color: 'white',
        letterSpacing: 2,
    },

    green: {
        color: '#7CCE06',
    },

    slogan: {
        fontSize: 16,
        color: '#cfcfcf',
        marginTop: 10,
    },

    buttons: {
        paddingHorizontal: 30,
        paddingBottom: 50,
        gap: 16,
    },

    primaryButton: {
        borderRadius: 28,
        overflow: 'hidden',
        shadowColor: '#7cce06',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },

    buttonGradient: {
        paddingVertical: 18,
        alignItems: 'center',
        borderRadius: 28,
    },

    primaryButtonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 'bold',
    },

    secondaryButton: {
        borderRadius: 28,
        paddingVertical: 18,
        borderWidth: 1.5,
        borderColor: '#7CCE06',
        alignItems: 'center',
    },

    secondaryButtonText: {
        color: '#7CCE06',
        fontSize: 18,
        fontWeight: 'bold',
    },

    terms: {
        fontSize: 13,
        color: '#888',
        textAlign: 'center',
        marginTop: 10,
        lineHeight: 18,
    },

    termsLink: {
        color: '#7CCE06',
        fontWeight: '600',
    },

    /* SAME GLOW AS ONBOARDING */
    topGlow: {
        position: 'absolute',
        width: width,
        height: height * 0.35,
        top: -100,
    },

    bottomGlow: {
        position: 'absolute',
        width: width,
        height: height * 0.4,
        bottom: -180,
    },

    leftGlow: {
        position: 'absolute',
        width: width * 0.5,
        height: height,
        left: -100,
    },

    rightGlow: {
        position: 'absolute',
        width: width * 0.5,
        height: height,
        right: -100,
    },
});