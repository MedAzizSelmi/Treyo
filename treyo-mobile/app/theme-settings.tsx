import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeSettingsScreen() {
    const router = useRouter();
    const { theme, setTheme, isDark, colors } = useTheme();

    const themeOptions = [
        { value: 'light', label: 'Light Mode', icon: 'sunny' },
        { value: 'dark', label: 'Dark Mode', icon: 'moon' },
        { value: 'system', label: 'System Default', icon: 'phone-portrait' },
    ];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Appearance</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.content}>
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                    Choose how Treyo looks for you
                </Text>

                {themeOptions.map((option) => (
                    <TouchableOpacity
                        key={option.value}
                        style={[
                            styles.optionCard,
                            {
                                backgroundColor: colors.card,
                                borderColor: theme === option.value ? colors.primary : colors.border,
                                borderWidth: theme === option.value ? 2 : 1,
                            }
                        ]}
                        onPress={() => setTheme(option.value as any)}
                    >
                        <View style={[
                            styles.iconContainer,
                            { backgroundColor: theme === option.value ? colors.primaryLight : colors.backgroundSecondary }
                        ]}>
                            <Ionicons
                                name={option.icon as any}
                                size={28}
                                color={theme === option.value ? colors.primary : colors.textSecondary}
                            />
                        </View>

                        <View style={styles.optionInfo}>
                            <Text style={[styles.optionLabel, { color: colors.text }]}>
                                {option.label}
                            </Text>
                            {option.value === 'system' && (
                                <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
                                    Automatically switch based on device settings
                                </Text>
                            )}
                        </View>

                        {theme === option.value && (
                            <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                        )}
                    </TouchableOpacity>
                ))}

                <View style={[styles.previewCard, { backgroundColor: colors.backgroundSecondary }]}>
                    <Text style={[styles.previewTitle, { color: colors.text }]}>
                        Preview
                    </Text>
                    <View style={[styles.previewContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={styles.previewHeader}>
                            <View style={[styles.previewAvatar, { backgroundColor: colors.primary }]} />
                            <View>
                                <Text style={[styles.previewName, { color: colors.text }]}>John Doe</Text>
                                <Text style={[styles.previewEmail, { color: colors.textSecondary }]}>john@example.com</Text>
                            </View>
                        </View>
                        <View style={[styles.previewButton, { backgroundColor: colors.primary }]}>
                            <Text style={styles.previewButtonText}>Example Button</Text>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1 },
    backButton: { width: 40, height: 40, justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    content: { flex: 1, padding: 20 },
    description: { fontSize: 14, marginBottom: 24, lineHeight: 20 },
    optionCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    iconContainer: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    optionInfo: { flex: 1 },
    optionLabel: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
    optionDescription: { fontSize: 13, lineHeight: 18 },
    previewCard: { marginTop: 24, padding: 16, borderRadius: 12 },
    previewTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
    previewContent: { padding: 16, borderRadius: 8, borderWidth: 1 },
    previewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    previewAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
    previewName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
    previewEmail: { fontSize: 13 },
    previewButton: { paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    previewButtonText: { fontSize: 14, fontWeight: 'bold', color: '#ffffff' },
});