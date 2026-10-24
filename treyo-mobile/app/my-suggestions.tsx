import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useCallback, useState } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { courseSuggestionService } from '../services/api';

/** Status → colour. "rejected" (not a course request) reads as plain Closed. */
const STATUS_COLOR: Record<string, string> = {
    new: '#aaaaaa',
    searching: '#FFA500',
    published: '#7cce06',
    declined: '#ff8a8a',
    rejected: '#888888',
    withdrawn: '#888888',
};

/**
 * The courses a learner suggested, or said "me too" to, and where each
 * stands. A published one opens its course; an open one can be taken
 * back — withdrawn by its author, un-"me too"-ed by anyone else.
 */
export default function MySuggestionsScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = async () => {
        try {
            setItems(await courseSuggestionService.mine());
        } catch (_) {
            setItems([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(useCallback(() => { load(); }, []));

    const statusLabel = (s: string) => t(`mySuggestions.status_${s}`, { defaultValue: s });

    const handleTakeBack = (item: any) => {
        Alert.alert(
            item.mine ? t('mySuggestions.withdrawTitle') : t('mySuggestions.unsupportTitle'),
            item.mine ? t('mySuggestions.withdrawBody') : t('mySuggestions.unsupportBody'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('common.confirm'), style: 'destructive', onPress: async () => {
                        try {
                            if (item.mine) await courseSuggestionService.withdraw(item.suggestionId);
                            else await courseSuggestionService.unsupport(item.suggestionId);
                            load();
                        } catch (e: any) {
                            Alert.alert(t('common.error'), e?.response?.data?.message || t('suggest.errorGeneric'));
                        }
                    },
                },
            ],
        );
    };

    return (
        <ScreenBackground>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#7cce06" />}
            >
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={20} color="#ffffff" />
                    </TouchableOpacity>
                    <Text style={styles.title}>{t('suggest.mySuggestions')}</Text>
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color="#7cce06" style={{ marginTop: 60 }} />
                ) : items.length === 0 ? (
                    <View style={styles.empty}>
                        <Ionicons name="bulb-outline" size={48} color="rgba(124,206,6,0.4)" />
                        <Text style={styles.emptyTitle}>{t('mySuggestions.emptyTitle')}</Text>
                        <Text style={styles.emptyBody}>{t('mySuggestions.emptyBody')}</Text>
                    </View>
                ) : items.map(item => {
                    const open = item.status === 'new' || item.status === 'searching';
                    const color = STATUS_COLOR[item.status] || '#aaaaaa';
                    return (
                        <TouchableOpacity
                            key={item.suggestionId}
                            style={styles.card}
                            activeOpacity={item.courseId ? 0.85 : 1}
                            onPress={() => item.status === 'published' && item.courseId
                                && router.push({ pathname: '/course-detail' as any, params: { courseId: item.courseId } })}
                        >
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <View style={styles.cardTop}>
                                <Text style={styles.topic} numberOfLines={2}>{item.topic}</Text>
                                <View style={[styles.badge, { borderColor: color }]}>
                                    <Text style={[styles.badgeText, { color }]}>{statusLabel(item.status)}</Text>
                                </View>
                            </View>
                            {!!item.details && <Text style={styles.details} numberOfLines={3}>{item.details}</Text>}
                            <Text style={styles.meta}>
                                {item.mine ? t('mySuggestions.yours') : t('mySuggestions.backed')}
                                {' · '}{t('suggest.learnersWant', { count: item.supporters })}
                            </Text>
                            {item.status === 'published' && (
                                <Text style={styles.openCourse}>{t('mySuggestions.openCourse')} ›</Text>
                            )}
                            {open && (
                                <TouchableOpacity onPress={() => handleTakeBack(item)} style={styles.takeBack}>
                                    <Text style={styles.takeBackText}>
                                        {item.mine ? t('mySuggestions.withdraw') : t('mySuggestions.unsupport')}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </TouchableOpacity>
                    );
                })}

                <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/suggest-course' as any)} activeOpacity={0.85}>
                    <Ionicons name="add-circle-outline" size={18} color="#000" />
                    <Text style={styles.newText}>{t('suggest.title')}</Text>
                </TouchableOpacity>
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 48 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    backBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center',
    },
    title: { color: '#ffffff', fontSize: 22, fontWeight: '800' },

    empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24, gap: 8 },
    emptyTitle: { color: '#ffffff', fontSize: 17, fontWeight: '700', marginTop: 8 },
    emptyBody: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', lineHeight: 21 },

    card: {
        borderRadius: 16, overflow: 'hidden', padding: 14, marginBottom: 10,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    topic: { flex: 1, color: '#ffffff', fontSize: 15, fontWeight: '700' },
    badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    details: { color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 19, marginTop: 6 },
    meta: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 8 },
    openCourse: { color: '#7cce06', fontSize: 13, fontWeight: '700', marginTop: 8 },
    takeBack: { alignSelf: 'flex-start', marginTop: 10 },
    takeBackText: { color: '#ff8a8a', fontSize: 13, fontWeight: '600' },

    newBtn: {
        flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#7cce06', borderRadius: 16, paddingVertical: 14, marginTop: 16,
    },
    newText: { color: '#000', fontSize: 15, fontWeight: '800' },
});
