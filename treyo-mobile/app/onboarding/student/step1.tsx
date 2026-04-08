import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState } from 'react';
import { ScreenBackground } from '../../../components/ScreenBackground';

const FIELDS = [
    { id: 'informatique', name: 'Informatique', icon: '💻' },
    { id: 'electronique', name: 'Électronique', icon: '⚡' },
    { id: 'marketing', name: 'Marketing', icon: '📈' },
    { id: 'design', name: 'Design', icon: '🎨' },
    { id: 'business', name: 'Business', icon: '💼' },
    { id: 'langues', name: 'Langues', icon: '🌍' },
    { id: 'sante', name: 'Santé', icon: '🏥' },
    { id: 'finance', name: 'Finance', icon: '💰' },
];

export default function StudentOnboardingStep1() {
    const router = useRouter();
    const [selectedFields, setSelectedFields] = useState<string[]>([]);

    const toggleField = (fieldId: string) => {
        setSelectedFields(prev =>
            prev.includes(fieldId) ? prev.filter(id => id !== fieldId) : [...prev, fieldId]
        );
    };

    const handleNext = () => {
        if (selectedFields.length === 0) {
            alert('Please select at least one field');
            return;
        }
        router.push({ pathname: '/onboarding/student/step2' as any, params: { fields: selectedFields.join(',') } });
    };

    return (
        <ScreenBackground>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.header}>
                    <Text style={styles.title}>What interests you?</Text>
                    <Text style={styles.subtitle}>Select fields you want to learn</Text>
                    <Text style={styles.step}>Step 1 of 3</Text>
                </View>

                <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: '33%' }]} />
                </View>

                {/* Glass container with fields and button */}
                <View style={styles.glassCard}>
                    <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />
                    <View style={styles.fieldsGrid}>
                        {FIELDS.map((field) => {
                            const selected = selectedFields.includes(field.id);
                            return (
                                <TouchableOpacity
                                    key={field.id}
                                    style={[styles.fieldCard, selected && styles.fieldCardSelected]}
                                    onPress={() => toggleField(field.id)}
                                    activeOpacity={0.8}
                                >
                                    <BlurView
                                        intensity={selected ? 35 : 25}
                                        tint="dark"
                                        style={StyleSheet.absoluteFill}
                                    />
                                    <Text style={styles.fieldIcon}>{field.icon}</Text>
                                    <Text style={[styles.fieldName, selected && styles.fieldNameSelected]}>
                                        {field.name}
                                    </Text>
                                    {selected && (
                                        <View style={styles.checkmark}>
                                            <Ionicons name="checkmark" size={14} color="#ffffff" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Continue Button inside card */}
                    <TouchableOpacity
                        style={[styles.continueButton, selectedFields.length === 0 && { opacity: 0.4 }]}
                        onPress={handleNext}
                        disabled={selectedFields.length === 0}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.continueButtonText}>
                            Next ({selectedFields.length} selected)
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scrollContent: { flexGrow: 1, paddingTop: 60, paddingBottom: 40, paddingHorizontal: 20 },

    header: { marginBottom: 20 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#aaaaaa', marginBottom: 8 },
    step: { fontSize: 13, color: '#7cce06', fontWeight: '600' },

    progressTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 24 },
    progressFill: { height: 4, backgroundColor: '#7cce06', borderRadius: 2 },

    glassCard: {
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#7cce06',
        padding: 16,
        marginBottom: 20,
    },

    fieldsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },

    fieldCard: {
        width: '47%',
        aspectRatio: 1,
        borderRadius: 16,
        overflow: 'hidden',
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.1)',
        position: 'relative',
    },
    fieldCardSelected: { borderColor: '#7cce06' },
    fieldIcon: { fontSize: 38, marginBottom: 10 },
    fieldName: { fontSize: 14, fontWeight: '600', color: '#cccccc', textAlign: 'center' },
    fieldNameSelected: { color: '#7cce06' },
    checkmark: {
        position: 'absolute', top: 8, right: 8,
        width: 22, height: 22, backgroundColor: '#7cce06',
        borderRadius: 11, justifyContent: 'center', alignItems: 'center',
    },

    continueButton: {
        backgroundColor: '#f5f0e0',
        borderRadius: 30,
        paddingVertical: 14,
        paddingHorizontal: 50,
        alignItems: 'center',
        alignSelf: 'center',
    },
    continueButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1a1a1a',
    },
});