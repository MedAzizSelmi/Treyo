import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
    Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService } from '../services/api';
import { EmailCodeField } from '../components/EmailCodeField';

/**
 * Self-service account deletion — required by Google Play for any app
 * that creates accounts, and the in-app half of that requirement (the
 * other half is the public page on the website).
 *
 * Two deliberate frictions: the password is retyped, and a final
 * confirmation dialog follows. Nothing here is recoverable afterwards.
 *
 * An account created with Google or LinkedIn has no password its owner
 * knows, so this screen also offers a code emailed to the account's
 * address. It does the same job as the password — proving the person, not
 * just the unlocked phone — and helps anyone who has forgotten theirs.
 */
export default function DeleteAccountScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [password, setPassword] = useState('');
    const [useCode, setUseCode] = useState(false);
    const [code, setCode] = useState('');
    const [show, setShow] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isTrainer, setIsTrainer] = useState(false);

    useEffect(() => {
        authService.getCurrentUser()
            .then(u => setIsTrainer((u?.role || u?.userType) === 'TRAINER'))
            .catch(() => {});
    }, []);

    const ready = useCode ? code.length === 6 : !!password;

    const confirm = () => {
        if (!ready) return;
        Alert.alert(
            t('deleteAccount.confirmTitle'),
            t('deleteAccount.confirmBody'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('deleteAccount.deleteButton'), style: 'destructive', onPress: submit },
            ],
        );
    };

    const submit = async () => {
        setLoading(true);
        try {
            await authService.deleteAccount(useCode ? { code } : { password });
            Alert.alert(
                t('deleteAccount.deletedTitle'),
                t('deleteAccount.deletedBody'),
                [{ text: t('common.ok'), onPress: () => router.replace('/login' as any) }],
            );
        } catch (e: any) {
            const status = e?.response?.status;
            Alert.alert(
                t('common.error'),
                status === 403
                    ? (useCode ? t('emailCode.wrongCode') : t('deleteAccount.wrongPassword'))
                    : (e?.response?.data?.message || t('deleteAccount.failed')),
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScreenBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                            <Ionicons name="arrow-back" size={22} color="#ffffff" />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.headerTitle}>{t('deleteAccount.title')}</Text>
                            <Text style={styles.headerSubtitle}>{t('deleteAccount.subtitle')}</Text>
                        </View>
                    </View>

                    <View style={styles.warnCard}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.warnHeader}>
                            <Ionicons name="warning-outline" size={20} color="#ff6b6b" />
                            <Text style={styles.warnTitle}>{t('deleteAccount.warningTitle')}</Text>
                        </View>
                        <Bullet text={t('deleteAccount.erased')} />
                        <Bullet text={t('deleteAccount.kept')} />
                        <Bullet text={t('deleteAccount.noSignIn')} />
                        {isTrainer && <Bullet text={t('deleteAccount.trainerNote')} />}
                    </View>

                    {useCode ? (
                        <>
                            <Text style={styles.label}>{t('deleteAccount.confirmCode')}</Text>
                            <EmailCodeField
                                purpose="delete-account"
                                value={code}
                                onChangeText={setCode}
                                disabled={loading}
                            />
                        </>
                    ) : (
                        <>
                            <Text style={styles.label}>{t('deleteAccount.confirmPassword')}</Text>
                            <View style={styles.inputWrap}>
                                <Ionicons name="lock-closed-outline" size={20} color="#aaa" />
                                <TextInput
                                    style={styles.input}
                                    placeholder={t('deleteAccount.passwordPlaceholder')}
                                    placeholderTextColor="#777"
                                    secureTextEntry={!show}
                                    value={password}
                                    onChangeText={setPassword}
                                    autoCapitalize="none"
                                    editable={!loading}
                                />
                                <TouchableOpacity onPress={() => setShow(!show)}>
                                    <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.5)" />
                                </TouchableOpacity>
                            </View>
                        </>
                    )}

                    <TouchableOpacity
                        onPress={() => { setUseCode(u => !u); setPassword(''); setCode(''); }}
                        style={styles.switchBtn}
                        disabled={loading}
                    >
                        <Text style={styles.switchText}>
                            {useCode ? t('deleteAccount.usePassword') : t('deleteAccount.useCode')}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.deleteBtn, (!ready || loading) && { opacity: 0.5 }]}
                        onPress={confirm}
                        disabled={!ready || loading}
                        activeOpacity={0.85}
                    >
                        {loading
                            ? <ActivityIndicator color="#ffffff" />
                            : <Text style={styles.deleteText}>{t('deleteAccount.deleteButton')}</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
                        <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </ScreenBackground>
    );
}

function Bullet({ text }: { text: string }) {
    return (
        <View style={styles.bulletRow}>
            <View style={styles.dot} />
            <Text style={styles.bulletText}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    content: { padding: 20, paddingTop: 60 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
    backBtn: {
        width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
    headerSubtitle: { fontSize: 13, color: '#aaaaaa', marginTop: 2 },
    warnCard: {
        borderRadius: 16, padding: 18, marginBottom: 28, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,107,107,0.25)',
    },
    warnHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    warnTitle: { fontSize: 15, fontWeight: '700', color: '#ff6b6b' },
    bulletRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    dot: {
        width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)', marginTop: 7,
    },
    bulletText: { flex: 1, fontSize: 13.5, color: '#cccccc', lineHeight: 20 },
    label: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 10 },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16,
        paddingVertical: 14, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    input: { flex: 1, fontSize: 15, color: '#ffffff' },
    switchBtn: { paddingVertical: 14, marginBottom: 14 },
    switchText: { fontSize: 13, color: '#7cce06', lineHeight: 19 },
    deleteBtn: {
        backgroundColor: '#c62828', borderRadius: 14, paddingVertical: 16,
        alignItems: 'center', marginBottom: 14,
    },
    deleteText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
    cancelBtn: { paddingVertical: 14, alignItems: 'center' },
    cancelText: { fontSize: 15, color: '#aaaaaa' },
});
