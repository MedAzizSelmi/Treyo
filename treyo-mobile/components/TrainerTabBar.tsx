import { View, TouchableOpacity, StyleSheet, Animated, Image, Platform } from 'react-native';
import { useRef } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type TabBarProps = {
    state: any;
    descriptors: any;
    navigation: any;
};

// Only these 4 routes appear in the tab bar.
// `book-open-outline` lives in MaterialCommunityIcons, not Ionicons —
// using Ionicons for it renders a "?" placeholder.
const VISIBLE_TABS: Array<{ name: string; icon?: any; mcIcon?: string }> = [
    {
        name: 'home',
        icon: require('../assets/Tabs/Home.png'),
    },
    {
        name: 'messages',
        icon: require('../assets/Tabs/Chat.png'),
    },
    {
        name: 'courses',
        mcIcon: 'book-open-blank-variant-outline',
    },
    {
        name: 'profile',
        icon: require('../assets/Tabs/User.png'),
    },
];

export function TrainerTabBar({ state, descriptors, navigation }: TabBarProps) {
    const scaleAnims = useRef(VISIBLE_TABS.map(() => new Animated.Value(1))).current;

    const getRouteIndex = (tabName: string) =>
        state.routes.findIndex((r: any) => r.name === tabName);

    const onTabPress = (tabName: string, visibleIndex: number) => {
        const routeIndex = getRouteIndex(tabName);
        if (routeIndex === -1) return;

        const route = state.routes[routeIndex];
        const isFocused = state.index === routeIndex;

        Animated.sequence([
            Animated.timing(scaleAnims[visibleIndex], {
                toValue: 0.8,
                duration: 80,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnims[visibleIndex], {
                toValue: 1,
                tension: 120,
                friction: 4,
                useNativeDriver: true,
            }),
        ]).start();

        const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
        });

        if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
        }
    };

    return (
        <View style={styles.wrapper}>
            <View style={styles.container}>
                {VISIBLE_TABS.map((tab, visibleIndex) => {
                    const routeIndex = getRouteIndex(tab.name);
                    const isFocused = state.index === routeIndex;

                    return (
                        <TouchableOpacity
                            key={tab.name}
                            accessibilityRole="button"
                            accessibilityState={isFocused ? { selected: true } : {}}
                            onPress={() => onTabPress(tab.name, visibleIndex)}
                            style={styles.tab}
                            activeOpacity={0.7}
                        >
                            <Animated.View
                                style={[
                                    styles.iconContainer,
                                    isFocused && styles.iconContainerActive,
                                    { transform: [{ scale: scaleAnims[visibleIndex] }] },
                                ]}
                            >
                                {tab.mcIcon ? (
                                    <MaterialCommunityIcons
                                        name={tab.mcIcon as any}
                                        size={26}
                                        color={`rgba(255,255,255,${isFocused ? 1 : 0.5})`}
                                    />
                                ) : (
                                    <Image
                                        source={tab.icon}
                                        style={[
                                            styles.icon,
                                            tab.name === 'messages' && { width: 33, height: 33 },
                                            { opacity: isFocused ? 1 : 0.5 },
                                        ]}
                                        resizeMode="contain"
                                    />
                                )}
                            </Animated.View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        bottom: 16,
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingBottom: Platform.OS === 'ios' ? 8 : 0,
    },
    container: {
        height: 64,
        borderRadius: 32,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        backgroundColor: 'rgba(76, 76, 76, 0.8)',
        borderWidth: 1,
        borderColor: 'rgba(76, 76, 76, 0.8)',
        width: 360,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 12,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
    },
    iconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    iconContainerActive: {
        backgroundColor: '#7cce06',
        shadowColor: '#7cce06',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 6,
    },
    icon: {
        width: 24,
        height: 24,
        tintColor: '#ffffff',
    },
});
