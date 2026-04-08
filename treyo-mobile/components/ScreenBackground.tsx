import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

type Props = {
    children: React.ReactNode;
    style?: any;
};

export function ScreenBackground({ children, style }: Props) {
    return (
        <View style={[styles.container, style]}>
            <LinearGradient colors={['#160e45', '#02000e']} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['rgba(124,206,6,0.6)', 'rgba(124,206,6,0.25)', 'transparent']} style={styles.topGlow} />
            <LinearGradient colors={['transparent', 'rgba(124,206,6,0.25)', 'rgba(124,206,6,0.6)']} style={styles.bottomGlow} />
            <LinearGradient colors={['rgba(19,5,107,1)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.leftGlow} />
            <LinearGradient colors={['transparent', 'rgba(19,5,107,1)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.rightGlow} />
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#02000e' },
    topGlow: { position: 'absolute', width, height: height * 0.35, top: -100 },
    bottomGlow: { position: 'absolute', width, height: height * 0.4, bottom: -180 },
    leftGlow: { position: 'absolute', width: width * 0.5, height, left: -100 },
    rightGlow: { position: 'absolute', width: width * 0.5, height, right: -100 },
});
