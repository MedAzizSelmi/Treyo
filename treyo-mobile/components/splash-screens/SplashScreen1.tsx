import { View, Image, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';

type SplashScreenProps = {
    onFinish: () => void;
};

// Use 'screen' (full physical screen) instead of 'window' (safe area).
//
// On iOS the two are essentially identical, so iPhone behaviour is
// unchanged. On Android, 'window' excludes the system navigation bar
// area — that made our bottomGlow view shorter than intended, which in
// turn pulled the strong-green bottom of the gradient up INTO the
// visible area instead of staying off-screen. 'screen' gives us the
// full height the gradient was designed against, so the strong-green
// portion stays below the visible region on every device.
const { width, height } = Dimensions.get('screen');

export default function SplashScreen1({ onFinish }: SplashScreenProps) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 1200,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 30,
                friction: 5,
                useNativeDriver: true,
            }),
        ]).start();

        const timer = setTimeout(() => {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
            }).start(() => onFinish());
        }, 3800);

        return () => clearTimeout(timer);
    }, []);

    return (
        <View style={styles.container}>
            {/* Background layers wrapped in `direction: 'ltr'` so the
                side glows aren't auto-mirrored in Arabic. */}
            <View style={[StyleSheet.absoluteFill, { direction: 'ltr' }]} pointerEvents="none">
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
            </View>

            <Animated.View
                style={[
                    styles.logoContainer,
                    {
                        opacity: fadeAnim,
                        transform: [{ scale: scaleAnim }],
                    },
                ]}
            >
                <Image
                    source={require('../../assets/images/Treyo-white.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#02000e',
        ...StyleSheet.absoluteFillObject,
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
    logoContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: 220,
        height: 220,
    },
});