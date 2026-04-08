import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, Image, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { authService } from '../services/api';
import api from '../services/api';
import { ScreenBackground } from '../components/ScreenBackground';

const API_BASE_URL = 'http://192.168.100.30:8085';

export default function EditProfileScreen() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [bio, setBio] = useState('');
    const [profilePic, setProfilePic] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showPicModal, setShowPicModal] = useState(false);

    useEffect(() => { loadProfile(); }, []);

    const loadProfile = async () => {
        try {
            const user = await authService.getCurrentUser();
            if (user) setName(user.name || '');
            const res = await api.get('/students/me');
            const p = res.data;
            setBio(p.bio || '');
            setProfilePic(p.profilePictureUrl || null);
        } catch (e) {
            console.log('Load profile error', e);
        }
    };

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
                setProfilePic(result.assets[0].uri);
            }
        } catch (e) {
            console.log('Image pick error', e);
        }
    };

    const handleRemovePicture = () => {
        setShowPicModal(false);
        setProfilePic(null);
    };

    const handleSave = async () => {
        if (!name.trim()) { Alert.alert('Error', 'Username is required'); return; }
        setLoading(true);
        try {
            const user = await authService.getCurrentUser();

            // ── 1. Upload new profile picture if a local file was selected ──
            let pictureUrl: string | null = profilePic;
            const isLocalFile = profilePic && !profilePic.startsWith('http');
            if (isLocalFile) {
                const filename = profilePic!.split('/').pop() || 'profile.jpg';
                const ext = filename.split('.').pop() || 'jpg';
                const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

                const formData = new FormData();
                formData.append('file', { uri: profilePic!, name: filename, type: mimeType } as any);
                formData.append('userId', user?.userId || '');
                formData.append('userType', 'STUDENT');

                const uploadRes = await api.post('/files/upload/profile-picture', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                // fileUrl is a relative path like /api/files/download/...  — prepend the base URL
                pictureUrl = API_BASE_URL + uploadRes.data.fileUrl;
            }

            // ── 2. Save name + bio ──
            await api.put('/students/me/basic', { name: name.trim(), bio: bio.trim() });

            // ── 3. Save profile picture URL ──
            await api.put('/students/me/profile-picture', { profilePictureUrl: pictureUrl });

            // ── 4. Update SecureStore cache so home screen reflects changes immediately ──
            if (user) {
                const updatedUser = { ...user, name: name.trim(), profilePictureUrl: pictureUrl };
                await SecureStore.setItemAsync('user_data', JSON.stringify(updatedUser));
            }

            Alert.alert('Success', 'Profile updated successfully!');
            router.back();
        } catch (error) {
            console.log('Save error', error);
            Alert.alert('Error', 'Failed to update profile');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScreenBackground>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Image source={require('../assets/images/logo-white.png')} style={styles.logo} resizeMode="contain" />
                    <View style={styles.headerRow}>
                        <TouchableOpacity onPress={() => router.back()}>
                            <Ionicons name="arrow-back" size={22} color="#ffffff" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Edit Profile</Text>
                        <TouchableOpacity onPress={handleSave} style={styles.logoutBtn}>
                            <Ionicons name="log-out-outline" size={22} color="#ffffff" />
                        </TouchableOpacity>
                    </View>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {/* Avatar */}
                    <View style={styles.avatarSection}>
                        <TouchableOpacity onPress={() => setShowPicModal(true)} activeOpacity={0.85}>
                            <View style={styles.avatarBorder}>
                                {profilePic ? (
                                    <Image source={{ uri: profilePic }} style={styles.avatarImage} />
                                ) : (
                                    <View style={styles.avatarFallback}>
                                        <Text style={styles.avatarLetter}>{name.charAt(0) || 'S'}</Text>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setShowPicModal(true)}>
                            <Text style={styles.editPicText}>Edit Picture</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Username */}
                    <Text style={styles.fieldLabel}>Enter Username</Text>
                    <View style={styles.inputWrap}>
                        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                        <TextInput
                            style={styles.input}
                            value={name}
                            onChangeText={setName}
                            placeholder="Your name"
                            placeholderTextColor="#555"
                        />
                    </View>

                    {/* Bio */}
                    <Text style={styles.fieldLabel}>Enter Your Bio</Text>
                    <View style={[styles.inputWrap, styles.bioWrap]}>
                        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                        <TextInput
                            style={[styles.input, styles.bioInput]}
                            value={bio}
                            onChangeText={setBio}
                            placeholder="Tell us about yourself..."
                            placeholderTextColor="#555"
                            multiline
                            textAlignVertical="top"
                        />
                    </View>

                    {/* Edit Resume */}
                    <TouchableOpacity style={styles.editResumeBtn} onPress={() => router.push('/onboarding/student/step3' as any)} activeOpacity={0.8}>
                        <Text style={styles.editResumeBtnText}>Edit Resume</Text>
                    </TouchableOpacity>

                    {/* Save */}
                    <TouchableOpacity
                        style={[styles.saveBtn, loading && { opacity: 0.6 }]}
                        onPress={handleSave}
                        disabled={loading}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.saveBtnText}>{loading ? 'Saving...' : 'Save'}</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Profile Picture Modal */}
            <Modal visible={showPicModal} transparent animationType="slide">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPicModal(false)}>
                    <View style={styles.modalContent}>
                        {/* Handle bar */}
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Add profile picture</Text>

                        <TouchableOpacity style={styles.modalOption} onPress={() => handlePickImage('camera')}>
                            <Ionicons name="camera-outline" size={22} color="#ffffff" />
                            <Text style={styles.modalOptionText}>Take a photo</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.modalOption} onPress={() => handlePickImage('gallery')}>
                            <Ionicons name="image-outline" size={22} color="#ffffff" />
                            <Text style={styles.modalOptionText}>Upload from phone</Text>
                        </TouchableOpacity>

                        {profilePic && (
                            <TouchableOpacity style={styles.modalOption} onPress={handleRemovePicture}>
                                <Ionicons name="trash-outline" size={22} color="#ff4444" />
                                <Text style={[styles.modalOptionText, { color: '#ff4444' }]}>Remove current picture</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },

    // Header
    header: { paddingTop: 50, paddingHorizontal: 20 },
    logo: { width: 40, height: 40, marginBottom: 10 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', flex: 1 },
    logoutBtn: {},

    // Content
    content: { flex: 1 },
    contentInner: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 },

    // Avatar
    avatarSection: { alignItems: 'center', marginBottom: 28 },
    avatarBorder: {
        width: 150, height: 150, borderRadius: 75,
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    avatarImage: { width: '100%', height: '100%' },
    avatarFallback: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(124,206,6,0.15)' },
    avatarLetter: { fontSize: 52, fontWeight: 'bold', color: '#7cce06' },
    editPicText: { fontSize: 15, color: '#ffffff', fontWeight: '500', marginTop: 10 },

    // Fields
    fieldLabel: { fontSize: 14, fontWeight: '700', color: '#7cce06', marginBottom: 8, marginTop: 4 },
    inputWrap: {
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
        marginBottom: 20,
    },
    input: { color: '#ffffff', fontSize: 15, paddingHorizontal: 16, paddingVertical: 16 },
    bioWrap: {},
    bioInput: { minHeight: 110, textAlignVertical: 'top', paddingTop: 16 },

    // Edit Resume
    editResumeBtn: {
        alignSelf: 'center',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.4)',
        borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12,
        backgroundColor: 'rgba(124,206,6,0.08)',
        marginTop: 8, marginBottom: 28,
    },
    editResumeBtnText: { fontSize: 14, fontWeight: '600', color: '#aaaaaa' },

    // Save
    saveBtn: {
        backgroundColor: '#7cce06',
        borderRadius: 14, paddingVertical: 16,
        alignItems: 'center',
        shadowColor: '#7cce06', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
    },
    saveBtnText: { fontSize: 17, fontWeight: 'bold', color: '#000000' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: {
        backgroundColor: '#2b12c6',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 24, paddingTop: 14,
    },
    modalHandle: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.3)',
        alignSelf: 'center', marginBottom: 18,
    },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginBottom: 20 },
    modalOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
    modalOptionText: { fontSize: 16, color: '#ffffff' },
});
