import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
    KeyboardAvoidingView, Platform, Alert, Dimensions, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/api';

const { width, height } = Dimensions.get('screen');

/**
 * Forgot-password flow, screen 2 / 2.
 *
 * Receives the reset token either:
 *   1. As a `token` query param (when the email link deep-links into
 *      the app: treyomobile://reset-password?token=…), or
 *   2. Typed/pasted by the user into the "code" input — for when
 *      they're reading the email on a different device.
 *
 * On submit: POST /api/auth/reset-password → flip the user's password
 * hash on the backend. Success bounces back to /login so they can
 * sign in with the new password right away.
 */
export default function ResetPasswordScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { token: tokenParam } = useLocalSearchParams<{ token?: string }>();

    const [token, setToken] = useState<string>('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    // Auto-populate the token field if the deep link supplied it.
    useEffect(() => {
        if (tokenParam) setToken(String(tokenParam));
    }, [tokenParam]);

    const handleSubmit = async () => {
        if (!token.trim()) {
            Alert.alert(t('common.error'), t('auth.pasteToken'));
            return;
        }
        if (password.length < 8) {
            Alert.alert(t('common.error'), t('auth.passwordTooShort'));
            return;
        }
        if (password !== confirm) {
            Alert.alert(t('common.error'), t('auth.passwordsDontMatch'));
            return;
        }

        setLoading(true);
        try {
            await authService.resetPassword(token.trim(), password);
            Alert.alert(
                t('auth.resetSuccess'),
                t('auth.resetSuccessBody'),
                [{ text: t('common.ok'), onPress: () => router.replace('/login' as any) }],
            );
        } catch (e: any) {
            const msg = e?.response?.data?.error || t('auth.invalidResetLink');
            Alert.alert(t('common.error'), msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            <LinearGradient colors={['#160e45', '#02000e']} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { direction: 'ltr' }]} pointerEvents="none">
                <LinearGradient colors={['rgba(124,206,6,0.6)', 'rgba(124,206,6,0.25)', 'transparent']} style={styles.topGlow} />
                <LinearGradient colors={['transparent', 'rgba(124,206,6,0.25)', 'rgba(124,206,6,0.6)']} style={styles.bottomGlow} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>

                <View style={styles.header}>
                    <View style={styles.iconCircle}>
                        <Ionicons name="key-outline" size={32} color="#7cce06" />
                    </View>
                    <Text style={styles.title}>{t('auth.resetPasswordTitle')}</Text>
                    <Text style={styles.subtitle}>{t('auth.resetPasswordBody')}</Text>
                </View>

                <View style={styles.form}>
                    {/* Hide the token field if it came from the deep link —
                        no point asking the user to confirm something they
                        already pasted via the email. */}
                    {!tokenParam && (
                        <View style={styles.inputContainer}>
                            <Ionicons name="ticket-outline" size={20} color="#aaa" />
                            <TextInput
                                style={styles.input}
                                placeholder={t('auth.pasteToken')}
                                placeholderTextColor="#777"
                                value={token}
                                onChangeText={setToken}
                                autoCapitalize="none"
                                editable={!loading}
                            />
                        </View>
                    )}

                    <View style={styles.inputContainer}>
                        <Ionicons name="lock-closed-outline" size={20} color="#aaa" />
                        <TextInput
                            style={styles.input}
                            placeholder={t('auth.newPassword')}
                            placeholderTextColor="#777"
                            secureTextEntry={!showPassword}
                            value={password}
                            onChangeText={setPassword}
                            editable={!loading}
                        />
                        <TouchableOpacity onPress={() => setShowPassword(s => !s)}>
                            <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color="#aaa" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.inputContainer}>
                        <Ionicons name="lock-closed-outline" size={20} color="#aaa" />
                        <TextInput
                            style={styles.input}
                            placeholder={t('auth.confirmPassword')}
                            placeholderTextColor="#777"
                            secureTextEntry={!showPassword}
                            value={confirm}
                            onChangeText={setConfirm}
                            editable={!loading}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.submitButton, loading && { opacity: 0.6 }]}
                        onPress={handleSubmit}
                        disabled={loading}
                        activeOpacity={0.85}
                    >
                        <LinearGradient colors={['#7cce06', '#6bb805']} style={styles.buttonGradient}>
                            {loading
                                ? <ActivityIndicator color="#000" />
                                : <Text style={styles.submitButtonText}>{t('auth.updatePassword')}</Text>}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
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
    title: { fontSize: 24, fontWeight: '700', color: '#ffffff', marginBottom: 10, textAlign: 'center' },
    subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 21 },

    form: { width: '100%' },
    inputContainer: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14, paddingHorizontal: 16, paddingVertical: 4,
        marginBottom: 16,
    },
    input: { flex: 1, color: '#ffffff', fontSize: 15, paddingVertical: 16 },

    submitButton: { borderRadius: 28, overflow: 'hidden', marginTop: 8 },
    buttonGradient: { paddingVertical: 16, alignItems: 'center' },
    submitButtonText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
