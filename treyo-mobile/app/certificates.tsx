import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { ScreenBackground } from '../components/ScreenBackground';

export default function CertificatesScreen() {
    const { colors } = useTheme();
    const router = useRouter();

    const certificates = [
        { id: 1, title: 'React Native Fundamentals', issuer: 'John Doe', date: '2024-01-15', verified: true },
        { id: 2, title: 'Advanced JavaScript', issuer: 'Jane Smith', date: '2023-12-10', verified: true },
    ];

    const handleShare = async (cert: any) => {
        try {
            await Share.share({
                message: `I earned a certificate in ${cert.title} from Treyo!`,
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    return (
        <ScreenBackground style={styles.container}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>My Certificates</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {certificates.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="ribbon-outline" size={64} color={colors.textTertiary} />
                        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No certificates yet</Text>
                        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Complete courses to earn certificates</Text>
                    </View>
                ) : (
                    certificates.map(cert => (
                        <View key={cert.id} style={[styles.certificateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <LinearGradient
                                colors={['#7cce06', '#6bb805']}
                                style={styles.certificateIcon}
                            >
                                <Ionicons name="ribbon" size={32} color="#ffffff" />
                            </LinearGradient>

                            <View style={styles.certificateInfo}>
                                <Text style={[styles.certificateTitle, { color: colors.text }]}>{cert.title}</Text>
                                <Text style={[styles.certificateIssuer, { color: colors.textSecondary }]}>Issued by {cert.issuer}</Text>
                                <Text style={[styles.certificateDate, { color: colors.textTertiary }]}>{cert.date}</Text>

                                {cert.verified && (
                                    <View style={styles.verifiedBadge}>
                                        <Ionicons name="checkmark-circle" size={14} color="#7cce06" />
                                        <Text style={styles.verifiedText}>Verified</Text>
                                    </View>
                                )}
                            </View>

                            <View style={styles.actions}>
                                <TouchableOpacity style={styles.actionButton}>
                                    <Ionicons name="download-outline" size={20} color="#7cce06" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.actionButton}
                                    onPress={() => handleShare(cert)}
                                >
                                    <Ionicons name="share-outline" size={20} color="#7cce06" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1 },
    backButton: { width: 40, height: 40, justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    content: { flex: 1, padding: 20 },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 16 },
    emptyText: { fontSize: 14, marginTop: 8 },
    certificateCard: { flexDirection: 'row', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    certificateIcon: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    certificateInfo: { flex: 1 },
    certificateTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    certificateIssuer: { fontSize: 13, marginBottom: 2 },
    certificateDate: { fontSize: 12, marginBottom: 8 },
    verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    verifiedText: { fontSize: 12, color: '#7cce06', fontWeight: '600' },
    actions: { gap: 8 },
    actionButton: { width: 36, height: 36, backgroundColor: '#f0fde4', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
});