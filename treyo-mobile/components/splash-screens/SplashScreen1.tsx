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
    // The logo starts fully visible at its final size, deliberately.
    //
    // Android always draws its own splash window before any JavaScript
    // runs, and app.json styles that one to match this screen. If the
    // logo animated in from opacity 0 and scale 0.9, the handover would
    // read as two separate screens: the native logo appears, vanishes,
    // then fades back in. Starting settled makes the native splash and
    // this one look like a single continuous screen.
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
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