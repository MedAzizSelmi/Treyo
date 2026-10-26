import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView,
    ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, enrollmentService, downloadAttestation } from '../services/api';

/**
 * My attestations — the attestation de participation for every course the
 * learner completed. One is issued when the trainer's end-of-course report
 * marks the learner as having completed; it is also emailed, and the
 * congratulation notification opens it too.
 *
 * This replaced a "My Certificates" screen that showed two made-up
 * certificates. Treyo issues attestations, not certificates: a course that
 * prepares for a certification leaves the test to LeanConsulting.
 */
export default function MyAttestationsScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);

    const load = async () => {
        try {
            const user = await authService.getCurrentUser();
            if (!user?.userId) { setItems([]); return; }
            const data = await enrollmentService.getStudentEnrollments(user.userId);
            const list = (Array.isArray(data) ? data : []).filter((e: any) => e.hasAttestation);
            list.sort((a: any, b: any) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
            setItems(list);
        } catch (_) {
            setItems([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(useCallback(() => { load(); }, []));

    const download = async (enrollmentId: string) => {
        setDownloading(enrollmentId);
        try {
            const shared = await downloadAttestation(enrollmentId);
            if (!shared) Alert.alert(t('attestations.title'), t('attestations.noShare'));
        } catch (_) {
            Alert.alert(t('attestations.title'), t('attestations.failed'));
        } finally {
            setDownloading(null);
        }
    };

    const fmt = (iso?: string) => {
        if (!iso) return '';
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? ''
            : d.toLocaleDateString(i18n.language || undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <ScreenBackground>
            <LinearGradient colors={['rgba(124,206,6,0.15)', 'rgba(10,5,32,0)']} style={styles.headerGradient} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('attestations.title')}</Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.centered}><ActivityIndicator size="large" color="#7cce06" /></View>
            ) : items.length === 0 ? (
                <View style={styles.centered}>
                    <Ionicons name="ribbon-outline" size={42} color="rgba(255,255,255,0.25)" />
                    <Text style={styles.emptyTitle}>{t('attestations.empty')}</Text>
                    <Text style={styles.emptyBody}>{t('attestations.emptyBody')}</Text>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#7cce06" />}
                >
                    {items.map(e => (
                        <View key={e.enrollmentId} style={styles.card}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <LinearGradient colors={['#7cce06', '#6bb805']} style={styles.icon}>
                                <Ionicons name="ribbon" size={24} color="#ffffff" />
                            </LinearGradient>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.cardTitle} numberOfLines={2}>{e.courseTitle || t('home.course')}</Text>
                                {!!e.trainerName && <Text style={styles.cardSub} numberOfLines={1}>{e.trainerName}</Text>}
                                {!!e.completedAt && (
                                    <Text style={styles.cardDate}>{t('attestations.completedOn', { date: fmt(e.completedAt) })}</Text>
                                )}
                            </View>
                            <TouchableOpacity style={styles.downloadBtn} onPress={() => download(e.enrollmentId)}
                                disabled={downloading === e.enrollmentId} accessibilityLabel={t('attestations.download')}>
                                {downloading === e.enrollmentId
                                    ? <ActivityIndicator size="small" color="#7cce06" />
                                    : <Ionicons name="download-outline" size={20} color="#7cce06" />}
                            </TouchableOpacity>
                        </View>
                    ))}
                    <View style={{ height: 30 }} />
                </ScrollView>
            )}
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 180 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    },
    backBtn: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 17, color: '#ffffff', fontWeight: '700' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
    emptyTitle: { fontSize: 16, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
    emptyBody: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 19 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
    card: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 14, marginBottom: 10,
    },
    icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 14, color: '#ffffff', fontWeight: '600' },
    cardSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
    cardDate: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
    downloadBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(124,206,6,0.12)', alignItems: 'center', justifyContent: 'center',
    },
});
