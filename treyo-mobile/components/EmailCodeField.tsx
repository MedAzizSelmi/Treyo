import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/api';

/** Seconds before "Resend" comes back, so an impatient tap doesn't burn the hourly allowance. */
const RESEND_AFTER = 30;

/**
 * "Email me a code", then a six-digit input — the stand-in for a password
 * on screens that ask for one.
 *
 * Accounts created with Google or LinkedIn have a password nobody knows,
 * so the delete-account and change-password screens could not be used by
 * them at all. The server emails the code to the account's own address;
 * this component only asks for it and collects what the user types.
 */
export function EmailCodeField({
    purpose, value, onChangeText, disabled,
}: {
    purpose: 'delete-account' | 'set-password';
    value: string;
    onChangeText: (code: string) => void;
    disabled?: boolean;
}) {
    const { t } = useTranslation();
    const [sending, setSending] = useState(false);
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [wait, setWait] = useState(0);

    useEffect(() => {
        if (wait <= 0) return;
        const id = setTimeout(() => setWait(w => w - 1), 1000);
        return () => clearTimeout(id);
    }, [wait]);

    const send = async () => {
        setSending(true);
        setError(null);
        try {
            const res = await authService.sendConfirmationCode(purpose);
            setSentTo(res.sentTo);
            onChangeText('');
            setWait(RESEND_AFTER);
        } catch (e: any) {
            setError(e?.response?.status === 429 ? t('emailCode.tooMany') : t('emailCode.sendFailed'));
        } finally {
            setSending(false);
        }
    };

    if (!sentTo) {
        return (
            <View>
                <TouchableOpacity
                    style={[styles.sendBtn, (sending || disabled) && { opacity: 0.6 }]}
                    onPress={send}
                    disabled={sending || disabled}
                    activeOpacity={0.85}
                >
                    {sending
                        ? <ActivityIndicator size="small" color="#7cce06" />
                        : (
                            <>
                                <Ionicons name="mail-outline" size={18} color="#7cce06" />
                                <Text style={styles.sendText}>{t('emailCode.send')}</Text>
                            </>
                        )}
                </TouchableOpacity>
                {!!error && <Text style={styles.error}>{error}</Text>}
            </View>
        );
    }

    return (
        <View>
            <Text style={styles.sentNote}>{t('emailCode.sentTo', { email: sentTo })}</Text>
            <View style={styles.inputWrap}>
                <Ionicons name="keypad-outline" size={20} color="#aaa" />
                <TextInput
                    style={styles.input}
                    placeholder={t('emailCode.placeholder')}
                    placeholderTextColor="#777"
                    value={value}
                    onChangeText={s => onChangeText(s.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    editable={!disabled}
                />
            </View>
            <TouchableOpacity
                onPress={send}
                disabled={wait > 0 || sending || disabled}
                style={styles.resendBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
                <Text style={[styles.resendText, (wait > 0 || sending) && { opacity: 0.45 }]}>
                    {wait > 0 ? t('emailCode.resendIn', { seconds: wait }) : t('emailCode.resend')}
                </Text>
            </TouchableOpacity>
            {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    sendBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 14, borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.35)',
        backgroundColor: 'rgba(124,206,6,0.08)',
    },
    sendText: { fontSize: 14, fontWeight: '600', color: '#7cce06' },
    sentNote: { fontSize: 13, color: '#cccccc', lineHeight: 19, marginBottom: 10 },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16,
        paddingVertical: 14, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    input: { flex: 1, fontSize: 18, color: '#ffffff', letterSpacing: 4 },
    resendBtn: { alignSelf: 'flex-start', paddingVertical: 10 },
    resendText: { fontSize: 13, fontWeight: '600', color: '#7cce06' },
    error: { fontSize: 13, color: '#ff6b6b', marginTop: 8, lineHeight: 18 },
});
