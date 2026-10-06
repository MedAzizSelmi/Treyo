import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService } from '../services/api';

/**
 * Shown straight after signing up.
 *
 * Registration no longer returns a token: the address has to be confirmed
 * first, so there is nothing to enter yet. This screen is the whole
 * post-signup experience — it says where the mail went, lets the user ask
 * for another one, and sends them to the sign-in screen once they have
 * clicked the link.
 */
export default function VerifyEmailSentScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { email } = useLocalSearchParams<{ email?: string }>();
    const address = (email || '').trim();

    // Same anti-spam pattern as the forgot-password screen.
    const [cooldown, setCooldown] = useState(0);
    const [resending, setResending] = useState(false);

    useEffect(() => {
        if (cooldown <= 0) return;
        const id = setInterval(() => setCooldown(c => c - 1), 1000);
        return () => clearInterval(id);
    }, [cooldown]);

    const handleResend = async () => {
        if (cooldown > 0 || resending || !address) return;
        setResending(true);
        try {
            await authService.resendVerification(address.toLowerCase());
        } catch (_) {
            // The endpoint answers identically for unknown addresses; an
            // error here must not reveal the opposite.
        } finally {
            setCooldown(30);
            setResending(false);
            Alert.alert(t('auth.verifyEmailTitle'), t('auth.resendSent'));
        }
    };

    return (
        <ScreenBackground>
            <View style={styles.container}>
                <View style={styles.iconWrap}>
                    <Ionicons name="mail-open-outline" size={44} color="#7cce06" />
                </View>

                <Text style={styles.title}>{t('auth.verifyEmailTitle')}</Text>
                <Text style={styles.body}>
                    {t('auth.verifyEmailBody', { email: address })}
                </Text>

                <View style={styles.card}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Text style={styles.cardText}>{t('auth.didntReceive')}</Text>
                    <TouchableOpacity
                        onPress={handleResend}
                        disabled={cooldown > 0 || resending}
                        style={[styles.resendBtn, (cooldown > 0 || resending) && { opacity: 0.5 }]}
                        activeOpacity={0.85}
                    >
                        {resending ? (
                            <ActivityIndicator size="small" color="#7cce06" />
                        ) : (
                            <Text style={styles.resendText}>
                                {cooldown > 0
                                    ? `${t('auth.resendEmail')} (${cooldown}s)`
                                    : t('auth.resendEmail')}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => router.replace('/login' as any)}
                    activeOpacity={0.9}
                >
                    <Text style={styles.primaryText}>{t('auth.signIn')}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.replace('/login' as any)}>
                    <Text style={styles.link}>{t('auth.backToLogin')}</Text>
                </TouchableOpacity>
            </View>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
    iconWrap: {
        width: 88, height: 88, borderRadius: 44, alignSelf: 'center',
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
        backgroundColor: 'rgba(124,206,6,0.12)',
    },
    title: { fontSize: 24, fontWeight: '700', color: '#ffffff', textAlign: 'center', marginBottom: 12 },
    body: { fontSize: 15, color: '#aaaaaa', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
    card: {
        borderRadius: 16, padding: 18, marginBottom: 28, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center',
    },
    cardText: { fontSize: 14, color: '#aaaaaa', marginBottom: 10 },
    resendBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    resendText: { fontSize: 15, fontWeight: '600', color: '#7cce06' },
    primaryBtn: {
        backgroundColor: '#7cce06', borderRadius: 14, paddingVertical: 16,
        alignItems: 'center', marginBottom: 16,
    },
    primaryText: { fontSize: 16, fontWeight: '700', color: '#000000' },
    link: { fontSize: 14, color: '#aaaaaa', textAlign: 'center' },
});
