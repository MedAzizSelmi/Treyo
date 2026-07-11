import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/api';
import { registerForPushNotifications } from '../services/push';

// Use 'screen' (full physical screen) not 'window' (safe area). On Android
// 'window' excludes the system nav bar, which shrinks the gradient view
// and pulls the strong-green bottom of the glow into the visible area.
const { width, height } = Dimensions.get('screen');


export default function LoginScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [socialLoading, setSocialLoading] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert(t('common.error'), t('auth.invalidCreds'));
            return;
        }

        setLoading(true);
        try {
            const response = await authService.login(email, password);

            // Register this device's Expo push token under the new user
            // so the OS can deliver notifications even when the app is
            // closed. Fire-and-forget — push is best-effort.
            if (response?.userId) {
                registerForPushNotifications(response.userId, response.role).catch(() => {});
            }

            if (!response.onboardingComplete) {
                if (response.role === 'STUDENT') {
                    router.replace('/onboarding/student/step1' as any);
                } else {
                    router.replace('/onboarding/trainer/step1' as any);
                }
            } else {
                if (response.role === 'STUDENT') {
                    router.replace('/(student-tabs)/home' as any);
                } else {
                    router.replace('/(trainer-tabs)/home' as any);
                }
            }
        } catch (error: any) {
            // Trainer-approval gate. The backend throws a RuntimeException
            // with a marker message — surface it as a friendly screen
            // rather than the generic "invalid credentials" alert. We
            // grep both the top-level message and the nested response
            // body since Spring sometimes wraps the exception text
            // differently across error paths.
            const raw = String(
                error?.response?.data?.message
                || error?.response?.data?.error
                || error?.message
                || '',
            );
            if (raw.includes('TRAINER_PENDING_APPROVAL')) {
                router.replace('/trainer-pending' as any);
                return;
            }
            if (raw.includes('TRAINER_REJECTED')) {
                router.replace('/trainer-rejected' as any);
                return;
            }
            Alert.alert(t('auth.loginFailed'), error.response?.data?.message || t('auth.invalidCreds'));
        } finally {
            setLoading(false);
        }
    };

    const handleSocialLogin = async (provider: 'google' | 'apple' | 'linkedin') => {
        setSocialLoading(true);
        try {
            let response;
            switch (provider) {
                case 'google':
                    response = await authService.loginWithGoogle();
                    break;
                case 'apple':
                    response = await authService.loginWithApple();
                    break;
                case 'linkedin':
                    response = await authService.loginWithLinkedIn();
                    break;
            }
            // Same push token registration as the email path.
            if (response?.userId) {
                registerForPushNotifications(response.userId, response.role).catch(() => {});
            }

            // Assuming response has same structure as email/password login
            if (!response.onboardingComplete) {
                if (response.role === 'STUDENT') {
                    router.replace('/onboarding/student/step1' as any);
                } else {
                    router.replace('/onboarding/trainer/step1' as any);
                }
            } else {
                if (response.role === 'STUDENT') {
                    router.replace('/(student-tabs)/home' as any);
                } else {
                    router.replace('/(trainer-tabs)/home' as any);
                }
            }
        } catch (error: any) {
            Alert.alert('Social Login Failed', error.response?.data?.message || `Could not sign in with ${provider}`);
        } finally {
            setSocialLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            {/* Background — wrapped in `direction: 'ltr'` so the side
                glows aren't auto-mirrored in Arabic. */}
            <View style={[StyleSheet.absoluteFill, { direction: 'ltr' }]} pointerEvents="none">
                <LinearGradient colors={['#160e45', '#02000e']} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['rgba(124,206,6,0.6)', 'rgba(124,206,6,0.25)', 'transparent']} style={styles.topGlow} />
                <LinearGradient colors={['transparent', 'rgba(124,206,6,0.25)', 'rgba(124,206,6,0.6)']} style={styles.bottomGlow} />
                <LinearGradient colors={['rgba(19,5,107,1)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.leftGlow} />
                <LinearGradient colors={['transparent', 'rgba(19,5,107,1)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.rightGlow} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>

                <View style={styles.header}>
                    <Text style={styles.title}>{t('auth.loginTitle')}</Text>
                    <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>
                </View>

                <View style={styles.form}>
                    <View style={styles.inputContainer}>
                        <Ionicons name="mail-outline" size={20} color="#aaa" />
                        <TextInput
                            style={styles.input}
                            placeholder={t('auth.email')}
                            placeholderTextColor="#777"
                            value={email}
                            onChangeText={setEmail}
                            editable={!loading && !socialLoading}
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Ionicons name="lock-closed-outline" size={20} color="#aaa" />
                        <TextInput
                            style={styles.input}
                            placeholder={t('auth.password')}
                            placeholderTextColor="#777"
                            secureTextEntry={!showPassword}
                            value={password}
                            onChangeText={setPassword}
                            editable={!loading && !socialLoading}
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                            <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color="#aaa" />
                        </TouchableOpacity>
                    </View>

                    {/* Forgot password — routes to the email-entry screen.
                        Sits between the password input and the sign-in
                        button where users naturally look after a failed
                        login attempt. */}
                    <TouchableOpacity
                        onPress={() => router.push('/forgot-password' as any)}
                        style={styles.forgotLink}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.forgotText}>{t('auth.forgot')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.loginButton}
                        onPress={handleLogin}
                        disabled={loading || socialLoading}
                    >
                        <LinearGradient colors={['#7cce06', '#6bb805']} style={styles.buttonGradient}>
                            <Text style={styles.loginButtonText}>
                                {loading ? t('common.loading') : t('auth.signIn')}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Social Login Section */}
                    <View style={styles.socialSection}>
                        <View style={styles.divider}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>{t('auth.orContinueWith')}</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        <View style={styles.socialButtons}>
                            <TouchableOpacity
                                style={styles.socialButton}
                                onPress={() => handleSocialLogin('google')}
                                disabled={loading || socialLoading}
                            >
                                <Ionicons name="logo-google" size={24} color="#DB4437" />
                                <Text style={styles.socialButtonText}>Google</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.socialButton}
                                onPress={() => handleSocialLogin('apple')}
                                disabled={loading || socialLoading}
                            >
                                <Ionicons name="logo-apple" size={24} color="#ffffff" />
                                <Text style={styles.socialButtonText}>Apple</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.socialButton}
                                onPress={() => handleSocialLogin('linkedin')}
                                disabled={loading || socialLoading}
                            >
                                <Ionicons name="logo-linkedin" size={24} color="#0A66C2" />
                                <Text style={styles.socialButtonText}>LinkedIn</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.signupContainer}>
                        <Text style={styles.signupText}>{t('auth.noAccount')} </Text>
                        <TouchableOpacity onPress={() => router.push('/signup' as any)}>
                            <Text style={styles.signupLink}>{t('auth.signUp')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#02000e' },
    scrollContent: { flexGrow: 1, padding: 24, paddingTop: 60 },

    backButton: {
        width: 40, height: 40, borderRadius: 12,
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginBottom: 30
    },

    header: { marginBottom: 40 },
    title: { fontSize: 32, fontWeight: 'bold', color: 'white' },
    subtitle: { fontSize: 16, color: '#aaa', marginTop: 5 },

    form: { gap: 20 },

    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 14,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)'
    },

    input: {
        flex: 1,
        color: 'white',
        paddingVertical: 16,
        marginLeft: 10
    },

    forgotLink: {
        alignSelf: 'flex-end',
        paddingVertical: 8, paddingHorizontal: 4,
        marginTop: -4, marginBottom: 6,
    },
    forgotText: { color: '#7cce06', fontSize: 13, fontWeight: '600' },

    loginButton: {
        borderRadius: 20,
        overflow: 'hidden',
        marginTop: 10
    },

    buttonGradient: {
        paddingVertical: 16,
        alignItems: 'center'
    },

    loginButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold'
    },

    // Social login styles
    socialSection: {
        marginTop: 20,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    dividerText: {
        color: '#aaa',
        paddingHorizontal: 12,
        fontSize: 14,
    },
    socialButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    socialButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 14,
        paddingVertical: 12,
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    socialButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },

    signupContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 20
    },

    signupText: { color: '#aaa' },
    signupLink: { color: '#7CCE06', fontWeight: 'bold' },

    topGlow: { position: 'absolute', width: width, height: height * 0.35, top: -100 },
    bottomGlow: { position: 'absolute', width: width, height: height * 0.4, bottom: -180 },
    leftGlow: { position: 'absolute', width: width * 0.5, height: height, left: -100 },
    rightGlow: { position: 'absolute', width: width * 0.5, height: height, right: -100 },
});