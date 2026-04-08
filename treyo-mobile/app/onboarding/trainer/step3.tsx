import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState } from 'react';
import { authService } from '../../../services/api';
import api from '../../../services/api';
import { ScreenBackground } from '../../../components/ScreenBackground';

export default function TrainerOnboardingStep3() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const [bio, setBio] = useState('');
    const [loading, setLoading] = useState(false);

    const handleNext = async () => {
        if (!bio || bio.length < 50) {
            Alert.alert('Error', 'Please write a bio (minimum 50 characters)');
            return;
        }

        setLoading(true);
        try {
            const user = await authService.getCurrentUser();
            if (!user || !user.userId) {
                Alert.alert('Error', 'User not found.');
                router.replace('/login' as any);
                return;
            }

            await api.put(`/trainers/me/profile/page3?trainerId=${user.userId}`, {
                profilePictureUrl: null,
                bio,
            });

            router.push({
                pathname: '/onboarding/trainer/step4' as any,
                params: { ...params, bio },
            });
        } catch (error) {
            console.error('Error:', error);
            Alert.alert('Error', 'Failed to save.');
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
                    <Text style={styles.title}>Your Profile</Text>
                    <Text style={styles.subtitle}>Tell students about yourself</Text>
                    <Text style={styles.step}>Step 3 of 4</Text>
                </View>

                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: '75%' }]} />
                </View>

                {/* Profile picture placeholder */}
                <TouchableOpacity
                    style={styles.imageContainer}
                    onPress={() => Alert.alert('Image Picker', 'Coming soon')}
                >
                    <View style={styles.placeholder}>
                        <BlurView intensity={25} tint="light" style={StyleSheet.absoluteFill} />
                        <Ionicons name="camera" size={40} color="#666" />
                        <Text style={styles.placeholderText}>Add Profile Picture</Text>
                        <Text style={styles.placeholderSubtext}>(Optional)</Text>
                    </View>
                </TouchableOpacity>

                {/* Glass card wrapping bio input and button */}
                <View style={styles.glassCard}>
                    <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Bio *</Text>
                        <View style={styles.inputContainer}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder="Tell students about your experience, teaching style, and what makes you a great trainer... (min 50 characters)"
                                placeholderTextColor="#555"
                                value={bio}
                                onChangeText={setBio}
                                multiline
                                numberOfLines={8}
                            />
                        </View>
                        <Text style={styles.hint}>{bio.length}/500 characters</Text>
                    </View>

                    {/* Continue Button inside card */}
                    <TouchableOpacity
                        style={[styles.continueButton, loading && { opacity: 0.6 }]}
                        onPress={handleNext}
                        disabled={loading}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.continueButtonText}>
                            {loading ? 'Saving...' : 'Continue'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scrollContent: { flexGrow: 1, paddingTop: 60, paddingBottom: 40, paddingHorizontal: 24 },

    header: { marginBottom: 24 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#aaaaaa', marginBottom: 8 },
    step: { fontSize: 14, color: '#7cce06', fontWeight: '600' },

    progressContainer: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 32 },
    progressBar: { height: 4, backgroundColor: '#7cce06', borderRadius: 2 },

    imageContainer: { alignSelf: 'center', marginBottom: 32 },
    placeholder: {
        width: 140,
        height: 140,
        borderRadius: 70,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#7cce06',
    },
    placeholderText: { fontSize: 14, color: '#aaaaaa', marginTop: 8, fontWeight: '500' },
    placeholderSubtext: { fontSize: 12, color: '#666', marginTop: 4 },

    glassCard: {
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#7cce06',
        padding: 20,
        marginBottom: 40,
    },

    inputGroup: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 8 },
    inputContainer: {
        borderRadius: 12,
        overflow: 'hidden',
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    input: { fontSize: 16, color: '#ffffff', paddingVertical: 16 },
    textArea: { minHeight: 180, textAlignVertical: 'top', paddingTop: 16 },
    hint: { fontSize: 12, color: '#666', marginTop: 8, textAlign: 'right' },

    continueButton: {
        backgroundColor: '#f5f0e0',
        borderRadius: 30,
        paddingVertical: 14,
        paddingHorizontal: 50,
        alignItems: 'center',
        alignSelf: 'center',
        marginTop: 16,
    },
    continueButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1a1a1a',
    },
});