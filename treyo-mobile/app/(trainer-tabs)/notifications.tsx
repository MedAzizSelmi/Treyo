import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { ScreenBackground } from '../../components/ScreenBackground';
import {useSafeAreaInsets} from "react-native-safe-area-context";

export default function TrainerNotificationsScreen() {
    const { colors } = useTheme();
    const notifications = [
        { id: 1, type: 'request', title: 'New Student Request', description: 'John Doe wants to join React Native Bootcamp', time: '2h ago' },
        { id: 2, type: 'session', title: 'Session Confirmed', description: 'Jane Smith confirmed for tomorrow\'s session', time: '5h ago' },
        { id: 3, type: 'message', title: 'New Message', description: 'Alex Brown sent you a message', time: '1d ago' },
    ];
    const insets = useSafeAreaInsets();

    const getIconName = (type: string) => {
        switch (type) {
            case 'request': return 'person-add';
            case 'session': return 'calendar';
            case 'message': return 'mail';
            default: return 'notifications';
        }
    };

    const getIconColor = (type: string) => {
        switch (type) {
            case 'request': return '#7cce06';
            case 'session': return '#2b12c6';
            case 'message': return '#FFA500';
            default: return '#999';
        }
    };

    return (
        <ScreenBackground style={styles.container}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
            </View>
            <ScrollView style={styles.content}>
                {notifications.map(notif => (
                    <TouchableOpacity key={notif.id} style={[styles.notificationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={[styles.iconContainer, { backgroundColor: getIconColor(notif.type) }]}>
                            <Ionicons name={getIconName(notif.type) as any} size={24} color="#ffffff" />
                        </View>
                        <View style={styles.notifContent}>
                            <Text style={[styles.notifTitle, { color: colors.text }]}>{notif.title}</Text>
                            <Text style={[styles.notifDescription, { color: colors.textSecondary }]}>{notif.description}</Text>
                            <Text style={[styles.notifTime, { color: colors.textTertiary }]}>{notif.time}</Text>
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
    content: { flex: 1, padding: 20 },
    notificationCard: { flexDirection: 'row', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    iconContainer: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    notifContent: { flex: 1 },
    notifTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    notifDescription: { fontSize: 14, marginBottom: 4 },
    notifTime: { fontSize: 12 },
});