import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { ScreenBackground } from '../../components/ScreenBackground';
import {useSafeAreaInsets} from "react-native-safe-area-context";

export default function NotificationsScreen() {
    const { colors } = useTheme();
    const [notifications, setNotifications] = useState([
        { id: 1, type: 'group', title: 'Group Session Available', description: 'React Native Bootcamp - Starting next Monday', time: '2h ago', responded: false },
        { id: 2, type: 'one-on-one', title: 'One-to-One Session Offer', description: 'John Doe is available for private sessions', time: '1d ago', responded: false },
    ]);
    const [showReasonInput, setShowReasonInput] = useState<number | null>(null);
    const [reason, setReason] = useState('');
    const insets = useSafeAreaInsets();

    const handleConfirm = (id: number) => {
        Alert.alert('Success', 'Your spot has been confirmed!');
        setNotifications(notifications.map(n => n.id === id ? { ...n, responded: true } : n));
    };

    const handleDecline = (id: number) => {
        setShowReasonInput(id);
    };

    const submitDecline = (id: number) => {
        Alert.alert('Declined', reason ? 'Your reason has been recorded' : 'Declined without reason');
        setNotifications(notifications.map(n => n.id === id ? { ...n, responded: true } : n));
        setShowReasonInput(null);
        setReason('');
    };

    return (
        <ScreenBackground style={styles.container}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
            </View>

            <ScrollView style={styles.content}>
                {notifications.map(notif => (
                    <View key={notif.id} style={[styles.notificationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={[styles.iconContainer, notif.type === 'group' ? styles.groupIcon : styles.oneOnOneIcon]}>
                            <Ionicons name={notif.type === 'group' ? 'people' : 'person'} size={24} color="#ffffff" />
                        </View>

                        <View style={styles.notifContent}>
                            <Text style={[styles.notifTitle, { color: colors.text }]}>{notif.title}</Text>
                            <Text style={[styles.notifDescription, { color: colors.textSecondary }]}>{notif.description}</Text>
                            <Text style={[styles.notifTime, { color: colors.textTertiary }]}>{notif.time}</Text>

                            {!notif.responded && (
                                <>
                                    {showReasonInput === notif.id ? (
                                        <View style={styles.reasonContainer}>
                                            <TextInput
                                                style={[styles.reasonInput, { backgroundColor: colors.backgroundSecondary, color: colors.text }]}
                                                placeholder="Optional: Tell us why (or leave blank)"
                                                placeholderTextColor={colors.textTertiary}
                                                value={reason}
                                                onChangeText={setReason}
                                                multiline
                                            />
                                            <View style={styles.reasonButtons}>
                                                <TouchableOpacity
                                                    style={[styles.button, styles.cancelButton, { backgroundColor: colors.backgroundTertiary }]}
                                                    onPress={() => setShowReasonInput(null)}
                                                >
                                                    <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.button, styles.submitButton]}
                                                    onPress={() => submitDecline(notif.id)}
                                                >
                                                    <Text style={styles.buttonText}>Submit</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ) : (
                                        <View style={styles.actions}>
                                            <TouchableOpacity
                                                style={[styles.button, styles.confirmButton]}
                                                onPress={() => handleConfirm(notif.id)}
                                            >
                                                <Text style={styles.buttonText}>Confirm</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.button, styles.declineButton, { backgroundColor: colors.background, borderColor: '#ff6b6b' }]}
                                                onPress={() => handleDecline(notif.id)}
                                            >
                                                <Text style={styles.declineButtonText}>Can't Attend</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </>
                            )}

                            {notif.responded && (
                                <Text style={styles.respondedText}>✓ Responded</Text>
                            )}
                        </View>
                    </View>
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
    notificationCard: { flexDirection: 'row', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    iconContainer: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    groupIcon: { backgroundColor: '#7cce06' },
    oneOnOneIcon: { backgroundColor: '#2b12c6' },
    notifContent: { flex: 1 },
    notifTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    notifDescription: { fontSize: 14, marginBottom: 4 },
    notifTime: { fontSize: 12, marginBottom: 12 },
    actions: { flexDirection: 'row', gap: 8 },
    button: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
    confirmButton: { backgroundColor: '#7cce06' },
    declineButton: { borderWidth: 1 },
    buttonText: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
    declineButtonText: { fontSize: 14, fontWeight: '600', color: '#ff6b6b' },
    respondedText: { fontSize: 14, color: '#7cce06', fontWeight: '600' },
    reasonContainer: { marginTop: 8 },
    reasonInput: { borderRadius: 8, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 8 },
    reasonButtons: { flexDirection: 'row', gap: 8 },
    cancelButton: {},
    submitButton: { backgroundColor: '#7cce06' },
    cancelButtonText: { fontSize: 14, fontWeight: '600' },
});