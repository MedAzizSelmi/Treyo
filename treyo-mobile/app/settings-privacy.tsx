import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService } from '../services/api';

const HISTORY_KEY = 'student_search_history';
const LANGUAGE_KEY = 'app_language';
const TWO_FA_KEY = 'two_fa_enabled';

const LANGUAGE_LABELS: Record<string, string> = {
    en: 'English',
    fr: 'Français',
    ar: 'العربية',
    es: 'Español',
};

type RowProps = {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    danger?: boolean;
    rightLabel?: string;
};

const Row = ({ icon, title, subtitle, onPress, danger, rightLabel }: RowProps) => (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
        <View style={[styles.rowIconWrap, danger && styles.rowIconDanger]}>
            <Ionicons name={icon} size={18} color={danger ? '#ff5454' : '#7cce06'} />
        </View>
        <View style={styles.rowBody}>
            <Text style={[styles.rowTitle, danger && { color: '#ff7070' }]}>{title}</Text>
            {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
        </View>
        {rightLabel ? <Text style={styles.rowRight}>{rightLabel}</Text> : null}
        {onPress && <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />}
    </TouchableOpacity>
);

export default function SettingsPrivacyScreen() {
    const router = useRouter();
    const [language, setLanguage] = useState('en');
    const [twoFaOn, setTwoFaOn] = useState(false);
    const [userRole, setUserRole] = useState<string | null>(null);
    const appVersion = Constants.expoConfig?.version || '1.0.0';
    const isStudent = userRole === 'STUDENT';

    useEffect(() => {
        (async () => {
            const lang = await AsyncStorage.getItem(LANGUAGE_KEY);
            if (lang) setLanguage(lang);
            const twoFa = await AsyncStorage.getItem(TWO_FA_KEY);
            setTwoFaOn(twoFa === 'true');

            // Role drives which sections to show — students see search history & payment
            // history; trainers don't have either feature in the app.
            const user = await authService.getCurrentUser();
            if (user?.role) setUserRole(String(user.role));
        })();
    }, []);

    const handleClearSearchHistory = () => {
        Alert.alert(
            'Clear search history?',
            'Your past course searches will be removed from this device.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear', style: 'destructive',
                    onPress: async () => {
                        await AsyncStorage.removeItem(HISTORY_KEY);
                        Alert.alert('Cleared', 'Search history removed.');
                    },
                },
            ]
        );
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            'Delete account?',
            'This will permanently remove your account and all your data. This action cannot be undone.\n\n(Coming soon — contact support to request deletion in the meantime.)',
            [{ text: 'OK', style: 'cancel' }]
        );
    };

    return (
        <ScreenBackground>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* ── Header ── */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Settings & Privacy</Text>
                        <Text style={styles.headerSubtitle}>Manage your account and preferences</Text>
                    </View>
                </View>

                {/* ── Account ── */}
                <Text style={styles.sectionLabel}>ACCOUNT</Text>
                <View style={styles.card}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Row icon="lock-closed-outline" title="Privacy" subtitle="Password & two-factor authentication"
                         onPress={() => router.push('/settings-security' as any)} />
                </View>

                {/* ── Preferences ── */}
                <Text style={styles.sectionLabel}>PREFERENCES</Text>
                <View style={styles.card}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Row icon="language-outline" title="Language"
                         rightLabel={LANGUAGE_LABELS[language] || 'English'}
                         onPress={() => router.push('/settings-language' as any)} />
                    <View style={styles.divider} />
                    <Row icon="notifications-outline" title="Notifications" subtitle="Email & push preferences"
                         onPress={() => router.push('/notification-settings' as any)} />
                </View>

                {/* ── Billing (students only) ── */}
                {isStudent && (
                    <>
                        <Text style={styles.sectionLabel}>BILLING</Text>
                        <View style={styles.card}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <Row icon="card-outline" title="Payment History" subtitle="View past transactions"
                                 onPress={() => router.push('/settings-payments' as any)} />
                        </View>
                    </>
                )}

                {/* ── Data & Storage (students only — only they have search history) ── */}
                {isStudent && (
                    <>
                        <Text style={styles.sectionLabel}>DATA & STORAGE</Text>
                        <View style={styles.card}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <Row icon="time-outline" title="Clear Search History" subtitle="Remove course-search history from this device"
                                 onPress={handleClearSearchHistory} />
                        </View>
                    </>
                )}

                {/* ── Support & Legal ── */}
                <Text style={styles.sectionLabel}>SUPPORT & LEGAL</Text>
                <View style={styles.card}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Row icon="help-circle-outline" title="Help & Support"
                         onPress={() => router.push('/help-support' as any)} />
                    <View style={styles.divider} />
                    <Row icon="document-text-outline" title="Terms of Service"
                         onPress={() => Alert.alert('Terms of Service', 'Full terms will be hosted on our website. (Placeholder)')} />
                    <View style={styles.divider} />
                    <Row icon="shield-checkmark-outline" title="Privacy Policy"
                         onPress={() => Alert.alert('Privacy Policy', 'Full privacy policy will be hosted on our website. (Placeholder)')} />
                </View>

                {/* ── About ── */}
                <Text style={styles.sectionLabel}>ABOUT</Text>
                <View style={styles.card}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Row icon="information-circle-outline" title="App Version" rightLabel={`v${appVersion}`} />
                </View>

                {/* ── Danger zone ── */}
                <View style={[styles.card, { marginTop: 16 }]}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Row icon="trash-outline" title="Delete account"
                         subtitle="Permanently remove your account and data"
                         onPress={handleDeleteAccount} danger />
                </View>

                <Text style={styles.footer}>Made with care · Treyo</Text>
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 60, paddingHorizontal: 20 },

    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, marginBottom: 24 },
    backBtn: { padding: 2 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
    headerSubtitle: { fontSize: 13, color: '#aaaaaa', marginTop: 2 },

    sectionLabel: {
        fontSize: 11, fontWeight: '700', color: '#7cce06',
        letterSpacing: 0.6, marginBottom: 8, marginTop: 16,
    },
    card: {
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },

    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14 },
    rowIconWrap: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    rowIconDanger: { backgroundColor: 'rgba(255,84,84,0.12)' },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
    rowSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
    rowRight: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginRight: 6 },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 60 },

    footer: { fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 30 },
});
