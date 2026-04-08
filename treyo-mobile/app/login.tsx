import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { authService } from '../services/api';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [socialLoading, setSocialLoading] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Please enter email and password');
            return;
        }

        setLoading(true);
        try {
            const response = await authService.login(email, password);

            if (!response.onboardingComplete) {
                if (response.role === 'STUDENT') {
                    router.replace('/onboarding/student/step1' as any);
                } else {
                    router.replace('/onboarding/trainer/step1' as any);
                }
            } else {
                if (response.role === 'STUDENT') {
                    router.replace('/(student-tabs)/home' as any);
                } else {
                    router.replace('/(trainer-tabs)/home' as any);
                }
            }
        } catch (error: any) {
            Alert.alert('Login Failed', error.response?.data?.message || 'Invalid credentials');
        } finally {
            setLoading(false);
        }
    };

    const handleSocialLogin = async (provider: 'google' | 'apple' | 'linkedin') => {
        setSocialLoading(true);
        try {
            let response;
            switch (provider) {
                case 'google':
                    response = await authService.loginWithGoogle();
                    break;
                case 'apple':
                    response = await authService.loginWithApple();
                    break;
                case 'linkedin':
                    response = await authService.loginWithLinkedIn();
                    break;
            }
            // Assuming response has same structure as email/password login
            if (!response.onboardingComplete) {
                if (response.role === 'STUDENT') {
                    router.replace('/onboarding/student/step1' as any);
                } else {
                    router.replace('/onboarding/trainer/step1' as any);
                }
            } else {
                if (response.role === 'STUDENT') {
                    router.replace('/(student-tabs)/home' as any);
                } else {
                    router.replace('/(trainer-tabs)/home' as any);
                }
            }
        } catch (error: any) {
            Alert.alert('Social Login Failed', error.response?.data?.message || `Could not sign in with ${provider}`);
        } finally {
            setSocialLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            {/* Background */}
            <LinearGradient colors={['#160e45', '#02000e']} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['rgba(124,206,6,0.6)', 'rgba(124,206,6,0.25)', 'transparent']} style={styles.topGlow} />
            <LinearGradient colors={['transparent', 'rgba(124,206,6,0.25)', 'rgba(124,206,6,0.6)']} style={styles.bottomGlow} />
            <LinearGradient colors={['rgba(19,5,107,1)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.leftGlow} />
            <LinearGradient colors={['transparent', 'rgba(19,5,107,1)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.rightGlow} />

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>

                <View style={styles.header}>
                    <Text style={styles.title}>Welcome Back</Text>
                    <Text style={styles.subtitle}>Sign in to continue</Text>
                </View>

                <View style={styles.form}>
                    <View style={styles.inputContainer}>
                        <Ionicons name="mail-outline" size={20} color="#aaa" />
                        <TextInput
                            style={styles.input}
                            placeholder="Email"
                            placeholderTextColor="#777"
                            value={email}
                            onChangeText={setEmail}
                            editable={!loading && !socialLoading}
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Ionicons name="lock-closed-outline" size={20} color="#aaa" />
                        <TextInput
                            style={styles.input}
                            placeholder="Password"
                            placeholderTextColor="#777"
                            secureTextEntry={!showPassword}
                            value={password}
                            onChangeText={setPassword}
                            editable={!loading && !socialLoading}
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                            <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color="#aaa" />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={styles.loginButton}
                        onPress={handleLogin}
                        disabled={loading || socialLoading}
                    >
                        <LinearGradient colors={['#7cce06', '#6bb805']} style={styles.buttonGradient}>
                            <Text style={styles.loginButtonText}>
                                {loading ? 'Signing In...' : 'Sign In'}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Social Login Section */}
                    <View style={styles.socialSection}>
                        <View style={styles.divider}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>or continue with</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        <View style={styles.socialButtons}>
                            <TouchableOpacity
                                style={styles.socialButton}
                                onPress={() => handleSocialLogin('google')}
                                disabled={loading || socialLoading}
                            >
                                <Ionicons name="logo-google" size={24} color="#DB4437" />
                                <Text style={styles.socialButtonText}>Google</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.socialButton}
                                onPress={() => handleSocialLogin('apple')}
                                disabled={loading || socialLoading}
                            >
                                <Ionicons name="logo-apple" size={24} color="#ffffff" />
                                <Text style={styles.socialButtonText}>Apple</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.socialButton}
                                onPress={() => handleSocialLogin('linkedin')}
                                disabled={loading || socialLoading}
                            >
                                <Ionicons name="logo-linkedin" size={24} color="#0A66C2" />
                                <Text style={styles.socialButtonText}>LinkedIn</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.signupContainer}>
                        <Text style={styles.signupText}>Don't have an account? </Text>
                        <TouchableOpacity onPress={() => router.push('/signup' as any)}>
                            <Text style={styles.signupLink}>Sign Up</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#02000e' },
    scrollContent: { flexGrow: 1, padding: 24, paddingTop: 60 },

    backButton: {
        width: 40, height: 40, borderRadius: 12,
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginBottom: 30
    },

    header: { marginBottom: 40 },
    title: { fontSize: 32, fontWeight: 'bold', color: 'white' },
    subtitle: { fontSize: 16, color: '#aaa', marginTop: 5 },

    form: { gap: 20 },

    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 14,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)'
    },

    input: {
        flex: 1,
        color: 'white',
        paddingVertical: 16,
        marginLeft: 10
    },

    loginButton: {
        borderRadius: 20,
        overflow: 'hidden',
        marginTop: 10
    },

    buttonGradient: {
        paddingVertical: 16,
        alignItems: 'center'
    },

    loginButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold'
    },

    // Social login styles
    socialSection: {
        marginTop: 20,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    dividerText: {
        color: '#aaa',
        paddingHorizontal: 12,
        fontSize: 14,
    },
    socialButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    socialButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 14,
        paddingVertical: 12,
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    socialButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },

    signupContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 20
    },

    signupText: { color: '#aaa' },
    signupLink: { color: '#7CCE06', fontWeight: 'bold' },

    topGlow: { position: 'absolute', width: width, height: height * 0.35, top: -100 },
    bottomGlow: { position: 'absolute', width: width, height: height * 0.4, bottom: -180 },
    leftGlow: { position: 'absolute', width: width * 0.5, height: height, left: -100 },
    rightGlow: { position: 'absolute', width: width * 0.5, height: height, right: -100 },
});