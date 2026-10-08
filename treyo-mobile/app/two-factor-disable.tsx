import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ActivityIndicator, ScrollView, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground } from '../components/ScreenBackground';
import { twoFactorService } from '../services/api';

/**
 * Switching two-factor authentication off.
 *
 * Asks for the password and a current code, both. The signed-in session
 * is deliberately not accepted as sufficient: removing the second factor
 * is precisely what someone who picked up an unlocked phone would do
 * first, and a session is the one thing they already have.
 *
 * A recovery code works in place of a TOTP code, so losing the phone
 * does not mean being stuck with 2FA permanently enabled.
 */
export default function TwoFactorDisableScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const submit = async () => {
        if (!password || !code.trim()) {
            setError(t('twoFactor.needBoth'));
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await twoFactorService.disable(password, code.trim());
            Alert.alert(
                t('twoFactor.disabledTitle'),
                t('twoFactor.disabledBody'),
                [{ text: 'OK', onPress: () => router.back() }],
            );
        } catch (e: any) {
            setError(e?.response?.data?.message || t('twoFactor.disableFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ScreenBackground>
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('twoFactor.disableTitle')}</Text>
                </View>

                <View style={styles.warnCard}>
                    <Ionicons name="alert-circle-outline" size={20} color="#ffcc33" />
                    <Text style={styles.warnText}>{t('twoFactor.disableWarning')}</Text>
                </View>

                <Text style={styles.label}>{t('twoFactor.password')}</Text>
                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={(t) => { setPassword(t); setError(''); }}
                        placeholder={t('twoFactor.passwordPlaceholder')}
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eye}>
                        <Ionicons
                            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                            size={20}
                            color="rgba(255,255,255,0.6)"
                        />
                    </TouchableOpacity>
                </View>

                <Text style={styles.label}>{t('twoFactor.codeOrRecovery')}</Text>
                <TextInput
                    style={[styles.input, styles.codeInput]}
                    value={code}
                    onChangeText={(t) => { setCode(t); setError(''); }}
                    placeholder="000000"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={9}
                />

                {!!error && <Text style={styles.error}>{error}</Text>}

                <TouchableOpacity
                    style={[styles.dangerBtn, submitting && styles.btnDisabled]}
                    onPress={submit}
                    disabled={submitting}
                >
                    {submitting
                        ? <ActivityIndicator color="#ffffff" />
                        : <Text style={styles.dangerBtnText}>{t('twoFactor.turnOff')}</Text>}
                </TouchableOpacity>
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 48 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    backBtn: { padding: 6, marginRight: 10 },
    headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '700', flex: 1 },
    warnCard: {
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        backgroundColor: 'rgba(255,204,51,0.12)', borderRadius: 12, padding: 14,
        borderWidth: 1, borderColor: 'rgba(255,204,51,0.3)', marginBottom: 24,
    },
    warnText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19, flex: 1 },
    label: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 8, marginTop: 6 },
    inputRow: { position: 'relative', justifyContent: 'center' },
    input: {
        backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
        color: '#ffffff', fontSize: 15, paddingVertical: 14, paddingHorizontal: 16,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginBottom: 14,
    },
    codeInput: { fontSize: 20, letterSpacing: 3, textAlign: 'center' },
    eye: { position: 'absolute', right: 14, bottom: 28 },
    error: { color: '#ff6b6b', fontSize: 13, marginTop: 4 },
    dangerBtn: {
        backgroundColor: '#c0392b', borderRadius: 12, paddingVertical: 15,
        alignItems: 'center', marginTop: 20,
    },
    dangerBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
    btnDisabled: { opacity: 0.6 },
});
