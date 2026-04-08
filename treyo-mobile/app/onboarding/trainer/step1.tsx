import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState } from 'react';
import { authService } from '../../../services/api';
import api from '../../../services/api';
import { ScreenBackground } from '../../../components/ScreenBackground';

export default function TrainerOnboardingStep1() {
    const router = useRouter();
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [town, setTown] = useState('');
    const [state, setState] = useState('');
    const [postCode, setPostCode] = useState('');
    const [loading, setLoading] = useState(false);

    const handleNext = async () => {
        if (!phone || !address || !town || !state || !postCode) {
            Alert.alert('Error', 'Please fill in all required fields');
            return;
        }

        setLoading(true);
        try {
            const user = await authService.getCurrentUser();
            if (!user || !user.userId) {
                Alert.alert('Error', 'User not found. Please login again.');
                router.replace('/login' as any);
                return;
            }

            await api.put(`/trainers/me/profile/page1?trainerId=${user.userId}`, {
                phone,
                address,
                city: town,
                state,
                postalCode: postCode,
            });

            router.push({
                pathname: '/onboarding/trainer/step2' as any,
                params: { phone, address, town, state, postCode },
            });
        } catch (error) {
            console.error('Error saving contact info:', error);
            Alert.alert('Error', 'Failed to save. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScreenBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.header}>
                        <Text style={styles.title}>Contact Information</Text>
                        <Text style={styles.subtitle}>Help students reach you</Text>
                        <Text style={styles.step}>Step 1 of 4</Text>
                    </View>

                    <View style={styles.progressContainer}>
                        <View style={[styles.progressBar, { width: '25%' }]} />
                    </View>

                    {/* Glass form card with button inside */}
                    <View style={styles.glassCard}>
                        <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Phone Number *</Text>
                            <View style={styles.inputContainer}>
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <Ionicons name="call-outline" size={20} color="#666" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="+216 12 345 678"
                                    placeholderTextColor="#555"
                                    value={phone}
                                    onChangeText={setPhone}
                                    keyboardType="phone-pad"
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Home Address *</Text>
                            <View style={styles.inputContainer}>
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <Ionicons name="home-outline" size={20} color="#666" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Street address"
                                    placeholderTextColor="#555"
                                    value={address}
                                    onChangeText={setAddress}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Town *</Text>
                            <View style={styles.inputContainer}>
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <Ionicons name="location-outline" size={20} color="#666" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Town/City"
                                    placeholderTextColor="#555"
                                    value={town}
                                    onChangeText={setTown}
                                />
                            </View>
                        </View>

                        <View style={styles.row}>
                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={styles.label}>State *</Text>
                                <View style={styles.inputContainer}>
                                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="State"
                                        placeholderTextColor="#555"
                                        value={state}
                                        onChangeText={setState}
                                    />
                                </View>
                            </View>

                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={styles.label}>Post Code *</Text>
                                <View style={styles.inputContainer}>
                                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="1234"
                                        placeholderTextColor="#555"
                                        value={postCode}
                                        onChangeText={setPostCode}
                                        keyboardType="number-pad"
                                    />
                                </View>
                            </View>
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
            </KeyboardAvoidingView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingTop: 60, paddingBottom: 40, paddingHorizontal: 24 },

    header: { marginBottom: 24 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#aaaaaa', marginBottom: 8 },
    step: { fontSize: 14, color: '#7cce06', fontWeight: '600' },

    progressContainer: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 32 },
    progressBar: { height: 4, backgroundColor: '#7cce06', borderRadius: 2 },

    glassCard: {
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(124, 206, 6, 0.6)',
        padding: 20,
        marginBottom: 40,
    },

    inputGroup: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 8 },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        overflow: 'hidden',
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: '#ffffff', paddingVertical: 16 },
    row: { flexDirection: 'row', gap: 12 },

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