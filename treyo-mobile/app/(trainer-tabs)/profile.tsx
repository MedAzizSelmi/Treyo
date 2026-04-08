import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { authService } from '../../services/api';
import { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { ScreenBackground } from '../../components/ScreenBackground';
import {useSafeAreaInsets} from "react-native-safe-area-context";

export default function TrainerProfileScreen() {
    const { colors } = useTheme();
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const insets = useSafeAreaInsets();

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
    };

    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: async () => {
                    await authService.logout();
                    router.replace('/' as any);
                }},
        ]);
    };

    return (
        <ScreenBackground>
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
        >
            <LinearGradient colors={['#2b12c6', '#1a0a7a']} style={styles.header}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'T'}</Text>
                </View>
                <Text style={styles.name}>{user?.name || 'Trainer'}</Text>
                <Text style={styles.email}>{user?.email || 'trainer@example.com'}</Text>
                <View style={styles.stats}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>234</Text>
                        <Text style={styles.statLabel}>Students</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>8</Text>
                        <Text style={styles.statLabel}>Courses</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>4.8</Text>
                        <Text style={styles.statLabel}>Rating</Text>
                    </View>
                </View>
            </LinearGradient>

            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Professional Info</Text>
                <InfoItem label="Specialization" value="Web Development" colors={colors} />
                <InfoItem label="Experience" value="5 years" colors={colors} />
                <InfoItem label="Education" value="Master in CS" colors={colors} />
            </View>

            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings</Text>
                <MenuItem icon="person-outline" title="Edit Profile" onPress={() => router.push('/edit-profile' as any)} colors={colors} />
                <MenuItem icon="book-outline" title="My Courses" onPress={() => Alert.alert('My Courses', 'View and manage your courses')} colors={colors} />
                <MenuItem icon="notifications-outline" title="Notification Settings" onPress={() => router.push('/notification-settings' as any)} colors={colors} />
                <MenuItem icon="help-circle-outline" title="Help & Support" onPress={() => router.push('/help-support' as any)} colors={colors} />
                <MenuItem icon="information-circle-outline" title="About Treyo" onPress={() => Alert.alert('About Treyo', 'Treyo - Smart match, swift growth\nVersion 1.0.0')} colors={colors} />

                <TouchableOpacity style={[styles.logoutButton, { backgroundColor: colors.card, borderColor: '#ffcccc' }]} onPress={handleLogout}>
                    <Ionicons name="log-out-outline" size={20} color="#ff4444" />
                    <Text style={styles.logoutText}>Logout</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
        </ScreenBackground>
    );
}

function InfoItem({ label, value, colors }: any) {
    return (
        <View style={[styles.infoItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
        </View>
    );
}

function MenuItem({ icon, title, onPress, colors }: any) {
    return (
        <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.card }]} onPress={onPress}>
            <View style={styles.menuItemLeft}>
                <Ionicons name={icon} size={22} color="#2b12c6" />
                <Text style={[styles.menuItemText, { color: colors.text }]}>{title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    contentContainer: { paddingBottom: 120 }, // Fixed: moved to contentContainerStyle with more padding
    header: { paddingTop: 60, paddingBottom: 32, alignItems: 'center' },
    avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#7cce06', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    avatarText: { fontSize: 32, fontWeight: 'bold', color: '#ffffff' },
    name: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
    email: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 24 },
    stats: { flexDirection: 'row', gap: 32 },
    statItem: { alignItems: 'center' },
    statValue: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
    statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
    section: { padding: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
    infoItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
    infoLabel: { fontSize: 14 },
    infoValue: { fontSize: 14, fontWeight: '600' },
    menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderRadius: 12, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    menuItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    menuItemText: { fontSize: 16 },
    logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, marginTop: 16, borderWidth: 1 },
    logoutText: { fontSize: 16, color: '#ff4444', fontWeight: '600', marginLeft: 8 },
});