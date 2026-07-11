import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

const { width, height } = Dimensions.get('screen');

/**
 * Shown when a trainer attempts to log in after their application
 * was rejected. The explanation note (if the admin attached one)
 * goes in the rejection EMAIL — not surfaced here because we don't
 * have an authenticated session to read it back. Pointing them at
 * their inbox keeps the messaging consistent across channels.
 */
export default function TrainerRejectedScreen() {
    const router = useRouter();
    const { t } = useTranslation();

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#160e45', '#02000e']} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { direction: 'ltr' }]} pointerEvents="none">
                <LinearGradient colors={['rgba(255,84,84,0.45)', 'rgba(255,84,84,0.18)', 'transparent']} style={styles.topGlow} />
                <LinearGradient colors={['transparent', 'rgba(124,206,6,0.18)', 'rgba(124,206,6,0.4)']} style={styles.bottomGlow} />
            </View>

            <View style={styles.content}>
                <View style={styles.iconCircle}>
                    <Ionicons name="alert-circle-outline" size={48} color="#ff5454" />
                </View>
                <Text style={styles.title}>{t('trainerApproval.rejectedTitle')}</Text>
                <Text style={styles.body}>{t('trainerApproval.rejectedBody')}</Text>
                <Text style={styles.note}>{t('trainerApproval.rejectedNote')}</Text>
            </View>

            <View style={styles.buttons}>
                <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => router.replace('/login' as any)}
                    activeOpacity={0.85}
                >
                    <LinearGradient colors={['#7cce06', '#6bb805']} style={styles.buttonGradient}>
                        <Text style={styles.primaryButtonText}>{t('auth.backToLogin')}</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#02000e' },
    topGlow: { position: 'absolute', width, height: height * 0.35, top: -100 },
    bottomGlow: { position: 'absolute', width, height: height * 0.4, bottom: -180 },

    content: {
        flex: 1,
        alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 32,
    },
    iconCircle: {
        width: 96, height: 96, borderRadius: 48,
        backgroundColor: 'rgba(255,84,84,0.12)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 26, fontWeight: '700', color: '#ffffff',
        textAlign: 'center', marginBottom: 14,
    },
    body: {
        fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,0.75)',
        textAlign: 'center', marginBottom: 14,
    },
    note: {
        fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.45)',
        textAlign: 'center',
    },

    buttons: { paddingHorizontal: 30, paddingBottom: 50, gap: 16 },
    primaryButton: { borderRadius: 28, overflow: 'hidden' },
    buttonGradient: { paddingVertical: 18, alignItems: 'center', borderRadius: 28 },
    primaryButtonText: { color: '#ffffff', fontSize: 17, fontWeight: 'bold' },
});
