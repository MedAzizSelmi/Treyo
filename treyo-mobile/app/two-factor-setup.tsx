import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
    ActivityIndicator, Alert, Share, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { ScreenBackground } from '../components/ScreenBackground';
import { twoFactorService } from '../services/api';

/**
 * Turning on two-factor authentication.
 *
 * Three steps, in one screen, because they have to happen in order and
 * splitting them across routes would let someone leave half way with a
 * secret stored and no way to produce a code:
 *
 *   scan    the QR (or copy the key, if the camera is not an option)
 *   verify  a code, which is what actually switches 2FA on
 *   save    the recovery codes, shown exactly once
 *
 * The backend deliberately does not enable anything until the verify
 * step succeeds, so abandoning this screen at step one is harmless.
 */
export default function TwoFactorSetupScreen() {
    const router = useRouter();

    const [step, setStep] = useState<'loading' | 'scan' | 'codes'>('loading');
    const [secret, setSecret] = useState('');
    const [otpauthUri, setOtpauthUri] = useState('');
    const [code, setCode] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const data = await twoFactorService.setup();
                setSecret(data.secret);
                setOtpauthUri(data.otpauthUri);
                setStep('scan');
            } catch (e: any) {
                Alert.alert(
                    'Setup unavailable',
                    e?.response?.data?.message || 'Could not start two-factor setup.',
                    [{ text: 'OK', onPress: () => router.back() }],
                );
            }
        })();
    }, []);

    const verify = async () => {
        const cleaned = code.replace(/\D/g, '');
        if (cleaned.length !== 6) {
            setError('Enter the 6-digit code from your app.');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const data = await twoFactorService.enable(cleaned);
            setRecoveryCodes(data.recoveryCodes || []);
            setStep('codes');
        } catch (e: any) {
            setError(e?.response?.data?.message || 'That code is not right.');
        } finally {
            setSubmitting(false);
        }
    };

    const copySecret = async () => {
        await Clipboard.setStringAsync(secret);
        Alert.alert('Copied', 'Setup key copied to the clipboard.');
    };

    const shareCodes = async () => {
        // Share rather than only copy: these need to end up somewhere
        // that is not this phone, since the phone is what they recover.
        try {
            await Share.share({
                message: `Treyo recovery codes — keep these somewhere safe.\n\n${recoveryCodes.join('\n')}`,
            });
        } catch (_) {}
    };

    if (step === 'loading') {
        return (
            <ScreenBackground>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#7cce06" />
                </View>
            </ScreenBackground>
        );
    }

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
                    <Text style={styles.headerTitle}>
                        {step === 'codes' ? 'Save your recovery codes' : 'Two-factor authentication'}
                    </Text>
                </View>

                {step === 'scan' && (
                    <>
                        <Text style={styles.lead}>
                            Scan this with Google Authenticator, Authy, or any
                            authenticator app. Then enter the 6-digit code it shows.
                        </Text>

                        <View style={styles.qrCard}>
                            {/* White plate behind the QR on purpose: scanners
                                need the light-on-dark contrast the spec assumes,
                                and this screen's background is near-black. */}
                            {!!otpauthUri && (
                                <QRCode value={otpauthUri} size={200} backgroundColor="#ffffff" />
                            )}
                        </View>

                        <Text style={styles.orLabel}>Can't scan it?</Text>
                        <TouchableOpacity style={styles.secretRow} onPress={copySecret}>
                            <Text style={styles.secretText} selectable>{secret}</Text>
                            <Ionicons name="copy-outline" size={18} color="#7cce06" />
                        </TouchableOpacity>
                        <Text style={styles.hint}>
                            Enter that key manually in your app, then come back here.
                        </Text>

                        <TextInput
                            style={styles.codeInput}
                            value={code}
                            onChangeText={(t) => { setCode(t); setError(''); }}
                            placeholder="000000"
                            placeholderTextColor="rgba(255,255,255,0.3)"
                            keyboardType="number-pad"
                            maxLength={6}
                            autoFocus={false}
                            textAlign="center"
                        />
                        {!!error && <Text style={styles.error}>{error}</Text>}

                        <TouchableOpacity
                            style={[styles.primaryBtn, submitting && styles.btnDisabled]}
                            onPress={verify}
                            disabled={submitting}
                        >
                            {submitting
                                ? <ActivityIndicator color="#02000e" />
                                : <Text style={styles.primaryBtnText}>Turn on</Text>}
                        </TouchableOpacity>
                    </>
                )}

                {step === 'codes' && (
                    <>
                        <View style={styles.warnCard}>
                            <Ionicons name="warning-outline" size={20} color="#ffcc33" />
                            <Text style={styles.warnText}>
                                This is the only time these are shown. Save them now —
                                each one signs you in once if you lose your phone.
                            </Text>
                        </View>

                        <View style={styles.codesCard}>
                            {recoveryCodes.map((c) => (
                                <Text key={c} style={styles.recoveryCode} selectable>{c}</Text>
                            ))}
                        </View>

                        <TouchableOpacity style={styles.secondaryBtn} onPress={shareCodes}>
                            <Ionicons name="share-outline" size={18} color="#7cce06" />
                            <Text style={styles.secondaryBtnText}>Save or share</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.primaryBtn}
                            onPress={() => router.back()}
                        >
                            <Text style={styles.primaryBtnText}>I've saved them</Text>
                        </TouchableOpacity>
                    </>
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 48 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    backBtn: { padding: 6, marginRight: 10 },
    headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '700', flex: 1 },
    lead: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 21, marginBottom: 20 },
    qrCard: {
        alignSelf: 'center', backgroundColor: '#ffffff', padding: 16,
        borderRadius: 16, marginBottom: 24,
    },
    orLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 8 },
    secretRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10,
        paddingVertical: 12, paddingHorizontal: 14,
    },
    secretText: { color: '#ffffff', fontSize: 13, letterSpacing: 1.5, flex: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    hint: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 8, marginBottom: 24 },
    codeInput: {
        backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
        color: '#ffffff', fontSize: 28, letterSpacing: 10, paddingVertical: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    },
    error: { color: '#ff6b6b', fontSize: 13, marginTop: 10 },
    primaryBtn: {
        backgroundColor: '#7cce06', borderRadius: 12, paddingVertical: 15,
        alignItems: 'center', marginTop: 20,
    },
    primaryBtnText: { color: '#02000e', fontSize: 16, fontWeight: '700' },
    btnDisabled: { opacity: 0.6 },
    secondaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderRadius: 12, paddingVertical: 14, marginTop: 18,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.5)',
    },
    secondaryBtnText: { color: '#7cce06', fontSize: 15, fontWeight: '600' },
    warnCard: {
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        backgroundColor: 'rgba(255,204,51,0.12)', borderRadius: 12, padding: 14,
        borderWidth: 1, borderColor: 'rgba(255,204,51,0.3)', marginBottom: 20,
    },
    warnText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19, flex: 1 },
    codesCard: {
        backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
        paddingVertical: 16, alignItems: 'center',
    },
    recoveryCode: {
        color: '#ffffff', fontSize: 17, letterSpacing: 2, paddingVertical: 5,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
});
