import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, Image, Modal, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { authService, fetchUpload, API_BASE_URL, enrollmentService } from '../services/api';
import api from '../services/api';
import { ScreenBackground } from '../components/ScreenBackground';

export default function EditProfileScreen() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [bio, setBio] = useState('');
    const [profilePic, setProfilePic] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showPicModal, setShowPicModal] = useState(false);

    // Professional fields
    const [skills, setSkills] = useState<string[]>([]);
    const [skillInput, setSkillInput] = useState('');
    const [educationLevel, setEducationLevel] = useState('');
    const [professionalExperience, setProfessionalExperience] = useState('');
    const [linkedinUrl, setLinkedinUrl] = useState('');
    const [portfolioUrl, setPortfolioUrl] = useState('');

    useEffect(() => { loadProfile(); }, []);

    const loadProfile = async () => {
        try {
            const user = await authService.getCurrentUser();
            if (user) setName(user.name || '');
            const res = await api.get('/students/me');
            const p = res.data;
            setBio(p.bio || '');
            setProfilePic(p.profilePictureUrl || null);
            setSkills(Array.isArray(p.keySkills) ? p.keySkills : (p.keySkills ? [p.keySkills] : []));
            setEducationLevel(p.educationLevel || '');
            setProfessionalExperience(p.professionalExperience || '');
            setLinkedinUrl(p.linkedinUrl || '');
            setPortfolioUrl(p.portfolioUrl || '');
        } catch (e) {
            console.log('Load profile error', e);
        }
    };

    const addSkill = () => {
        const trimmed = skillInput.trim();
        if (trimmed && !skills.includes(trimmed)) {
            setSkills(prev => [...prev, trimmed]);
        }
        setSkillInput('');
    };

    const removeSkill = (skill: string) => {
        setSkills(prev => prev.filter(s => s !== skill));
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

            // 1. Upload new profile picture if a local file was selected
            let pictureUrl: string | null = profilePic;
            const isLocalFile = profilePic && !profilePic.startsWith('http') && !profilePic.startsWith('https');
            if (isLocalFile) {
                const filename = profilePic!.split('/').pop() || 'profile.jpg';
                const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
                const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                const formData = new FormData();
                formData.append('file', { uri: profilePic!, name: filename, type: mimeType } as any);
                formData.append('userId', String(user?.userId || ''));
                formData.append('userType', 'STUDENT');
                const uploadData = await fetchUpload('/files/upload/profile-picture', formData);
                pictureUrl = API_BASE_URL + uploadData.fileUrl;
            }

            // 2. Save name + bio
            await api.put('/students/me/basic', { name: name.trim(), bio: bio.trim() });

            // 3. Save profile picture URL
            await api.put('/students/me/profile-picture', { profilePictureUrl: pictureUrl });

            // 4. Save professional profile fields
            await enrollmentService.updateStudentProfile({
                keySkills: skills,
                educationLevel: educationLevel.trim() || undefined,
                professionalExperience: professionalExperience.trim() || undefined,
                linkedinUrl: linkedinUrl.trim() || null,
                portfolioUrl: portfolioUrl.trim() || null,
            });

            // 5. Update SecureStore cache
            if (user) {
                const updatedUser = { ...user, name: name.trim(), profilePictureUrl: pictureUrl };
                await SecureStore.setItemAsync('user_data', JSON.stringify(updatedUser));
            }

            Alert.alert('Success', 'Profile updated successfully!', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (error: any) {
            console.log('Save error', error?.response?.data || error?.message || error);
            Alert.alert('Error', `Failed to update profile: ${error?.message || 'Unknown error'}`);
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
                        <View style={{ width: 22 }} />
                    </View>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {/* Avatar */}
                    <View style={styles.avatarSection}>
                        <TouchableOpacity onPress={() => setShowPicModal(true)} activeOpacity={0.85}>
                            <View style={styles.avatarBorder}>
                                {profilePic ? (
                                    <Image
                                        source={{ uri: profilePic!.startsWith('http') ? `${profilePic}?t=${Date.now()}` : profilePic! }}
                                        style={styles.avatarImage}
                                    />
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

                    {/* Section: Basic Info */}
                    <Text style={styles.sectionTitle}>Basic Info</Text>

                    <Text style={styles.fieldLabel}>Username</Text>
                    <View style={styles.inputWrap}>
                        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor="#555" />
                    </View>

                    <Text style={styles.fieldLabel}>Bio</Text>
                    <View style={[styles.inputWrap, styles.bioWrap]}>
                        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                        <TextInput style={[styles.input, styles.bioInput]} value={bio} onChangeText={setBio} placeholder="Tell us about yourself..." placeholderTextColor="#555" multiline textAlignVertical="top" />
                    </View>

                    {/* Section: Professional Profile */}
                    <Text style={styles.sectionTitle}>Professional Profile</Text>

                    <Text style={styles.fieldLabel}>Education Level</Text>
                    <View style={styles.inputWrap}>
                        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                        <TextInput style={styles.input} value={educationLevel} onChangeText={setEducationLevel} placeholder="e.g. Bachelor's, Master's..." placeholderTextColor="#555" />
                    </View>

                    <Text style={styles.fieldLabel}>Professional Experience</Text>
                    <View style={[styles.inputWrap, styles.bioWrap]}>
                        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                        <TextInput style={[styles.input, styles.bioInput]} value={professionalExperience} onChangeText={setProfessionalExperience} placeholder="Describe your work experience..." placeholderTextColor="#555" multiline textAlignVertical="top" />
                    </View>

                    <Text style={styles.fieldLabel}>Key Skills</Text>
                    <View style={styles.tagInputRow}>
                        <View style={[styles.inputWrap, { flex: 1, marginBottom: 0 }]}>
                            <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                            <TextInput
                                style={styles.input}
                                value={skillInput}
                                onChangeText={setSkillInput}
                                placeholder="Add a skill..."
                                placeholderTextColor="#555"
                                onSubmitEditing={addSkill}
                                returnKeyType="done"
                            />
                        </View>
                        <TouchableOpacity style={styles.addTagBtn} onPress={addSkill} activeOpacity={0.8}>
                            <Ionicons name="add" size={20} color="#000" />
                        </TouchableOpacity>
                    </View>
                    {skills.length > 0 && (
                        <View style={styles.tagsWrap}>
                            {skills.map(skill => (
                                <View key={skill} style={styles.tag}>
                                    <Text style={styles.tagText}>{skill}</Text>
                                    <TouchableOpacity onPress={() => removeSkill(skill)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                        <Ionicons name="close" size={13} color="#7cce06" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Section: Links */}
                    <Text style={styles.sectionTitle}>Links <Text style={styles.optionalPill}>Optional</Text></Text>

                    <Text style={styles.fieldLabel}>LinkedIn URL</Text>
                    <View style={styles.inputWrap}>
                        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.inputWithIcon}>
                            <Ionicons name="logo-linkedin" size={16} color="#0A66C2" style={{ marginLeft: 14 }} />
                            <TextInput style={[styles.input, { flex: 1 }]} value={linkedinUrl} onChangeText={setLinkedinUrl} placeholder="https://linkedin.com/in/..." placeholderTextColor="#555" autoCapitalize="none" keyboardType="url" />
                        </View>
                    </View>

                    <Text style={styles.fieldLabel}>Portfolio URL</Text>
                    <View style={styles.inputWrap}>
                        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.inputWithIcon}>
                            <Ionicons name="globe-outline" size={16} color="#7cce06" style={{ marginLeft: 14 }} />
                            <TextInput style={[styles.input, { flex: 1 }]} value={portfolioUrl} onChangeText={setPortfolioUrl} placeholder="https://yourportfolio.com" placeholderTextColor="#555" autoCapitalize="none" keyboardType="url" />
                        </View>
                    </View>

                    {/* Save */}
                    <TouchableOpacity
                        style={[styles.saveBtn, loading && { opacity: 0.6 }]}
                        onPress={handleSave}
                        disabled={loading}
                        activeOpacity={0.85}
                    >
                        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Profile Picture Modal */}
            <Modal visible={showPicModal} transparent animationType="slide">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPicModal(false)}>
                    <View style={styles.modalContent}>
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
    header: { paddingTop: 50, paddingHorizontal: 20 },
    logo: { width: 40, height: 40, marginBottom: 10 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', flex: 1 },
    content: { flex: 1 },
    contentInner: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 },

    avatarSection: { alignItems: 'center', marginBottom: 28 },
    avatarBorder: { width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
    avatarImage: { width: '100%', height: '100%' },
    avatarFallback: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(124,206,6,0.15)' },
    avatarLetter: { fontSize: 52, fontWeight: 'bold', color: '#7cce06' },
    editPicText: { fontSize: 15, color: '#ffffff', fontWeight: '500', marginTop: 10 },

    sectionTitle: {
        fontSize: 16, fontWeight: '800', color: '#ffffff',
        marginBottom: 14, marginTop: 8,
        paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
        flexDirection: 'row', alignItems: 'center',
    },
    optionalPill: {
        fontSize: 11, fontWeight: '600', color: '#aaaaaa',
    },

    fieldLabel: { fontSize: 13, fontWeight: '700', color: '#7cce06', marginBottom: 8, marginTop: 4 },
    inputWrap: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginBottom: 16 },
    input: { color: '#ffffff', fontSize: 15, paddingHorizontal: 16, paddingVertical: 14 },
    bioWrap: {},
    bioInput: { minHeight: 100, textAlignVertical: 'top', paddingTop: 14 },
    inputWithIcon: { flexDirection: 'row', alignItems: 'center' },

    tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    addTagBtn: {
        width: 46, height: 46, borderRadius: 14,
        backgroundColor: '#7cce06',
        justifyContent: 'center', alignItems: 'center',
        flexShrink: 0,
    },
    tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    tag: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(124,206,6,0.12)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)',
        borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    },
    tagText: { fontSize: 13, color: '#7cce06', fontWeight: '600' },

    saveBtn: {
        backgroundColor: '#7cce06', borderRadius: 14, paddingVertical: 16,
        alignItems: 'center', marginTop: 8,
        shadowColor: '#7cce06', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
    },
    saveBtnText: { fontSize: 17, fontWeight: 'bold', color: '#000000' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#2b12c6', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 14 },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', alignSelf: 'center', marginBottom: 18 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginBottom: 20 },
    modalOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
    modalOptionText: { fontSize: 16, color: '#ffffff' },
});
