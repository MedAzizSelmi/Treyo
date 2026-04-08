import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { authService } from '../services/api';

const { width, height } = Dimensions.get('window');

export default function SignupScreen() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [userType, setUserType] = useState<'STUDENT' | 'TRAINER'>('STUDENT');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSignup = async () => {
        if (!name || !email || !password) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        setLoading(true);
        try {
            const response = await authService.register({
                name,
                email,
                password,
                userType,
            });

            // Determine where to go after the success screen
            let nextRoute: string;
            if (!response.onboardingComplete) {
                nextRoute = userType === 'STUDENT'
                    ? '/onboarding/student/step1'
                    : '/onboarding/trainer/step1';
            } else {
                nextRoute = userType === 'STUDENT'
                    ? '/(student-tabs)/home'
                    : '/(trainer-tabs)/home';
            }

            // Show animated success screen first
            router.replace({
                pathname: '/success' as any,
                params: {
                    message: 'Your account has been\nsuccessfully created!',
                    nextRoute,
                },
            });
        } catch (error: any) {
            console.error('Signup error:', error);
            Alert.alert('Signup Failed', error.response?.data?.message || 'Please try again');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            {/* Splash Screen Background */}
            <LinearGradient
                colors={['#160e45', '#02000e']}
                style={StyleSheet.absoluteFill}
            />
            <LinearGradient
                colors={['rgba(124,206,6,0.6)', 'rgba(124,206,6,0.25)', 'transparent']}
                style={styles.topGlow}
            />
            <LinearGradient
                colors={['transparent', 'rgba(124,206,6,0.25)', 'rgba(124,206,6,0.6)']}
                style={styles.bottomGlow}
            />
            <LinearGradient
                colors={['rgba(19,5,107,1)', 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.leftGlow}
            />
            <LinearGradient
                colors={['transparent', 'rgba(19,5,107,1)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.rightGlow}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.back()}
                    >
                        <Ionicons name="arrow-back" size={24} color="#ffffff" />
                    </TouchableOpacity>

                    <View style={styles.header}>
                        <Text style={styles.title}>Create Account</Text>
                        <Text style={styles.subtitle}>Start your learning journey</Text>
                    </View>

                    {/* User Type Selector */}
                    <View style={styles.userTypeContainer}>
                        <TouchableOpacity
                            style={[styles.userTypeButton, userType === 'STUDENT' && styles.userTypeButtonActive]}
                            onPress={() => setUserType('STUDENT')}
                            disabled={loading}
                        >
                            <Ionicons
                                name="school-outline"
                                size={20}
                                color={userType === 'STUDENT' ? '#ffffff' : '#aaaaaa'}
                            />
                            <Text style={[styles.userTypeText, userType === 'STUDENT' && styles.userTypeTextActive]}>
                                I want to learn
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.userTypeButton, userType === 'TRAINER' && styles.userTypeButtonActive]}
                            onPress={() => setUserType('TRAINER')}
                            disabled={loading}
                        >
                            <Ionicons
                                name="person-outline"
                                size={20}
                                color={userType === 'TRAINER' ? '#ffffff' : '#aaaaaa'}
                            />
                            <Text style={[styles.userTypeText, userType === 'TRAINER' && styles.userTypeTextActive]}>
                                I want to teach
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.form}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Full Name</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="person-outline" size={20} color="#aaaaaa" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter your name"
                                    placeholderTextColor="#888888"
                                    value={name}
                                    onChangeText={setName}
                                    editable={!loading}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Email</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="mail-outline" size={20} color="#aaaaaa" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter your email"
                                    placeholderTextColor="#888888"
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    editable={!loading}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Password</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="lock-closed-outline" size={20} color="#aaaaaa" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Create a password (min 6 characters)"
                                    placeholderTextColor="#888888"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                    editable={!loading}
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                    <Ionicons
                                        name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                                        size={20}
                                        color="#aaaaaa"
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[styles.signupButton, loading && styles.signupButtonDisabled]}
                            onPress={handleSignup}
                            activeOpacity={0.8}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={['#7cce06', '#6bb805']}
                                style={styles.buttonGradient}
                            >
                                <Text style={styles.signupButtonText}>
                                    {loading ? 'Creating Account...' : 'Create Account'}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <Text style={styles.terms}>
                            By signing up, you agree to our{'\n'}
                            <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
                            <Text style={styles.termsLink}>Privacy Policy</Text>
                        </Text>

                        <View style={styles.loginContainer}>
                            <Text style={styles.loginText}>Already have an account? </Text>
                            <TouchableOpacity onPress={() => router.push('/login' as any)}>
                                <Text style={styles.loginLink}>Sign In</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#02000e',
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
        paddingTop: 60,
    },
    topGlow: {
        position: 'absolute',
        width: width,
        height: height * 0.35,
        top: -100,
    },
    bottomGlow: {
        position: 'absolute',
        width: width,
        height: height * 0.4,
        bottom: -180,
    },
    leftGlow: {
        position: 'absolute',
        width: width * 0.5,
        height: height,
        left: -100,
    },
    rightGlow: {
        position: 'absolute',
        width: width * 0.5,
        height: height,
        right: -100,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    header: {
        marginBottom: 32,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        marginBottom: 8,
        color: '#ffffff',
    },
    subtitle: {
        fontSize: 16,
        color: '#cccccc',
    },
    userTypeContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 32,
    },
    userTypeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        gap: 8,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderColor: 'rgba(255,255,255,0.2)',
    },
    userTypeButtonActive: {
        backgroundColor: '#7cce06',
        borderColor: '#7cce06',
    },
    userTypeText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#aaaaaa',
    },
    userTypeTextActive: {
        color: '#ffffff',
    },
    form: {
        flex: 1,
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
        color: '#ffffff',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        paddingHorizontal: 16,
        borderWidth: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderColor: 'rgba(255,255,255,0.2)',
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        fontSize: 16,
        paddingVertical: 16,
        color: '#ffffff',
    },
    signupButton: {
        borderRadius: 12,
        overflow: 'hidden',
        marginTop: 8,
        shadowColor: '#7cce06',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    signupButtonDisabled: {
        opacity: 0.6,
    },
    buttonGradient: {
        paddingVertical: 16,
    },
    signupButtonText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ffffff',
        textAlign: 'center',
    },
    terms: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 20,
        lineHeight: 18,
        color: '#aaaaaa',
    },
    termsLink: {
        color: '#7cce06',
        fontWeight: '600',
    },
    loginContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 24,
    },
    loginText: {
        fontSize: 15,
        color: '#cccccc',
    },
    loginLink: {
        fontSize: 15,
        color: '#7cce06',
        fontWeight: 'bold',
    },
});