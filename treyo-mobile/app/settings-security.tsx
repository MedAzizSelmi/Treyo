import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, twoFactorService } from '../services/api';

export default function SecuritySettingsScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // 2FA state comes from the server, not local storage. It used to be
    // kept in AsyncStorage, which meant the switch showed whatever this
    // device last remembered — including "on" for an account where it
    // was never actually enabled.
    const [twoFaOn, setTwoFaOn] = useState(false);
    const [recoveryLeft, setRecoveryLeft] = useState(0);
    const [twoFaLoading, setTwoFaLoading] = useState(true);

    const loadTwoFa = useCallback(async () => {
        try {
            const status = await twoFactorService.status();
            setTwoFaOn(!!status.enabled);
            setRecoveryLeft(status.recoveryCodesRemaining ?? 0);
        } catch (_) {
            // Leave the switch off rather than guessing; a failed read
            // must not imply the account is protected when it may not be.
            setTwoFaOn(false);
        } finally {
            setTwoFaLoading(false);
        }
    }, []);

    // Re-read on focus: coming back from the setup screen is exactly
    // when this value has just changed.
    useFocusEffect(useCallback(() => { loadTwoFa(); }, [loadTwoFa]));

    /** Visual strength from 0 (none) to 4 (very strong). */
    const passwordStrength = (() => {
        let score = 0;
        if (newPassword.length >= 8) score++;
        if (/[A-Z]/.test(newPassword)) score++;
        if (/[0-9]/.test(newPassword)) score++;
        if (/[^A-Za-z0-9]/.test(newPassword)) score++;
        return score;
    })();
    const strengthLabel = ['', t('security.strengthWeak'), t('security.strengthFair'), t('security.strengthGood'), t('security.strengthStrong')][passwordStrength];
    const strengthColor = ['transparent', '#ff5454', '#ffa500', '#7cce06', '#7cce06'][passwordStrength];

    const handleSubmit = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            return Alert.alert(t('security.missingFields'), t('security.missingFieldsBody'));
        }
        if (newPassword.length < 8) {
            return Alert.alert(t('security.tooShort'), t('security.tooShortBody'));
        }
        if (newPassword !== confirmPassword) {
            return Alert.alert(t('security.noMatch'), t('security.noMatchBody'));
        }
        if (newPassword === currentPassword) {
            return Alert.alert(t('security.chooseNew'), t('security.chooseNewBody'));
        }

        setSubmitting(true);
        try {
            await authService.changePassword(currentPassword, newPassword);
            Alert.alert(t('security.updated'), t('security.updatedBody'));
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        } catch (err: any) {
            const msg = err?.response?.data?.error
                || err?.response?.data?.message
                || err?.message
                || t('security.updateFailedBody');
            Alert.alert(t('security.updateFailed'), msg);
        } finally {
            setSubmitting(false);
        }
    };

    /**
     * Switching on hands off to the setup screen, which is where the
     * secret is shown and a code proves the app works. Nothing is
     * enabled here, so flicking the switch and backing out changes
     * nothing about how the account signs in.
     */
    const handleToggle2FA = async (value: boolean) => {
        if (value) {
            router.push('/two-factor-setup' as any);
            return;
        }
        promptDisable();
    };

    /**
     * Switching off asks for the password and a current code again. A
     * session alone is not enough: stripping the second factor is the
     * first thing someone holding an unlocked phone would want to do.
     * Two fields means its own screen, not an alert.
     */
    const promptDisable = () => {
        router.push('/two-factor-disable' as any);
    };

    return (
        <ScreenBackground>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>{t('security.title')}</Text>
                        <Text style={styles.headerSubtitle}>{t('security.subtitle')}</Text>
                    </View>
                </View>

                {/* ── Change password ── */}
                <Text style={styles.sectionLabel}>{t('security.changePassword')}</Text>
                <View style={styles.card}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />

                    <PasswordField
                        label={t('security.currentPassword')}
                        value={currentPassword}
                        onChangeText={setCurrentPassword}
                        show={showCurrent}
                        onToggleShow={() => setShowCurrent(s => !s)}
                    />
                    <View style={styles.divider} />
                    <PasswordField
                        label={t('security.newPassword')}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        show={showNew}
                        onToggleShow={() => setShowNew(s => !s)}
                        helper={t('security.passwordHelper')}
                    />

                    {newPassword.length > 0 && (
                        <View style={styles.strengthRow}>
                            <View style={styles.strengthBars}>
                                {[1, 2, 3, 4].map(i => (
                                    <View key={i} style={[
                                        styles.strengthBar,
                                        { backgroundColor: i <= passwordStrength ? strengthColor : 'rgba(255,255,255,0.08)' }
                                    ]} />
                                ))}
                            </View>
                            <Text style={[styles.strengthLabel, { color: strengthColor }]}>{strengthLabel}</Text>
                        </View>
                    )}

                    <View style={styles.divider} />
                    <PasswordField
                        label={t('security.confirmPassword')}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        show={showConfirm}
                        onToggleShow={() => setShowConfirm(s => !s)}
                    />
                </View>

                <TouchableOpacity
                    style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={submitting}
                    activeOpacity={0.85}
                >
                    {submitting
                        ? <ActivityIndicator size="small" color="#000" />
                        : <Text style={styles.submitText}>{t('security.updatePassword')}</Text>}
                </TouchableOpacity>

                {/* ── 2FA ── */}
                <Text style={styles.sectionLabel}>{t('security.twoFactor')}</Text>
                <View style={styles.card}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.twoFaRow}>
                        <View style={styles.twoFaIconWrap}>
                            <Ionicons name="shield-checkmark-outline" size={22} color="#7cce06" />
                        </View>
                        <View style={styles.twoFaBody}>
                            <Text style={styles.twoFaTitle}>{t('security.authenticatorApp')}</Text>
                            <Text style={styles.twoFaSubtitle}>
                                {twoFaOn ? t('security.authenticatorOn') : t('security.authenticatorOff')}
                            </Text>
                            {/* Worth surfacing: these are spent one per use,
                                and running out while the phone is lost is
                                how people lock themselves out for good. */}
                            {twoFaOn && (
                                <Text style={styles.recoveryNote}>
                                    {recoveryLeft} recovery {recoveryLeft === 1 ? 'code' : 'codes'} left
                                </Text>
                            )}
                        </View>
                        {twoFaLoading ? (
                            <ActivityIndicator color="#7cce06" />
                        ) : (
                            <Switch
                                value={twoFaOn}
                                onValueChange={handleToggle2FA}
                                trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(124,206,6,0.5)' }}
                                thumbColor={twoFaOn ? '#7cce06' : '#ffffff'}
                                ios_backgroundColor="rgba(255,255,255,0.15)"
                            />
                        )}
                    </View>
                </View>

                {/* ── Active sessions placeholder ── */}
                <Text style={styles.sectionLabel}>{t('security.activeSessions')}</Text>
                <View style={styles.card}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.sessionRow}>
                        <View style={styles.sessionDot} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.sessionTitle}>{t('security.thisDevice')}</Text>
                            <Text style={styles.sessionSubtitle}>{t('security.activeNow')}</Text>
                        </View>
                        <Text style={styles.sessionTag}>{t('security.current')}</Text>
                    </View>
                </View>

                <View style={styles.tipWrap}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="bulb-outline" size={16} color="#7cce06" />
                    <Text style={styles.tipText}>{t('security.tip')}</Text>
                </View>

                {/* Account deletion. Required in-app by Google Play for any
                    app with accounts; the confirmation and warnings live on
                    the destination screen, not behind this row. */}
                <TouchableOpacity
                    style={styles.dangerRow}
                    onPress={() => router.push('/delete-account' as any)}
                    activeOpacity={0.8}
                >
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="trash-outline" size={20} color="#ff6b6b" />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.dangerTitle}>{t('deleteAccount.title')}</Text>
                        <Text style={styles.dangerSubtitle}>{t('deleteAccount.subtitle')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
            </ScrollView>
        </ScreenBackground>
    );
}

