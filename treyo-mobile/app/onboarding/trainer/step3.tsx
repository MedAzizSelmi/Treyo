import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, Modal, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { authService, fetchUpload, API_BASE_URL } from '../../../services/api';
import api from '../../../services/api';
import { ScreenBackground } from '../../../components/ScreenBackground';

export default function TrainerOnboardingStep3() {
    const router = useRouter();
    const [bio, setBio] = useState('');
    const [loading, setLoading] = useState(false);
    const [localPicUri, setLocalPicUri] = useState<string | null>(null);
    const [showPicModal, setShowPicModal] = useState(false);
    const [uploading, setUploading] = useState(false);

    const handlePickImage = async (source: 'camera' | 'gallery') => {
        setShowPicModal(false);
        try {
            let result;
            if (source === 'camera') {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) { Alert.alert('Permission needed', 'Camera permission is required.'); return; }
                result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
            } else {
                const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!perm.granted) { Alert.alert('Permission needed', 'Gallery permission is required.'); return; }
                result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
            }
            if (!result.canceled && result.assets?.[0]) {
                setLocalPicUri(result.assets[0].uri);
            }
        } catch (e) {
            console.log('Image pick error', e);
        }
    };

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

            // Upload profile picture if the trainer picked one
            let profilePictureUrl: string | null = null;
            if (localPicUri) {
                setUploading(true);
                try {
                    const filename = localPicUri.split('/').pop() || 'profile.jpg';
                    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
                    const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

                    const formData = new FormData();
                    formData.append('file', { uri: localPicUri, name: filename, type: mimeType } as any);
                    formData.append('userId', String(user.userId));
                    formData.append('userType', 'TRAINER');

                    const uploadData = await fetchUpload('/files/upload/profile-picture', formData);
                    profilePictureUrl = API_BASE_URL + uploadData.fileUrl;
                } catch (uploadErr) {
                    console.log('Picture upload failed', uploadErr);
                    Alert.alert('Upload failed', 'Could not upload your profile picture. You can add one later from your profile.');
                    // Continue without the picture rather than blocking onboarding
                } finally {
                    setUploading(false);
                }
            }

            await api.put(`/trainers/me/profile/page3?trainerId=${user.userId}`, {
                profilePictureUrl,
                bio,
            });

            // Onboarding done — but a trainer isn't approved until an
            // admin reviews their submission. Bounce them to the
            // pending screen instead of straight into the tabs, and
            // log them out on the way so the JWT can't be used to
            // bypass the approval gate at login.
            await authService.logout();
            router.replace('/trainer-pending' as any);
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
                    <Text style={styles.step}>Step 3 of 3 — Final Step! 🎉</Text>
                </View>

                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: '100%' }]} />
                </View>

                {/* Profile picture picker */}
                <TouchableOpacity
                    style={styles.imageContainer}
                    onPress={() => setShowPicModal(true)}
                    activeOpacity={0.85}
                >
                    {localPicUri ? (
                        <View style={styles.previewWrap}>
                            <Image source={{ uri: localPicUri }} style={styles.preview} />
                            <View style={styles.editOverlay}>
                                <Ionicons name="camera" size={20} color="#ffffff" />
                            </View>
                        </View>
                    ) : (
                        <View style={styles.placeholder}>
                            <BlurView intensity={25} tint="light" style={StyleSheet.absoluteFill} />
                            <Ionicons name="camera" size={40} color="#666" />
                            <Text style={styles.placeholderText}>Add Profile Picture</Text>
                            <Text style={styles.placeholderSubtext}>(Optional)</Text>
                        </View>
                    )}
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
                        style={[styles.continueButton, (loading || uploading) && { opacity: 0.6 }]}
                        onPress={handleNext}
                        disabled={loading || uploading}
                        activeOpacity={0.85}
                    >
                        {(loading || uploading) ? (
                            <ActivityIndicator size="small" color="#1a1a1a" />
                        ) : (
                            <Text style={styles.continueButtonText}>Continue</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* Picker source modal */}
            <Modal visible={showPicModal} transparent animationType="fade" onRequestClose={() => setShowPicModal(false)}>
                <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowPicModal(false)} />
                <View style={styles.modalSheet}>
                    <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>Add profile picture</Text>

                    <TouchableOpacity style={styles.modalOption} onPress={() => handlePickImage('camera')} activeOpacity={0.7}>
                        <View style={styles.modalIconWrap}>
                            <Ionicons name="camera" size={20} color="#7cce06" />
                        </View>
                        <Text style={styles.modalOptionText}>Take a photo</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.modalOption} onPress={() => handlePickImage('gallery')} activeOpacity={0.7}>
                        <View style={styles.modalIconWrap}>
                            <Ionicons name="images" size={20} color="#7cce06" />
                        </View>
                        <Text style={styles.modalOptionText}>Choose from gallery</Text>
                    </TouchableOpacity>

                    {localPicUri && (
                        <TouchableOpacity
                            style={styles.modalOption}
                            onPress={() => { setLocalPicUri(null); setShowPicModal(false); }}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.modalIconWrap, { backgroundColor: 'rgba(255,84,84,0.12)' }]}>
                                <Ionicons name="trash-outline" size={20} color="#ff5454" />
                            </View>
                            <Text style={[styles.modalOptionText, { color: '#ff7070' }]}>Remove picture</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.modalCancel} onPress={() => setShowPicModal(false)} activeOpacity={0.7}>
                        <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
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

    previewWrap: { width: 140, height: 140, borderRadius: 70, position: 'relative' },
    preview: {
        width: 140, height: 140, borderRadius: 70,
        borderWidth: 2, borderColor: '#7cce06',
    },
    editOverlay: {
        position: 'absolute', bottom: 4, right: 4,
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: '#7cce06',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: '#0a0520',
    },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    modalSheet: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: 'rgba(10,5,32,0.96)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 30,
        borderTopWidth: 1, borderColor: 'rgba(124,206,6,0.2)',
        overflow: 'hidden',
    },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 14, paddingHorizontal: 4 },
    modalOption: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingVertical: 12, paddingHorizontal: 8,
        borderRadius: 12,
    },
    modalIconWrap: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center',
    },
    modalOptionText: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
    modalCancel: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    modalCancelText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },

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