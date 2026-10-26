import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../services/api';

/**
 * The trainer a "New trainer" feed post introduces — photo, name,
 * speciality, rating, courses — and the way to their profile. An
 * administrator publishes these from the dashboard instead of notifying
 * every learner (backend TrainerIntroService).
 */
export function TrainerIntro({ trainer }: { trainer: any }) {
    const router = useRouter();
    const { t } = useTranslation();
    if (!trainer?.trainerId) return null;

    const photo = trainer.profilePictureUrl
        ? (String(trainer.profilePictureUrl).startsWith('http') ? trainer.profilePictureUrl : `${API_BASE_URL}${trainer.profilePictureUrl}`)
        : null;
    const specs: string[] = Array.isArray(trainer.specializations) ? trainer.specializations : [];
    const rating = trainer.averageRating != null ? Number(trainer.averageRating) : 0;

    return (
        <View style={styles.wrap}>
            <View style={styles.row}>
                {photo ? (
                    <Image source={{ uri: photo }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarLetter}>{String(trainer.name || '?')[0].toUpperCase()}</Text>
                    </View>
                )}
                <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{trainer.name}</Text>
                    {specs.length > 0 && (
                        <Text style={styles.specs} numberOfLines={1}>
                            {specs.slice(0, 3).map(s => String(s).replace(/_/g, ' ')).join(' · ')}
                        </Text>
                    )}
                    <View style={styles.meta}>
                        {rating > 0 && (
                            <View style={styles.metaItem}>
                                <Ionicons name="star" size={12} color="#FFD700" />
                                <Text style={styles.metaText}>{rating.toFixed(1)}</Text>
                            </View>
                        )}
                        <View style={styles.metaItem}>
                            <Ionicons name="school-outline" size={12} color="rgba(255,255,255,0.6)" />
                            <Text style={styles.metaText}>{t('feed.trainerCourses', { count: Number(trainer.courses || 0) })}</Text>
                        </View>
                    </View>
                </View>
            </View>
            <TouchableOpacity
                style={styles.button}
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: '/trainer-profile' as any, params: { trainerId: trainer.trainerId } })}
            >
                <Text style={styles.buttonText}>{t('feed.seeTrainer')}</Text>
                <Ionicons name="arrow-forward" size={16} color="#000" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        marginTop: 12, padding: 12, borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)', backgroundColor: 'rgba(124,206,6,0.06)',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 52, height: 52, borderRadius: 26 },
    avatarFallback: { backgroundColor: 'rgba(124,206,6,0.2)', alignItems: 'center', justifyContent: 'center' },
    avatarLetter: { color: '#7cce06', fontSize: 20, fontWeight: '800' },
    name: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
    specs: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
    meta: { flexDirection: 'row', gap: 12, marginTop: 4 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
    button: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        marginTop: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#7cce06',
    },
    buttonText: { color: '#000', fontSize: 14, fontWeight: '700' },
});