// ── Password input subcomponent ───────────────────────────────────────────────
function PasswordField({
    label, value, onChangeText, show, onToggleShow, helper,
}: {
    label: string; value: string; onChangeText: (s: string) => void;
    show: boolean; onToggleShow: () => void; helper?: string;
}) {
    return (
        <View style={pwStyles.wrap}>
            <Text style={pwStyles.label}>{label}</Text>
            <View style={pwStyles.row}>
                <TextInput
                    style={pwStyles.input}
                    value={value}
                    onChangeText={onChangeText}
                    secureTextEntry={!show}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                />
                <TouchableOpacity onPress={onToggleShow} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
            </View>
            {!!helper && <Text style={pwStyles.helper}>{helper}</Text>}
        </View>
    );
}

const pwStyles = StyleSheet.create({
    wrap: { paddingHorizontal: 16, paddingVertical: 12 },
    label: { fontSize: 12, color: '#7cce06', fontWeight: '600', marginBottom: 8, letterSpacing: 0.3 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    input: { flex: 1, fontSize: 14, color: '#ffffff', paddingVertical: 4 },
    helper: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8, lineHeight: 16 },
});

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 60, paddingHorizontal: 20 },

    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, marginBottom: 24 },
    backBtn: { padding: 2 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
    headerSubtitle: { fontSize: 13, color: '#aaaaaa', marginTop: 2 },

    sectionLabel: { fontSize: 11, fontWeight: '700', color: '#7cce06', letterSpacing: 0.6, marginBottom: 8, marginTop: 16 },
    card: {
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },

    strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
    strengthBars: { flex: 1, flexDirection: 'row', gap: 4 },
    strengthBar: { flex: 1, height: 4, borderRadius: 2 },
    strengthLabel: { fontSize: 11, fontWeight: '700', minWidth: 50, textAlign: 'right' },

    submitBtn: {
        backgroundColor: '#7cce06',
        borderRadius: 14, paddingVertical: 14,
        alignItems: 'center', marginTop: 14,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitText: { fontSize: 14, fontWeight: '700', color: '#000' },

    recoveryNote: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 3 },
    twoFaRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
    twoFaIconWrap: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center',
    },
    twoFaBody: { flex: 1 },
    twoFaTitle: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
    twoFaSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2, lineHeight: 17 },

    sessionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
    sessionDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7cce06' },
    sessionTitle: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
    sessionSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
    sessionTag: {
        fontSize: 11, fontWeight: '700', color: '#7cce06',
        backgroundColor: 'rgba(124,206,6,0.12)',
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    },

    dangerRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        marginTop: 16, padding: 16,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,107,107,0.22)',
    },
    dangerTitle: { fontSize: 15, fontWeight: '600', color: '#ff6b6b' },
    dangerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
    tipWrap: {
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        marginTop: 20, padding: 14,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.18)',
    },
    tipText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 18 },
});
