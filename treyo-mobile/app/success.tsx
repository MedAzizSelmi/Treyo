import { View, Text, StyleSheet, Animated } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground } from '../components/ScreenBackground';

export default function SuccessScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();

    const message = (params.message as string) || 'Success!';
    const nextRoute = (params.nextRoute as string) || '/login';

    const circleScale = useRef(new Animated.Value(0)).current;
    const checkOpacity = useRef(new Animated.Value(0)).current;
    const textOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(circleScale, {
            toValue: 1,
            tension: 50,
            friction: 6,
            useNativeDriver: true,
            delay: 150,
        }).start();

        Animated.timing(checkOpacity, {
            toValue: 1,
            duration: 300,
            delay: 450,
            useNativeDriver: true,
        }).start();

        Animated.timing(textOpacity, {
            toValue: 1,
            duration: 400,
            delay: 650,
            useNativeDriver: true,
        }).start();

        const timer = setTimeout(() => {
            router.replace(nextRoute as any);
        }, 2500);

        return () => clearTimeout(timer);
    }, []);

    return (
        <ScreenBackground style={styles.container}>
            <View style={styles.content}>
                <Animated.View
                    style={[
                        styles.circle,
                        { transform: [{ scale: circleScale }] },
                    ]}
                >
                    <Animated.View style={{ opacity: checkOpacity }}>
                        <Ionicons name="checkmark" size={52} color="#ffffff" />
                    </Animated.View>
                </Animated.View>

                <Animated.Text style={[styles.message, { opacity: textOpacity }]}>
                    {message}
                </Animated.Text>
            </View>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    circle: {
        width: 110,
        height: 110,
        borderRadius: 55,
        backgroundColor: '#7cce06',
        justifyContent: 'center',
        alignItems: 'center',
    },
    message: {
        fontSize: 22,
        fontWeight: '600',
        color: '#ffffff',
        textAlign: 'center',
        marginTop: 32,
        lineHeight: 30,
    },
});
