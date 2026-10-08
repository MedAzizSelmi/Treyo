import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService } from '../services/api';
import { registerForPushNotifications } from '../services/push';

/**
 * The second factor, asked for after a correct password.
 *
 * Reached with a challenge token, which is all the sign-in attempt has
 * produced so far — it is not a session and grants nothing on its own.
 * The backend refuses it as an access token, so being stuck on this
 * screen means being stuck outside the app, which is the point.
 *
 * Also accepts a recovery code, because the common way to lose an
 * account to 2FA is to lose the phone holding the authenticator.
 */
export default function TwoFactorVerifyScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { challengeToken } = useLocalSearchParams<{ challengeToken: string }>();

    const [code, setCode] = useState('');
    const [useRecovery, setUseRecovery] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const submit = async () => {
        const value = useRecovery ? code.trim() : code.replace(/\D/g, '');
        if (!value || (!useRecovery && value.length !== 6)) {
            setError(useRecovery
                ? t('twoFactor.enterRecovery')
                : t('twoFactor.enterSixDigits'));
            return;
        }
        if (!challengeToken) {
            setError(t('twoFactor.challengeExpired'));
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            const response = await authService.verifyTwoFactor(String(challengeToken), value);
            if (response?.userId) {
                registerForPushNotifications(response.userId, response.role).catch(() => {});
            }
            const isTrainer = String(response.role || '').toUpperCase().includes('TRAINER');
            if (!response.onboardingComplete) {
                router.replace(isTrainer
                    ? '/onboarding/trainer/step1' as any
                    : '/onboarding/student/step1' as any);
            } else {
                router.replace(isTrainer
                    ? '/(trainer-tabs)/home' as any
                    : '/(student-tabs)/home' as any);
            }
        } catch (e: any) {
            const marker = String(e?.response?.data?.error || '');
            if (marker === 'CHALLENGE_EXPIRED') {
                // The challenge is good for five minutes. Past that there
                // is nothing to retry — the password has to be re-entered.
                setError(t('twoFactor.challengeExpired'));
                setTimeout(() => router.replace('/login' as any), 1600);
                return;
            }
            setError(e?.response?.data?.message || t('twoFactor.wrongCode'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ScreenBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.flex}
            >
                <View style={styles.content}>
                    <TouchableOpacity
                        onPress={() => router.replace('/login' as any)}
                        style={styles.backBtn}
                    >
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>

                    <View style={styles.iconWrap}>
                        <Ionicons name="shield-checkmark-outline" size={34} color="#7cce06" />
                    </View>

                    <Text style={styles.title}>{t('twoFactor.title')}</Text>
                    <Text style={styles.subtitle}>
                        {useRecovery
                            ? t('twoFactor.verifyRecoveryLead')
                            : t('twoFactor.verifyLead')}
                    </Text>

                    <TextInput
                        style={[styles.input, useRecovery && styles.inputRecovery]}
                        value={code}
                        onChangeText={(t) => { setCode(t); setError(''); }}
                        placeholder={useRecovery ? 'XXXX-XXXX' : '000000'}
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        keyboardType={useRecovery ? 'default' : 'number-pad'}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={useRecovery ? 9 : 6}
                        textAlign="center"
                        autoFocus
                    />
                    {!!error && <Text style={styles.error}>{error}</Text>}

                    <TouchableOpacity
                        style={[styles.primaryBtn, submitting && styles.btnDisabled]}
                        onPress={submit}
                        disabled={submitting}
                    >
                        {submitting
                            ? <ActivityIndicator color="#02000e" />
                            : <Text style={styles.primaryBtnText}>{t('twoFactor.verify')}</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => { setUseRecovery(!useRecovery); setCode(''); setError(''); }}
                        style={styles.switchMode}
                    >
                        <Text style={styles.switchModeText}>
                            {useRecovery
                                ? t('twoFactor.useAuthenticator')
                                : t('twoFactor.useRecovery')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    content: { flex: 1, padding: 24, justifyContent: 'center' },
    backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, left: 18, padding: 6 },
    iconWrap: {
        alignSelf: 'center', width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(124,206,6,0.12)', alignItems: 'center',
        justifyContent: 'center', marginBottom: 20,
    },
    title: { color: '#ffffff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
    subtitle: {
        color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 21,
        textAlign: 'center', marginTop: 10, marginBottom: 28,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
        color: '#ffffff', fontSize: 28, letterSpacing: 10, paddingVertical: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    },
    inputRecovery: { fontSize: 20, letterSpacing: 3 },
    error: { color: '#ff6b6b', fontSize: 13, marginTop: 10, textAlign: 'center' },
    primaryBtn: {
        backgroundColor: '#7cce06', borderRadius: 12, paddingVertical: 15,
        alignItems: 'center', marginTop: 22,
    },
    primaryBtnText: { color: '#02000e', fontSize: 16, fontWeight: '700' },
    btnDisabled: { opacity: 0.6 },
    switchMode: { marginTop: 20, alignItems: 'center' },
    switchModeText: { color: '#7cce06', fontSize: 14 },
});
