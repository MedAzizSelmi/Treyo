import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { ScreenBackground } from '../components/ScreenBackground';

export default function NotificationSettingsScreen() {
    const { colors } = useTheme();
    const router = useRouter();
    const [pushEnabled, setPushEnabled] = useState(true);
    const [emailEnabled, setEmailEnabled] = useState(true);
    const [courseUpdates, setCourseUpdates] = useState(true);
    const [newMessages, setNewMessages] = useState(true);
    const [sessionReminders, setSessionReminders] = useState(true);
    const [promotions, setPromotions] = useState(false);

    return (
        <ScreenBackground style={styles.container}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Notification Channels</Text>

                <SettingItem
                    icon="notifications"
                    title="Push Notifications"
                    description="Receive notifications on your device"
                    value={pushEnabled}
                    onValueChange={setPushEnabled}
                    colors={colors}
                />
                <SettingItem
                    icon="mail"
                    title="Email Notifications"
                    description="Receive notifications via email"
                    value={emailEnabled}
                    onValueChange={setEmailEnabled}
                    colors={colors}
                />

                <Text style={[styles.sectionTitle, { color: colors.text }]}>Notification Types</Text>

                <SettingItem
                    icon="book"
                    title="Course Updates"
                    description="New content, announcements, and materials"
                    value={courseUpdates}
                    onValueChange={setCourseUpdates}
                    colors={colors}
                />
                <SettingItem
                    icon="chatbubbles"
                    title="New Messages"
                    description="Messages from trainers and students"
                    value={newMessages}
                    onValueChange={setNewMessages}
                    colors={colors}
                />
                <SettingItem
                    icon="calendar"
                    title="Session Reminders"
                    description="Upcoming classes and sessions"
                    value={sessionReminders}
                    onValueChange={setSessionReminders}
                    colors={colors}
                />
                <SettingItem
                    icon="pricetag"
                    title="Promotions & Offers"
                    description="Special deals and discounts"
                    value={promotions}
                    onValueChange={setPromotions}
                    colors={colors}
                />
            </ScrollView>
        </ScreenBackground>
    );
}

function SettingItem({ icon, title, description, value, onValueChange, colors }: any) {
    return (
        <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
            <View style={styles.iconContainer}>
                <Ionicons name={icon} size={22} color="#7cce06" />
            </View>
            <View style={styles.settingInfo}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>{title}</Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>{description}</Text>
            </View>
            <Switch
                value={value}
                onValueChange={onValueChange}
                trackColor={{ false: colors.border, true: '#7cce06' }}
                thumbColor="#ffffff"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1 },
    backButton: { width: 40, height: 40, justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    content: { flex: 1, padding: 20 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 8, marginBottom: 16 },
    settingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
    iconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0fde4', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    settingInfo: { flex: 1, marginRight: 12 },
    settingTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
    settingDescription: { fontSize: 13, lineHeight: 18 },
});