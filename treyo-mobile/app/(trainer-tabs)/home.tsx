import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { ScreenBackground } from '../../components/ScreenBackground';
import {useSafeAreaInsets} from "react-native-safe-area-context";

export default function TrainerHomeScreen() {
    const { colors } = useTheme();
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = () => {
        setRefreshing(true);
        setTimeout(() => setRefreshing(false), 1000);
    };
    const insets = useSafeAreaInsets();

    return (
        <ScreenBackground style={styles.container}>
            <LinearGradient colors={['#2b12c6', '#1a0a7a']} style={styles.header}>
                <View style={styles.headerContent}>
                    <View>
                        <Text style={styles.greeting}>Hello, Trainer! 👋</Text>
                        <Text style={styles.subtitle}>Here's your dashboard</Text>
                    </View>
                    <TouchableOpacity style={styles.notificationButton}>
                        <Ionicons name="notifications-outline" size={24} color="#ffffff" />
                        <View style={styles.badge} />
                    </TouchableOpacity>
                </View>

                <View style={styles.statsGrid}>
                    <StatCard title="Total Students" value="234" icon="people" color="#7cce06" />
                    <StatCard title="Total Revenue" value="$12.5k" icon="cash" color="#FFD700" />
                    <StatCard title="Active Courses" value="8" icon="book" color="#FF6B6B" />
                    <StatCard title="Avg Rating" value="4.8" icon="star" color="#FFA500" />
                </View>
            </LinearGradient>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}>
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>My Formations</Text>
                    <FormationCard title="React Native Bootcamp" students={45} groups={3} status="Active" colors={colors} />
                    <FormationCard title="Advanced JavaScript" students={32} groups={2} status="Active" colors={colors} />
                </View>

                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Pending Requests</Text>
                    <RequestCard student="John Doe" formation="React Native Bootcamp" type="Group Session" time="2h ago" colors={colors} />
                    <RequestCard student="Jane Smith" formation="Advanced JavaScript" type="One-to-One" time="5h ago" colors={colors} />
                </View>

                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming Sessions</Text>
                    <SessionCard title="React Native - Group 1" date="Tomorrow, 10:00 AM" students={15} colors={colors} />
                    <SessionCard title="JavaScript - Private Session" date="Today, 3:00 PM" students={1} colors={colors} />
                </View>
            </ScrollView>
        </ScreenBackground>
    );
}

function StatCard({ title, value, icon, color }: any) {
    return (
        <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
                <Ionicons name={icon} size={24} color={color} />
            </View>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statTitle}>{title}</Text>
        </View>
    );
}

function FormationCard({ title, students, groups, status, colors }: any) {
    return (
        <TouchableOpacity style={[styles.formationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <LinearGradient colors={['#2b12c6', '#1a0a7a']} style={styles.formationIcon}>
                <Ionicons name="book" size={24} color="#ffffff" />
            </LinearGradient>
            <View style={styles.formationInfo}>
                <Text style={[styles.formationTitle, { color: colors.text }]}>{title}</Text>
                <View style={styles.formationStats}>
                    <Text style={[styles.formationStat, { color: colors.textSecondary }]}>{students} students</Text>
                    <Text style={[styles.formationStat, { color: colors.textSecondary }]}>• {groups} groups</Text>
                </View>
            </View>
            <View style={[styles.statusBadge, status === 'Active' && styles.statusActive]}>
                <Text style={styles.statusText}>{status}</Text>
            </View>
        </TouchableOpacity>
    );
}

function RequestCard({ student, formation, type, time, colors }: any) {
    return (
        <View style={[styles.requestCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.requestAvatar}>
                <Ionicons name="person" size={24} color="#7cce06" />
            </View>
            <View style={styles.requestInfo}>
                <Text style={[styles.requestStudent, { color: colors.text }]}>{student}</Text>
                <Text style={[styles.requestFormation, { color: colors.textSecondary }]}>{formation} • {type}</Text>
                <Text style={[styles.requestTime, { color: colors.textTertiary }]}>{time}</Text>
            </View>
            <View style={styles.requestActions}>
                <TouchableOpacity style={styles.acceptButton}>
                    <Ionicons name="checkmark" size={20} color="#ffffff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.declineButton}>
                    <Ionicons name="close" size={20} color="#ff6b6b" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

function SessionCard({ title, date, students, colors }: any) {
    return (
        <TouchableOpacity style={[styles.sessionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={24} color="#2b12c6" />
            <View style={styles.sessionInfo}>
                <Text style={[styles.sessionTitle, { color: colors.text }]}>{title}</Text>
                <Text style={styles.sessionDate}>{date}</Text>
                <Text style={[styles.sessionStudents, { color: colors.textSecondary }]}>{students} student{students > 1 ? 's' : ''}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingBottom: 100 },
    header: { paddingTop: 60, paddingBottom: 24, paddingHorizontal: 20 },
    headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    greeting: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
    subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
    notificationButton: { width: 44, height: 44, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    badge: { width: 8, height: 8, backgroundColor: '#7cce06', borderRadius: 4, position: 'absolute', top: 10, right: 10 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    statCard: { width: '48%', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 16, alignItems: 'center' },
    statIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    statValue: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
    statTitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
    content: { flex: 1 },
    section: { padding: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
    formationCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    formationIcon: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    formationInfo: { flex: 1 },
    formationTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    formationStats: { flexDirection: 'row', gap: 8 },
    formationStat: { fontSize: 13 },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: '#f0f0f0' },
    statusActive: { backgroundColor: '#e8f5e9' },
    statusText: { fontSize: 12, fontWeight: '600', color: '#7cce06' },
    requestCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    requestAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f0fde4', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    requestInfo: { flex: 1 },
    requestStudent: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    requestFormation: { fontSize: 13, marginBottom: 2 },
    requestTime: { fontSize: 12 },
    requestActions: { flexDirection: 'row', gap: 8 },
    acceptButton: { width: 36, height: 36, backgroundColor: '#7cce06', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    declineButton: { width: 36, height: 36, backgroundColor: '#fff5f5', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    sessionCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    sessionInfo: { flex: 1, marginLeft: 12 },
    sessionTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
    sessionDate: { fontSize: 14, color: '#2b12c6', marginBottom: 2 },
    sessionStudents: { fontSize: 12 },
});