import { View, TouchableOpacity, StyleSheet, Animated, Image, useWindowDimensions, Platform } from 'react-native';
import { useEffect, useRef } from 'react';

type TabBarProps = {
    state: any;
    descriptors: any;
    navigation: any;
};

// Only these 4 routes appear in the tab bar
const VISIBLE_TABS = [
    {
        name: 'home',
        icon: require('../assets/Tabs/Home.png'),
        iconFilled: require('../assets/Tabs/Home_Filled.png'),
    },
    {
        name: 'messages',
        icon: require('../assets/Tabs/Chat.png'),
        iconFilled: require('../assets/Tabs/Chat_Filled.png'),
    },
    {
        name: 'chatbot',
        icon: require('../assets/Tabs/Bot.png'),
        iconFilled: require('../assets/Tabs/Bot_Filled.png'),
    },
    {
        name: 'profile',
        icon: require('../assets/Tabs/User.png'),
        iconFilled: require('../assets/Tabs/User_Filled.png'),
    },
];

export function StudentTabBar({ state, descriptors, navigation }: TabBarProps) {
    const { width } = useWindowDimensions();
    const scaleAnims = useRef(VISIBLE_TABS.map(() => new Animated.Value(1))).current;

    // Map visible tab name → route index in state.routes
    const getRouteIndex = (tabName: string) =>
        state.routes.findIndex((r: any) => r.name === tabName);

    const onTabPress = (tabName: string, visibleIndex: number) => {
        const routeIndex = getRouteIndex(tabName);
        if (routeIndex === -1) return;

        const route = state.routes[routeIndex];
        const isFocused = state.index === routeIndex;

        // Bounce animation
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
                                    { transform: [{ scale: scaleAnims[visibleIndex] }] },
                                ]}
                            >
                                <Image
                                    source={isFocused ? tab.iconFilled : tab.icon}
                                    style={[
                                        styles.icon,
                                        { opacity: isFocused ? 1 : 0.5 },
                                    ]}
                                    resizeMode="contain"
                                />
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
        borderColor: 'rgba(137, 137, 137, 0.8)',
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
        width: 40,
        height: 40,
    },
    icon: {
        width: 26,
        height: 26,
        tintColor: '#ffffff',
    },
});
