import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState } from 'react';
import api, { authService } from '../../../services/api';
import { ScreenBackground } from '../../../components/ScreenBackground';

const SPECIFIC_INTERESTS: Record<string, string[]> = {
    informatique: ['React', 'Java', 'Python', 'JavaScript', 'Node.js', 'Angular', 'Vue.js', 'TypeScript', 'PHP', 'C++', 'Mobile Development', 'Web Development'],
    electronique: ['Arduino', 'Raspberry Pi', 'IoT', 'Microcontrollers', 'Circuit Design', 'Embedded Systems', 'Robotics', 'PCB Design'],
    marketing: ['Digital Marketing', 'SEO', 'Social Media', 'Content Marketing', 'Email Marketing', 'Analytics', 'Advertising', 'Brand Management'],
    design: ['UI/UX', 'Graphic Design', 'Web Design', 'Adobe Photoshop', 'Figma', 'Illustration', '3D Design', 'Motion Graphics'],
    business: ['Entrepreneurship', 'Management', 'Leadership', 'Strategy', 'Finance', 'Sales', 'Project Management', 'HR'],
    langues: ['English', 'French', 'Spanish', 'German', 'Arabic', 'Chinese', 'Italian', 'Japanese'],
    sante: ['Nutrition', 'Fitness', 'Mental Health', 'First Aid', 'Yoga', 'Physiotherapy', 'Medical Terminology'],
    finance: ['Investing', 'Accounting', 'Trading', 'Personal Finance', 'Banking', 'Insurance', 'Cryptocurrency', 'Financial Planning'],
};

export default function StudentOnboardingStep2() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const selectedFields = (params.fields as string)?.split(',') || [];

    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const allInterests = selectedFields.flatMap(field => SPECIFIC_INTERESTS[field] || []);

    const toggleInterest = (interest: string) => {
        if (selectedInterests.includes(interest)) {
            setSelectedInterests(selectedInterests.filter(i => i !== interest));
        } else {
            setSelectedInterests([...selectedInterests, interest]);
        }
    };

    const handleNext = async () => {
        if (selectedInterests.length === 0) {
            Alert.alert('Error', 'Please select at least one specific interest');
            return;
        }

        setLoading(true);
        try {
            const user = await authService.getCurrentUser();
            if (!user || !user.userId) {
                Alert.alert('Error', 'User not found. Please login again.');
                return;
            }

            await api.put(`/students/me/interests?studentId=${user.userId}`, {
                primaryDomains: selectedFields,
                specificInterests: selectedInterests,
                experienceLevel: 'beginner',
            });

            router.push({
                pathname: '/onboarding/student/step3' as any,
                params: { fields: params.fields, interests: selectedInterests.join(',') },
            });
        } catch (error) {
            console.error('Error saving interests:', error);
            Alert.alert('Error', 'Failed to save interests. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScreenBackground>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.header}>
                    <Text style={styles.title}>What specifically?</Text>
                    <Text style={styles.subtitle}>Select your specific interests</Text>
                    <Text style={styles.step}>Step 2 of 3</Text>
                </View>

                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: '66%' }]} />
                </View>

                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={20} color="#aaaaaa" />
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>

                {/* Glass card wrapping chips and button */}
                <View style={styles.glassCard}>
                    <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />
                    <View style={styles.interestsContainer}>
                        {allInterests.map((interest) => {
                            const selected = selectedInterests.includes(interest);
                            return (
                                <TouchableOpacity
                                    key={interest}
                                    style={[styles.interestChip, selected && styles.interestChipSelected]}
                                    onPress={() => toggleInterest(interest)}
                                    activeOpacity={0.8}
                                >
                                    <BlurView intensity={selected ? 30 : 22} tint="dark" style={StyleSheet.absoluteFill} />
                                    <Text style={[styles.interestText, selected && styles.interestTextSelected]}>
                                        {interest}
                                    </Text>
                                    {selected && (
                                        <Ionicons name="checkmark-circle" size={18} color="#7cce06" />
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Continue Button inside card */}
                    <TouchableOpacity
                        style={[styles.continueButton, (selectedInterests.length === 0 || loading) && { opacity: 0.6 }]}
                        onPress={handleNext}
                        disabled={selectedInterests.length === 0 || loading}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.continueButtonText}>
                            {loading ? 'Saving...' : `Next (${selectedInterests.length} selected)`}
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scrollContent: { flexGrow: 1, paddingTop: 60, paddingBottom: 40, paddingHorizontal: 20 },

    header: { marginBottom: 24 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#aaaaaa', marginBottom: 8 },
    step: { fontSize: 14, color: '#7cce06', fontWeight: '600' },

    progressContainer: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 24 },
    progressBar: { height: 4, backgroundColor: '#7cce06', borderRadius: 2 },

    backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 8 },
    backText: { fontSize: 16, color: '#aaaaaa' },

    glassCard: {
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#7cce06',
        padding: 16,
        marginBottom: 20,
    },

    interestsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },

    interestChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.12)',
        gap: 8,
        overflow: 'hidden',
    },
    interestChipSelected: { borderColor: '#7cce06' },
    interestText: { fontSize: 15, color: '#cccccc', fontWeight: '500' },
    interestTextSelected: { color: '#7cce06', fontWeight: '600' },

    continueButton: {
        backgroundColor: '#f5f0e0',
        borderRadius: 30,
        paddingVertical: 14,
        paddingHorizontal: 50,
        alignItems: 'center',
        alignSelf: 'center',
        marginTop: 8,
    },
    continueButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1a1a1a',
    },
});