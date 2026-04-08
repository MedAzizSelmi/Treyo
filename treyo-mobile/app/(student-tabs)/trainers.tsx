import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { ScreenBackground } from '../../components/ScreenBackground';
import {useSafeAreaInsets} from "react-native-safe-area-context";

export default function TrainersScreen() {
    const { colors } = useTheme();
    const trainers = [
        { id: 1, name: 'John Doe', specialization: 'Web Development', rating: 4.8, students: 234, courses: 'React Native Bootcamp' },
        { id: 2, name: 'Jane Smith', specialization: 'UI/UX Design', rating: 4.9, students: 189, courses: 'Design Masterclass' },
        { id: 3, name: 'Alex Brown', specialization: 'Data Science', rating: 4.7, students: 312, courses: 'Python for Data Science' },
    ];
    const insets = useSafeAreaInsets();

    return (
        <ScreenBackground style={styles.container}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>My Trainers</Text>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Trainers you're learning from</Text>
            </View>

            <ScrollView style={styles.content}>
                {trainers.map(trainer => (
                    <TouchableOpacity key={trainer.id} style={[styles.trainerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <LinearGradient colors={['#7cce06', '#6bb805']} style={styles.avatar}>
                            <Ionicons name="person" size={32} color="#ffffff" />
                        </LinearGradient>

                        <View style={styles.trainerInfo}>
                            <Text style={[styles.trainerName, { color: colors.text }]}>{trainer.name}</Text>
                            <Text style={[styles.specialization, { color: colors.textSecondary }]}>{trainer.specialization}</Text>
                            <Text style={styles.courses} numberOfLines={1}>📚 {trainer.courses}</Text>

                            <View style={styles.stats}>
                                <View style={styles.statItem}>
                                    <Ionicons name="star" size={14} color="#FFD700" />
                                    <Text style={[styles.statText, { color: colors.textSecondary }]}>{trainer.rating}</Text>
                                </View>
                                <View style={styles.statItem}>
                                    <Ionicons name="people" size={14} color={colors.textTertiary} />
                                    <Text style={[styles.statText, { color: colors.textSecondary }]}>{trainer.students} students</Text>
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.messageButton}>
                            <Ionicons name="chatbubble-outline" size={20} color="#7cce06" />
                        </TouchableOpacity>
                    </TouchableOpacity>
                ))}

                {trainers.length === 0 && (
                    <View style={styles.emptyState}>
                        <Ionicons name="people-outline" size={64} color={colors.textTertiary} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No trainers yet</Text>
                        <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>Enroll in a course to connect with trainers</Text>
                    </View>
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingBottom: 100 },
    header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1 },
    headerTitle: { fontSize: 24, fontWeight: 'bold' },
    headerSubtitle: { fontSize: 14, marginTop: 4 },
    content: { flex: 1, padding: 20 },
    trainerCard: { flexDirection: 'row', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, alignItems: 'center' },
    avatar: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    trainerInfo: { flex: 1 },
    trainerName: { fontSize: 17, fontWeight: 'bold', marginBottom: 4 },
    specialization: { fontSize: 14, marginBottom: 4 },
    courses: { fontSize: 13, color: '#7cce06', marginBottom: 8 },
    stats: { flexDirection: 'row', gap: 16 },
    statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statText: { fontSize: 13 },
    messageButton: { width: 44, height: 44, backgroundColor: '#f0fde4', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
    emptyText: { fontSize: 18, fontWeight: 'bold', marginTop: 16 },
    emptySubtext: { fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 },
});