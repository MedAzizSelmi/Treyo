import { Tabs, useFocusEffect, usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, BackHandler } from 'react-native';
import { StudentTabBar } from '../../components/StudentTabBar';

// Pathnames that count as "tab roots" — visiting one of these is what we
// record in tab history. Pushed sub-screens (course-detail, trainer-
// profile, etc.) use the parent Stack's normal back behavior and are not
// tracked here.
const TAB_PATHS = [
    '/home',
    '/chatbot',
    '/messages',
    '/trainers',
    '/notifications',
    '/profile',
];

export default function StudentTabsLayout() {
    const pathname = usePathname();
    const router = useRouter();

    // Recent tab visits, oldest first. Back walks this history one step at
    // a time before falling through to exitApp. So Home → Messages → back
    // → Home, back → exit.
    const tabHistoryRef = useRef<string[]>([]);
    // Set when we navigate programmatically from the back handler so the
    // pathname effect below doesn't re-record the entry we just popped to.
    const skipNextRecordRef = useRef(false);

    useEffect(() => {
        if (!TAB_PATHS.includes(pathname)) return;
        if (skipNextRecordRef.current) {
            skipNextRecordRef.current = false;
            return;
        }
        const history = tabHistoryRef.current;
        if (history[history.length - 1] !== pathname) {
            history.push(pathname);
        }
    }, [pathname]);

    // Only intercept hardware back while a tab itself is the topmost screen.
    // If a sub-screen was pushed on top of the tabs, this handler unmounts
    // (via useFocusEffect) and the parent Stack handles back normally —
    // popping back to whichever tab the user came from.
    useFocusEffect(
        useCallback(() => {
            const sub = BackHandler.addEventListener('hardwareBackPress', () => {
                const history = tabHistoryRef.current;
                if (history.length > 1) {
                    history.pop();
                    const prev = history[history.length - 1];
                    skipNextRecordRef.current = true;
                    router.navigate(prev as any);
                    return true;
                }
                BackHandler.exitApp();
                return true;
            });
            return () => sub.remove();
        }, [router])
    );

    return (
        <View style={styles.container}>
            <Tabs
                tabBar={(props) => <StudentTabBar {...props} />}
                screenOptions={{
                    headerShown: false,
                }}
            >
                <Tabs.Screen name="home" />
                <Tabs.Screen name="chatbot" />
                <Tabs.Screen name="messages" />
                <Tabs.Screen name="trainers" />
                <Tabs.Screen name="notifications" />
                <Tabs.Screen name="profile" />
            </Tabs>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});