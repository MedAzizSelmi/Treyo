import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, trainerService } from '../services/api';

/**
 * Trainer's preferred display currency.
 *
 * Persisted server-side on Trainer.preferredCurrency so it survives
 * reinstalls and follows the trainer across devices. The value is
 * used as the default when creating a new course and as the label
 * when the trainer views revenue / earnings on their side of the app.
 *
 * Per-course prices keep their own currency field once the course is
 * saved — changing the setting later does not retro-apply.
 */

const CURRENCIES: { code: string; label: string; symbol: string }[] = [
    { code: 'TND', label: 'Tunisian Dinar', symbol: 'DT' },
    { code: 'USD', label: 'US Dollar', symbol: '$' },
    { code: 'EUR', label: 'Euro', symbol: '€' },
    { code: 'GBP', label: 'British Pound', symbol: '£' },
    { code: 'MAD', label: 'Moroccan Dirham', symbol: 'DH' },
    { code: 'DZD', label: 'Algerian Dinar', symbol: 'DA' },
    { code: 'EGP', label: 'Egyptian Pound', symbol: 'E£' },
    { code: 'SAR', label: 'Saudi Riyal', symbol: 'SR' },
    { code: 'AED', label: 'UAE Dirham', symbol: 'AED' },
];

export default function CurrencySettingsScreen() {
    const router = useRouter();
    const [selected, setSelected] = useState<string>('TND');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [trainerId, setTrainerId] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const user = await authService.getCurrentUser();
                if (!user?.userId) { setLoading(false); return; }
                setTrainerId(user.userId);
                const res = await trainerService.getCurrency(user.userId);
                setSelected(res.currency || 'TND');
            } catch (e) {
                console.warn('Failed to load trainer currency', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleSelect = async (code: string) => {
        if (!trainerId || saving || code === selected) return;
        setSaving(true);
        const previous = selected;
        setSelected(code); // optimistic
        try {
            await trainerService.setCurrency(trainerId, code);
        } catch (e) {
            console.warn('Failed to save currency', e);
            setSelected(previous);
        } finally {
            setSaving(false);
        }
    };

    return (
        <ScreenBackground>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Revenue currency</Text>
                        <Text style={styles.headerSubtitle}>
                            Default currency for the prices you set on your courses
                        </Text>
                    </View>
                    {saving && <ActivityIndicator size="small" color="#7cce06" />}
                </View>

                {loading ? (
                    <View style={{ paddingTop: 80, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : (
                    <View style={styles.card}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        {CURRENCIES.map((c, i) => {
                            const active = c.code === selected;
                            return (
                                <View key={c.code}>
                                    <TouchableOpacity
                                        style={styles.row}
                                        onPress={() => handleSelect(c.code)}
                                        activeOpacity={0.75}
                                    >
                                        <View style={styles.symbolWrap}>
                                            <Text style={styles.symbol}>{c.symbol}</Text>
                                        </View>
                                        <View style={styles.body}>
                                            <Text style={styles.label}>{c.code}</Text>
                                            <Text style={styles.native}>{c.label}</Text>
                                        </View>
                                        {active ? (
                                            <View style={styles.checkWrap}>
                                                <Ionicons name="checkmark" size={16} color="#000000" />
                                            </View>
                                        ) : (
                                            <View style={styles.radioOff} />
                                        )}
                                    </TouchableOpacity>
                                    {i < CURRENCIES.length - 1 && <View style={styles.divider} />}
                                </View>
                            );
                        })}
                    </View>
                )}

                <View style={styles.noteWrap}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="information-circle-outline" size={18} color="#7cce06" />
                    <Text style={styles.noteText}>
                        Applies to new courses you create. Courses you already published keep the currency they were saved with.
                    </Text>
                </View>
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

    card: {
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
    symbolWrap: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center', marginRight: 14,
    },
    symbol: { fontSize: 14, fontWeight: '700', color: '#7cce06' },
    body: { flex: 1 },
    label: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
    native: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
    checkWrap: {
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: '#7cce06',
        justifyContent: 'center', alignItems: 'center',
    },
    radioOff: {
        width: 22, height: 22, borderRadius: 11,
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 70 },

    noteWrap: {
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        marginTop: 16, padding: 14,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.18)',
    },
    noteText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 18 },
});
