import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('screen');

type Props = {
    children: React.ReactNode;
    style?: any;
};

/**
 * App-wide background. The four LinearGradients combine into the
 * purple-tinged-dark look used everywhere (matches the splash + modals).
 *
 * RTL handling:
 *   In Arabic, RN auto-mirrors `left` and `right` on absolutely-positioned
 *   views — which moves the side glows to the opposite edges but leaves
 *   the gradient direction inside them unchanged. That mismatch put the
 *   purple peak in the middle of the screen and produced visible bands.
 *
 *   The clean fix is to render all the background gradients inside a
 *   wrapper view with `direction: 'ltr'`. RN respects this style prop
 *   and stops mirroring layout for that subtree — so the background
 *   draws exactly the same in every language. The screen content above
 *   it (children) stays in the app's normal RTL direction.
 */
export function ScreenBackground({ children, style }: Props) {
    return (
        <View style={[styles.container, style]}>
            <View style={[StyleSheet.absoluteFill, styles.bgLayer]} pointerEvents="none">
                <LinearGradient colors={['#160e45', '#02000e']} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['rgba(124,206,6,0.6)', 'rgba(124,206,6,0.25)', 'transparent']} style={styles.topGlow} />
                <LinearGradient colors={['transparent', 'rgba(124,206,6,0.25)', 'rgba(124,206,6,0.6)']} style={styles.bottomGlow} />
                <LinearGradient colors={['rgba(19,5,107,1)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.leftGlow} />
                <LinearGradient colors={['transparent', 'rgba(19,5,107,1)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.rightGlow} />
            </View>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#02000e' },
    // `direction: 'ltr'` opts this subtree out of RN's RTL auto-mirroring,
    // so the side glows stay pinned to the same physical edges regardless
    // of the app language.
    bgLayer: { direction: 'ltr' },
    topGlow: { position: 'absolute', width, height: height * 0.35, top: -100 },
    bottomGlow: { position: 'absolute', width, height: height * 0.4, bottom: -180 },
    leftGlow: { position: 'absolute', width: width * 0.5, height, left: -100 },
    rightGlow: { position: 'absolute', width: width * 0.5, height, right: -100 },
});
