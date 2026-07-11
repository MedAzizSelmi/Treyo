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


export default function SignupScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [userType, setUserType] = useState<'STUDENT' | 'TRAINER'>('STUDENT');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    // Tracks the social-signup flow so the email-password button can
    // grey out while a Google / Apple / LinkedIn flow is in flight.
    const [socialLoading, setSocialLoading] = useState(false);

    /**
     * Social signup stub.
     *
     * The Google / Apple / LinkedIn flows aren't wired to real OAuth
     * yet — the underlying methods (registerWith…) don't exist on
     * authService. This handler keeps the UI matching login (so the
     * visual flow is identical) and shows a clear "coming soon"
     * message until we do the EAS production build + per-provider
     * console setup.
     *
     * When OAuth lands, replace the Alert with calls like
     * authService.registerWithGoogle(userType) etc.
     */
    const handleSocialSignup = async (provider: 'google' | 'apple' | 'linkedin') => {
        setSocialLoading(true);
        try {
            const label = provider.charAt(0).toUpperCase() + provider.slice(1);
            Alert.alert(
                label,
                `Sign up with ${label} will land once we ship the production build. Use email + password for now.`,
            );
        } finally {
            setSocialLoading(false);
        }
    };

    const handleSignup = async () => {
        if (!name || !email || !password) {
            Alert.alert(t('common.error'), t('common.error'));
            return;
        }

        setLoading(true);
        try {
            const response = await authService.register({
                name,
                email,
                password,
                userType,
            });

            // Hook up push notifications for the freshly-created account.
            if (response?.userId) {
                registerForPushNotifications(response.userId, userType).catch(() => {});
            }

            // Determine where to go after the success screen
            let nextRoute: string;
            if (!response.onboardingComplete) {
                nextRoute = userType === 'STUDENT'
                    ? '/onboarding/student/step1'
                    : '/onboarding/trainer/step1';
            } else {
                nextRoute = userType === 'STUDENT'
                    ? '/(student-tabs)/home'
                    : '/(trainer-tabs)/home';
            }

            // Show animated success screen first
            router.replace({
                pathname: '/success' as any,
                params: {
                    message: 'Your account has been\nsuccessfully created!',
                    nextRoute,
                },
            });
        } catch (error: any) {
            console.error('Signup error:', error);
            Alert.alert('Signup Failed', error.response?.data?.message || 'Please try again');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            {/* Splash Screen Background — wrapped in `direction: 'ltr'`
                so the side glows aren't auto-mirrored in Arabic. */}
            <View style={[StyleSheet.absoluteFill, { direction: 'ltr' }]} pointerEvents="none">
                <LinearGradient
                    colors={['#160e45', '#02000e']}
                    style={StyleSheet.absoluteFill}
                />
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

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.back()}
                    >
                        <Ionicons name="arrow-back" size={24} color="#ffffff" />
                    </TouchableOpacity>

                    <View style={styles.header}>
                        <Text style={styles.title}>{t('auth.signupTitle')}</Text>
                        <Text style={styles.subtitle}>{t('auth.signupSubtitle')}</Text>
                    </View>

                    {/* User Type Selector */}
                    <View style={styles.userTypeContainer}>
                        <TouchableOpacity
                            style={[styles.userTypeButton, userType === 'STUDENT' && styles.userTypeButtonActive]}
                            onPress={() => setUserType('STUDENT')}
                            disabled={loading}
                        >
                            <Ionicons
                                name="school-outline"
                                size={20}
                                color={userType === 'STUDENT' ? '#ffffff' : '#aaaaaa'}
                            />
                            <Text style={[styles.userTypeText, userType === 'STUDENT' && styles.userTypeTextActive]}>
                                {t('auth.student')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.userTypeButton, userType === 'TRAINER' && styles.userTypeButtonActive]}
                            onPress={() => setUserType('TRAINER')}
                            disabled={loading}
                        >
                            <Ionicons
                                name="person-outline"
                                size={20}
                                color={userType === 'TRAINER' ? '#ffffff' : '#aaaaaa'}
                            />
                            <Text style={[styles.userTypeText, userType === 'TRAINER' && styles.userTypeTextActive]}>
                                {t('auth.trainer')}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.form}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>{t('auth.name')}</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="person-outline" size={20} color="#aaaaaa" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder={t('auth.name')}
                                    placeholderTextColor="#888888"
                                    value={name}
                                    onChangeText={setName}
                                    editable={!loading}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>{t('auth.email')}</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="mail-outline" size={20} color="#aaaaaa" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder={t('auth.email')}
                                    placeholderTextColor="#888888"
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    editable={!loading}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>{t('auth.password')}</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="lock-closed-outline" size={20} color="#aaaaaa" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder={t('auth.password')}
                                    placeholderTextColor="#888888"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                    editable={!loading}
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                    <Ionicons
                                        name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                                        size={20}
                                        color="#aaaaaa"
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[styles.signupButton, loading && styles.signupButtonDisabled]}
                            onPress={handleSignup}
                            activeOpacity={0.8}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={['#7cce06', '#6bb805']}
                                style={styles.buttonGradient}
                            >
                                <Text style={styles.signupButtonText}>
                                    {loading ? t('common.loading') : t('auth.signUp')}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Social signup — same layout as the login screen
                            so the two flows feel symmetric. Buttons are
                            stubbed until the EAS production build and
                            per-provider OAuth setup land. */}
                        <View style={styles.socialSection}>
                            <View style={styles.socialDivider}>
                                <View style={styles.socialDividerLine} />
                                <Text style={styles.socialDividerText}>{t('auth.orSignUpWith')}</Text>
                                <View style={styles.socialDividerLine} />
                            </View>

                            <View style={styles.socialButtons}>
                                <TouchableOpacity
                                    style={styles.socialButton}
                                    onPress={() => handleSocialSignup('google')}
                                    disabled={loading || socialLoading}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="logo-google" size={22} color="#DB4437" />
                                    <Text style={styles.socialButtonText}>Google</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.socialButton}
                                    onPress={() => handleSocialSignup('apple')}
                                    disabled={loading || socialLoading}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="logo-apple" size={22} color="#ffffff" />
                                    <Text style={styles.socialButtonText}>Apple</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.socialButton}
                                    onPress={() => handleSocialSignup('linkedin')}
                                    disabled={loading || socialLoading}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="logo-linkedin" size={22} color="#0A66C2" />
                                    <Text style={styles.socialButtonText}>LinkedIn</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <Text style={styles.terms}>{t('auth.terms')}</Text>

                        <View style={styles.loginContainer}>
                            <Text style={styles.loginText}>{t('auth.haveAccount')} </Text>
                            <TouchableOpacity onPress={() => router.push('/login' as any)}>
                                <Text style={styles.loginLink}>{t('auth.signIn')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#02000e',
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
        paddingTop: 60,
    },
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
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    header: {
        marginBottom: 32,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        marginBottom: 8,
        color: '#ffffff',
    },
    subtitle: {
        fontSize: 16,
        color: '#cccccc',
    },
    userTypeContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 32,
    },
    userTypeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        gap: 8,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderColor: 'rgba(255,255,255,0.2)',
    },
    userTypeButtonActive: {
        backgroundColor: '#7cce06',
        borderColor: '#7cce06',
    },
    userTypeText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#aaaaaa',
    },
    userTypeTextActive: {
        color: '#ffffff',
    },
    form: {
        flex: 1,
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
        color: '#ffffff',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        paddingHorizontal: 16,
        borderWidth: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderColor: 'rgba(255,255,255,0.2)',
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        fontSize: 16,
        paddingVertical: 16,
        color: '#ffffff',
    },
    signupButton: {
        borderRadius: 12,
        overflow: 'hidden',
        marginTop: 8,
        shadowColor: '#7cce06',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    signupButtonDisabled: {
        opacity: 0.6,
    },
    buttonGradient: {
        paddingVertical: 16,
    },
    signupButtonText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ffffff',
        textAlign: 'center',
    },

    // Social signup section — mirrored from login.tsx so the two
    // screens look like siblings. Style names differ ("socialDivider")
    // because signup already has a "divider" used elsewhere.
    socialSection: { marginTop: 24 },
    socialDivider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 18,
    },
    socialDividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    socialDividerText: {
        color: '#aaa',
        paddingHorizontal: 12,
        fontSize: 13,
    },
    socialButtons: {
        flexDirection: 'row',
        gap: 10,
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
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '600',
    },
    terms: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 20,
        lineHeight: 18,
        color: '#aaaaaa',
    },
    termsLink: {
        color: '#7cce06',
        fontWeight: '600',
    },
    loginContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 24,
    },
    loginText: {
        fontSize: 15,
        color: '#cccccc',
    },
    loginLink: {
        fontSize: 15,
        color: '#7cce06',
        fontWeight: 'bold',
    },
});