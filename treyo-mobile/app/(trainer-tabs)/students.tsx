import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { ScreenBackground } from '../../components/ScreenBackground';
import {useSafeAreaInsets} from "react-native-safe-area-context";

export default function StudentsScreen() {
    const { colors } = useTheme();
    const students = [
        { id: 1, name: 'John Doe', formation: 'React Native Bootcamp', progress: 65, group: 'Group 1' },
        { id: 2, name: 'Jane Smith', formation: 'Advanced JavaScript', progress: 80, group: 'Group 2' },
        { id: 3, name: 'Alex Brown', formation: 'React Native Bootcamp', progress: 45, group: 'Group 1' },
    ];
    const insets = useSafeAreaInsets();

    return (
        <ScreenBackground style={styles.container}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>My Students</Text>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>{students.length} students enrolled</Text>
            </View>
            <ScrollView style={styles.content}>
                {students.map(student => (
                    <TouchableOpacity key={student.id} style={[styles.studentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <LinearGradient colors={['#2b12c6', '#1a0a7a']} style={styles.avatar}>
                            <Ionicons name="person" size={28} color="#ffffff" />
                        </LinearGradient>
                        <View style={styles.studentInfo}>
                            <Text style={[styles.studentName, { color: colors.text }]}>{student.name}</Text>
                            <Text style={styles.formation}>{student.formation}</Text>
                            <Text style={[styles.group, { color: colors.textSecondary }]}>{student.group}</Text>
                            <View style={styles.progressContainer}>
                                <View style={[styles.progressBar, { backgroundColor: colors.backgroundTertiary }]}>
                                    <View style={[styles.progressFill, { width: `${student.progress}%` }]} />
                                </View>
                                <Text style={styles.progressText}>{student.progress}%</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                ))}
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
    studentCard: { flexDirection: 'row', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    avatar: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    studentInfo: { flex: 1 },
    studentName: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    formation: { fontSize: 13, color: '#2b12c6', marginBottom: 2 },
    group: { fontSize: 12, marginBottom: 8 },
    progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    progressBar: { flex: 1, height: 6, borderRadius: 3 },
    progressFill: { height: 6, backgroundColor: '#7cce06', borderRadius: 3 },
    progressText: { fontSize: 12, fontWeight: '600', color: '#7cce06', width: 40 },
});