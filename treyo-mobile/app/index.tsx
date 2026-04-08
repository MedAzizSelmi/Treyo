import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

export default function WelcomeScreen() {
    const router = useRouter();

    return (
        <View style={styles.container}>
            {/* Background (same as onboarding) */}
            <LinearGradient colors={['#160e45', '#02000e']} style={StyleSheet.absoluteFill} />
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

            {/* Content */}
            <View style={styles.content}>
                {/* Logo */}
                <Image
                    source={require('../assets/images/logo-white.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />

                {/* App Name */}
                <Text style={styles.appName}>
                    Tr<Text style={styles.green}>e</Text>yo
                </Text>

                {/* Slogan */}
                <Text style={styles.slogan}>
                    Smart match, swift growth
                </Text>
            </View>

            {/* Buttons */}
            <View style={styles.buttons}>
                <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => router.push('/signup' as any)}
                    activeOpacity={0.8}
                >
                    <LinearGradient
                        colors={['#7cce06', '#6bb805']}
                        style={styles.buttonGradient}
                    >
                        <Text style={styles.primaryButtonText}>Get Started</Text>
                    </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => router.push('/login' as any)}
                    activeOpacity={0.8}
                >
                    <Text style={styles.secondaryButtonText}>Sign In</Text>
                </TouchableOpacity>

                <Text style={styles.terms}>
                    By continuing, you agree to our{' '}
                    <Text style={styles.termsLink}>Terms</Text> and{' '}
                    <Text style={styles.termsLink}>Privacy Policy</Text>
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#02000e',
    },

    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },

    logo: {
        width: 140,
        height: 140,
        marginBottom: 20,
    },

    appName: {
        fontSize: 56,
        fontWeight: 'bold',
        color: 'white',
        letterSpacing: 2,
    },

    green: {
        color: '#7CCE06',
    },

    slogan: {
        fontSize: 16,
        color: '#cfcfcf',
        marginTop: 10,
    },

    buttons: {
        paddingHorizontal: 30,
        paddingBottom: 50,
        gap: 16,
    },

    primaryButton: {
        borderRadius: 28,
        overflow: 'hidden',
        shadowColor: '#7cce06',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },

    buttonGradient: {
        paddingVertical: 18,
        alignItems: 'center',
        borderRadius: 28,
    },

    primaryButtonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 'bold',
    },

    secondaryButton: {
        borderRadius: 28,
        paddingVertical: 18,
        borderWidth: 1.5,
        borderColor: '#7CCE06',
        alignItems: 'center',
    },

    secondaryButtonText: {
        color: '#7CCE06',
        fontSize: 18,
        fontWeight: 'bold',
    },

    terms: {
        fontSize: 13,
        color: '#888',
        textAlign: 'center',
        marginTop: 10,
        lineHeight: 18,
    },

    termsLink: {
        color: '#7CCE06',
        fontWeight: '600',
    },

    /* SAME GLOW AS ONBOARDING */
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
});