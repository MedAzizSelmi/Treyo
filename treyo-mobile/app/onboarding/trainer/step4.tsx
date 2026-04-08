import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState } from 'react';
import { authService } from '../../../services/api';
import api from '../../../services/api';
import { ScreenBackground } from '../../../components/ScreenBackground';

type CourseForm = {
    id: string;
    title: string;
    description: string;
    durationHours: string;
    maxStudents: string;
};

export default function TrainerOnboardingStep4() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const [loading, setLoading] = useState(false);

    const [courses, setCourses] = useState<CourseForm[]>([
        { id: '1', title: '', description: '', durationHours: '10', maxStudents: '30' },
    ]);

    const addCourse = () => {
        setCourses(prev => [
            ...prev,
            { id: Date.now().toString(), title: '', description: '', durationHours: '10', maxStudents: '30' },
        ]);
    };

    const removeCourse = (id: string) => {
        if (courses.length > 1) {
            setCourses(prev => prev.filter(c => c.id !== id));
        }
    };

    const updateCourse = (id: string, field: keyof Omit<CourseForm, 'id'>, value: string) => {
        setCourses(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    const handleComplete = async () => {
        for (const course of courses) {
            if (!course.title || !course.description || !course.durationHours) {
                Alert.alert('Error', 'Please fill in all required fields for every course');
                return;
            }
            const duration = parseInt(course.durationHours);
            const maxStudentsNum = parseInt(course.maxStudents);
            if (isNaN(duration) || duration < 1) {
                Alert.alert('Error', `Duration must be at least 1 hour (course: ${course.title || 'untitled'})`);
                return;
            }
            if (isNaN(maxStudentsNum) || maxStudentsNum < 1) {
                Alert.alert('Error', `Max students must be at least 1 (course: ${course.title || 'untitled'})`);
                return;
            }
        }

        setLoading(true);
        try {
            const user = await authService.getCurrentUser();
            if (!user || !user.userId) {
                Alert.alert('Error', 'User not found. Please login again.');
                router.replace('/login' as any);
                return;
            }

            const specialization = params.specialization || 'informatique';

            await Promise.all(
                courses.map(course =>
                    api.post(`/courses?trainerId=${user.userId}`, {
                        title: course.title,
                        description: course.description,
                        domain: specialization,
                        specificTopic: specialization,
                        level: 'beginner',
                        durationHours: parseInt(course.durationHours),
                        language: 'French',
                        format: 'Hybrid',
                        prerequisites: 'None',
                        learningOutcomes: [],
                        price: 0,
                        minStudentsRequired: 5,
                        maxStudentsPerGroup: parseInt(course.maxStudents),
                        hasCertificate: false,
                    })
                )
            );

            router.replace({
                pathname: '/success' as any,
                params: {
                    message: 'Upload done successfully',
                    nextRoute: '/(trainer-tabs)/home',
                },
            });
        } catch (error: any) {
            console.error('Error creating courses:', error);
            Alert.alert('Error', error.response?.data?.message || 'Failed to create courses');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScreenBackground>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <Text style={styles.title}>Create Your Courses</Text>
                    <Text style={styles.subtitle}>What will you teach?</Text>
                    <Text style={styles.step}>Step 4 of 4 - Final Step! 🎉</Text>
                </View>

                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: '100%' }]} />
                </View>

                {courses.map((course, index) => (
                    <View key={course.id} style={styles.courseCard}>
                        <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />

                        {/* Course card header */}
                        <View style={styles.courseCardHeader}>
                            <Text style={styles.courseCardTitle}>Course {index + 1}</Text>
                            {courses.length > 1 && (
                                <TouchableOpacity
                                    onPress={() => removeCourse(course.id)}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    <Ionicons name="close-circle" size={22} color="#ff6b6b" />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Title */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Course Title *</Text>
                            <View style={styles.inputContainer}>
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g., React Native Bootcamp"
                                    placeholderTextColor="#555"
                                    value={course.title}
                                    onChangeText={(v) => updateCourse(course.id, 'title', v)}
                                />
                            </View>
                        </View>

                        {/* Description */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Description *</Text>
                            <View style={styles.inputContainer}>
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <TextInput
                                    style={[styles.input, styles.textArea]}
                                    placeholder="Describe what students will learn, course objectives, prerequisites..."
                                    placeholderTextColor="#555"
                                    value={course.description}
                                    onChangeText={(v) => updateCourse(course.id, 'description', v)}
                                    multiline
                                    numberOfLines={4}
                                />
                            </View>
                        </View>

                        {/* Duration + Max Students */}
                        <View style={styles.row}>
                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={styles.label}>Duration (hrs) *</Text>
                                <View style={styles.inputContainer}>
                                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                    <Ionicons name="time-outline" size={18} color="#666" style={{ marginRight: 6 }} />
                                    <TextInput
                                        style={[styles.input, { flex: 1 }]}
                                        placeholder="10"
                                        placeholderTextColor="#555"
                                        value={course.durationHours}
                                        onChangeText={(v) => updateCourse(course.id, 'durationHours', v)}
                                        keyboardType="number-pad"
                                    />
                                </View>
                            </View>

                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={styles.label}>Max Students *</Text>
                                <View style={styles.inputContainer}>
                                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                    <Ionicons name="people-outline" size={18} color="#666" style={{ marginRight: 6 }} />
                                    <TextInput
                                        style={[styles.input, { flex: 1 }]}
                                        placeholder="30"
                                        placeholderTextColor="#555"
                                        value={course.maxStudents}
                                        onChangeText={(v) => updateCourse(course.id, 'maxStudents', v)}
                                        keyboardType="number-pad"
                                    />
                                </View>
                            </View>
                        </View>
                    </View>
                ))}

                {/* Add Course Button */}
                <TouchableOpacity style={styles.addButton} onPress={addCourse} activeOpacity={0.8}>
                    <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="add-circle-outline" size={22} color="#7cce06" />
                    <Text style={styles.addButtonText}>Add Another Course</Text>
                </TouchableOpacity>

                {/* Info Box */}
                <View style={styles.infoBox}>
                    <Ionicons name="information-circle" size={20} color="#7cce06" />
                    <Text style={styles.infoText}>
                        You can add more details like pricing, prerequisites, and learning outcomes later from your dashboard.
                    </Text>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                <TouchableOpacity
                    style={[styles.completeButton, loading && styles.completeButtonDisabled]}
                    onPress={handleComplete}
                    disabled={loading}
                >
                    <LinearGradient colors={['#7cce06', '#6bb805']} style={styles.buttonGradient}>
                        <Text style={styles.completeButtonText}>
                            {loading ? 'Creating...' : `Complete & Create ${courses.length > 1 ? `${courses.length} Courses` : 'Course'}`}
                        </Text>
                        <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scrollContent: { flexGrow: 1, paddingTop: 60, paddingBottom: 100, paddingHorizontal: 24 },

    header: { marginBottom: 24 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#aaaaaa', marginBottom: 8 },
    step: { fontSize: 14, color: '#7cce06', fontWeight: '600' },

    progressContainer: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 32 },
    progressBar: { height: 4, backgroundColor: '#7cce06', borderRadius: 2 },

    courseCard: {
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#7cce06',
        padding: 20,
        marginBottom: 16,
    },
    courseCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    courseCardTitle: { fontSize: 16, fontWeight: '700', color: '#7cce06' },

    inputGroup: { marginBottom: 16 },
    label: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 8 },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        overflow: 'hidden',
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    input: { fontSize: 15, color: '#ffffff', paddingVertical: 14 },
    textArea: { minHeight: 90, textAlignVertical: 'top', paddingTop: 14, flex: 1 },
    row: { flexDirection: 'row', gap: 12 },

    addButton: {
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#7cce06',
        borderStyle: 'dashed',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 10,
        marginBottom: 20,
    },
    addButtonText: { fontSize: 16, color: '#7cce06', fontWeight: '600' },

    infoBox: {
        flexDirection: 'row',
        backgroundColor: 'rgba(124,206,6,0.1)',
        padding: 16,
        borderRadius: 12,
        gap: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(124,206,6,0.2)',
    },
    infoText: { flex: 1, fontSize: 13, color: '#aaaaaa', lineHeight: 20 },

    footer: {
        padding: 24,
        overflow: 'hidden',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
    },
    completeButton: { borderRadius: 12, overflow: 'hidden' },
    completeButtonDisabled: { opacity: 0.6 },
    buttonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 8 },
    completeButtonText: { fontSize: 17, fontWeight: 'bold', color: '#ffffff' },
});
