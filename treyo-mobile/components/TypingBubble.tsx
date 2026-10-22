import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useEffect, useRef } from 'react';

/**
 * The "someone is typing" bubble at the foot of a chat: three dots that
 * rise and fall in turn, with the label under them.
 *
 * The header already names who is typing, but it is small and sits above
 * the conversation; the bubble is where the eye is, in the place the
 * message is about to appear. Native-driver animation, so it costs the JS
 * thread nothing while the person types.
 */
export function TypingBubble({ label }: { label: string }) {
    const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

    useEffect(() => {
        const wave = Animated.loop(
            Animated.stagger(160, dots.map(v =>
                Animated.sequence([
                    Animated.timing(v, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                    Animated.timing(v, { toValue: 0, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true }),
                ]),
            )),
        );
        wave.start();
        return () => wave.stop();
    }, [dots]);

    return (
        <View style={styles.row} accessibilityLiveRegion="polite" accessibilityLabel={label}>
            <View style={styles.bubble}>
                {dots.map((v, i) => (
                    <Animated.View
                        key={i}
                        style={[styles.dot, {
                            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
                        }]}
                    />
                ))}
            </View>
            <Text style={styles.label} numberOfLines={1}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { alignSelf: 'flex-start', marginTop: 6, marginBottom: 4, maxWidth: '80%' },
    bubble: {
        flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
        paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, borderBottomLeftRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7cce06' },
    label: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4, marginLeft: 4 },
});
