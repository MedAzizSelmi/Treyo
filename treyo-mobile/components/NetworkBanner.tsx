import { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated, Platform, StatusBar, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import NetInfo from '@react-native-community/netinfo';

/**
 * App-wide connectivity banner.
 *
 * Offline  → persistent red bar, stays until connectivity returns.
 * Restored → green "Back online" bar that auto-dismisses after a moment.
 *
 * Mounted once in the root layout so it floats above every screen.
 *
 * Connectivity rule: NetInfo reports both `isConnected` (a transport is
 * attached) and `isInternetReachable` (that transport can actually reach
 * the internet). We treat "offline" as connected === false OR
 * reachable === false, which correctly catches the common case of being
 * joined to a Wi-Fi network that has no working internet. `reachable` is
 * null while the first probe is still in flight — that's explicitly NOT
 * treated as offline, otherwise the banner would flash on every cold
 * start before the check completes.
 */

const AUTO_HIDE_MS = 3000;

export default function NetworkBanner() {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();

    const [offline, setOffline] = useState(false);
    const [showRestored, setShowRestored] = useState(false);

    // Tracks the previous state so we only show "Back online" after an
    // actual offline period — not on the very first reading at launch.
    const wasOffline = useRef(false);
    const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const slide = useRef(new Animated.Value(-100)).current;

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            const isOffline =
                state.isConnected === false || state.isInternetReachable === false;

            setOffline(isOffline);

            if (isOffline) {
                // Cancel a pending "Back online" dismissal — we dropped
                // out again before it finished hiding.
                if (restoreTimer.current) {
                    clearTimeout(restoreTimer.current);
                    restoreTimer.current = null;
                }
                setShowRestored(false);
                wasOffline.current = true;
            } else if (wasOffline.current) {
                // Only celebrate a recovery if we were genuinely offline.
                wasOffline.current = false;
                setShowRestored(true);
                if (restoreTimer.current) clearTimeout(restoreTimer.current);
                restoreTimer.current = setTimeout(() => {
                    setShowRestored(false);
                    restoreTimer.current = null;
                }, AUTO_HIDE_MS);
            }
        });

        return () => {
            unsubscribe();
            if (restoreTimer.current) clearTimeout(restoreTimer.current);
        };
    }, []);

    const visible = offline || showRestored;

    // Slide in/out whenever visibility flips.
    useEffect(() => {
        Animated.timing(slide, {
            toValue: visible ? 0 : -100,
            duration: 220,
            useNativeDriver: true,
        }).start();
    }, [visible, slide]);

    // Deliberately always mounted: the banner is parked off-screen via
    // translateY when hidden, which keeps the slide animation smooth in
    // both directions. pointerEvents="none" means it never intercepts
    // touches, so leaving it in the tree costs nothing interactively.
    const isOfflineStyle = offline;

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.wrap,
                {
                    transform: [{ translateY: slide }],
                    paddingTop: (insets.top || StatusBar.currentHeight || 0) + 8,
                    backgroundColor: isOfflineStyle
                        ? 'rgba(180,32,32,0.97)'
                        : 'rgba(58,140,10,0.97)',
                },
            ]}
        >
            <View style={styles.row}>
                <Ionicons
                    name={isOfflineStyle ? 'cloud-offline-outline' : 'checkmark-circle-outline'}
                    size={16}
                    color="#ffffff"
                />
                <Text style={styles.text} numberOfLines={2}>
                    {isOfflineStyle ? t('network.offline') : t('network.backOnline')}
                </Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        // Above every screen, including modals pushed by the Stack.
        zIndex: 9999,
        elevation: 12,
        paddingBottom: 10,
        paddingHorizontal: 16,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
            },
            default: {},
        }),
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    text: {
        color: '#ffffff',
        fontSize: 12.5,
        fontWeight: '600',
        flexShrink: 1,
        textAlign: 'center',
    },
});
