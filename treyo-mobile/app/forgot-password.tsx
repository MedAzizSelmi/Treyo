import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
    KeyboardAvoidingView, Platform, Alert, Dimensions, ActivityIndicator,
    I18nManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/api';

const { width, height } = Dimensions.get('screen');

/**
 * Forgot-password flow, screen 1 / 2.
 *
 * User enters their email → we POST /api/auth/forgot-password.
 * Backend always responds 200 (it silently no-ops for unknown emails),
 * so we always show the same "check your inbox" confirmation.
 * The email then contains a reset link → tapping it (or pasting the
 * code) goes to reset-password.tsx.
 *
 * Footer link goes straight to /reset-password so a user who already
 * has the email open on another device can paste the code without
 * having to start the flow over.
 */
export default function ForgotPasswordScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    // Cooldown countdown so the user can't spam Resend. Decrements every
    // second; we re-enable the button when it hits 0.
    const [cooldown, setCooldown] = useState(0);
    const [resending, setResending] = useState(false);

    useEffect(() => {
        if (cooldown <= 0) return;
        const id = setInterval(() => setCooldown(c => c - 1), 1000);
        return () => clearInterval(id);
    }, [cooldown]);

    const handleSend = async () => {
        if (!email.trim()) {
            Alert.alert(t('common.error'), t('auth.fillAllFields'));
            return;
        }
        setLoading(true);
        try {
            await authService.forgotPassword(email.trim().toLowerCase());
            setSent(true);
            setCooldown(30);
        } catch (_) {
            // The backend silently no-ops for unknown emails, so a 200
            // is the expected path. A 5xx ends up here — still show the
            // same confirmation rather than leak which emails are
            // registered.
            setSent(true);
            setCooldown(30);
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (cooldown > 0 || resending) return;
        setResending(true);
        try {
            await authService.forgotPassword(email.trim().toLowerCase());
            setCooldown(30);
        } catch (_) {
            setCooldown(30);
        } finally {
            setResending(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            <LinearGradient colors={['#160e45', '#02000e']} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { direction: 'ltr' }]} pointerEvents="none">
                <LinearGradient colors={['rgba(124,206,6,0.6)', 'rgba(124,206,6,0.25)', 'transparent']} style={styles.topGlow} />
                <LinearGradient colors={['transparent', 'rgba(124,206,6,0.25)', 'rgba(124,206,6,0.6)']} style={styles.bottomGlow} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>

                {!sent ? (
                    <>
                        <View style={styles.header}>
                            <View style={styles.iconCircle}>
                                <Ionicons name="lock-closed-outline" size={32} color="#7cce06" />
                            </View>
                            <Text style={styles.title}>{t('auth.forgotPasswordTitle')}</Text>
                            <Text style={styles.subtitle}>{t('auth.forgotPasswordBody')}</Text>
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
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    editable={!loading}
                                />
                            </View>

                            <TouchableOpacity
                                style={[styles.submitButton, loading && { opacity: 0.6 }]}
                                onPress={handleSend}
                                disabled={loading}
                                activeOpacity={0.85}
                            >
                                <LinearGradient colors={['#7cce06', '#6bb805']} style={styles.buttonGradient}>
                                    {loading
                                        ? <ActivityIndicator color="#000" />
                                        : <Text style={styles.submitButtonText}>{t('auth.sendResetLink')}</Text>}
                                </LinearGradient>
                            </TouchableOpacity>

                            {/* Link for users who already have the email open
                                — saves a round trip when re-entering. */}
                            <TouchableOpacity
                                style={styles.secondaryLink}
                                onPress={() => router.push('/reset-password' as any)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.secondaryLinkText}>{t('auth.haveResetCode')}</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                ) : (
                    <View style={styles.confirmWrap}>
                        <View style={styles.iconCircleLarge}>
                            <Ionicons name="mail" size={42} color="#7cce06" />
                        </View>
                        <Text style={styles.title}>{t('auth.checkInbox')}</Text>

                        {/* Show the address the link was sent to so the
                            user knows exactly which inbox to open. */}
                        <View style={styles.emailChip}>
                            <Ionicons name="mail-outline" size={14} color="#7cce06" />
                            <Text style={styles.emailChipText} numberOfLines={1}>{email.trim().toLowerCase()}</Text>
                        </View>

                        <Text style={styles.subtitle}>{t('auth.checkInboxBody')}</Text>

                        {/* Primary CTA — for users who already have the
                            email open on this device, drops them into
                            the reset screen to paste the code. */}
                        <TouchableOpacity
                            style={[styles.submitButton, { marginTop: 28 }]}
                            onPress={() => router.push('/reset-password' as any)}
                            activeOpacity={0.85}
                        >
                            <LinearGradient colors={['#7cce06', '#6bb805']} style={styles.buttonGradient}>
                                <Text style={styles.submitButtonText}>{t('auth.haveResetCode')}</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Resend block — text + button on one line, with
                            a 30s cooldown shown inline so the user knows
                            why it's disabled instead of guessing. */}
                        <View style={styles.resendRow}>
                            <Text style={styles.resendHint}>{t('auth.didntReceive')}</Text>
                            <TouchableOpacity
                                onPress={handleResend}
                                disabled={cooldown > 0 || resending}
                                activeOpacity={0.7}
                            >
                                {resending ? (
                                    <ActivityIndicator size="small" color="#7cce06" />
                                ) : (
                                    <Text style={[styles.resendLink, cooldown > 0 && { color: 'rgba(124,206,6,0.4)' }]}>
                                        {cooldown > 0 ? `${t('auth.resendEmail')} (${cooldown}s)` : t('auth.resendEmail')}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* Divider before the secondary action keeps the
                            visual hierarchy clear — primary in green,
                            then resend, then back-to-login. */}
                        <View style={styles.divider} />

                        <TouchableOpacity onPress={() => router.replace('/login' as any)} activeOpacity={0.7}>
                            <Text style={styles.secondaryLinkText}>{t('auth.backToLogin')}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#02000e' },
    scrollContent: { flexGrow: 1, padding: 24, paddingTop: 60 },

    topGlow: { position: 'absolute', width, height: height * 0.35, top: -100 },
    bottomGlow: { position: 'absolute', width, height: height * 0.4, bottom: -180 },

    backButton: {
        width: 40, height: 40, borderRadius: 12,
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginBottom: 30,
    },

    header: { alignItems: 'center', marginBottom: 32 },
    iconCircle: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(124,206,6,0.12)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
    },
    iconCircleLarge: {
        width: 88, height: 88, borderRadius: 44,
        backgroundColor: 'rgba(124,206,6,0.12)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
    },
    title: { fontSize: 24, fontWeight: '700', color: '#ffffff', marginBottom: 10, textAlign: 'center' },
    subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 21 },

    form: { width: '100%' },
    inputContainer: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14, paddingHorizontal: 16, paddingVertical: 4,
        marginBottom: 18,
    },
    input: { flex: 1, color: '#ffffff', fontSize: 15, paddingVertical: 16 },

    submitButton: { borderRadius: 28, overflow: 'hidden' },
    buttonGradient: { paddingVertical: 16, alignItems: 'center' },
    submitButtonText: { color: '#000', fontSize: 16, fontWeight: '700' },

    secondaryLink: { alignItems: 'center', paddingVertical: 18 },
    secondaryLinkText: { color: '#7cce06', fontSize: 14, fontWeight: '600' },

    confirmWrap: { alignItems: 'center', paddingTop: 30, width: '100%' },

    emailChip: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(124,206,6,0.10)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        borderRadius: 999,
        paddingHorizontal: 14, paddingVertical: 8,
        marginTop: 14, marginBottom: 14,
        maxWidth: '90%',
    },
    emailChipText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },

    resendRow: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        marginTop: 22,
    },
    resendHint: { color: 'rgba(255,255,255,0.55)', fontSize: 14 },
    resendLink: { color: '#7cce06', fontSize: 14, fontWeight: '700' },

    divider: {
        width: '60%', height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginTop: 26, marginBottom: 20,
    },
});
