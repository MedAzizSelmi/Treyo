import { Tabs, useFocusEffect, usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, BackHandler } from 'react-native';
import { TrainerTabBar } from '../../components/TrainerTabBar';

// Pathnames that count as "tab roots" — visiting one of these is what we
// record in our tab history. Screens pushed on top (course-detail, edit-
// profile, etc.) use the parent Stack's normal back behavior and aren't
// tracked here.
const TAB_PATHS = ['/home', '/messages', '/courses', '/notifications', '/profile'];

export default function TrainerTabsLayout() {
    const pathname = usePathname();
    const router = useRouter();

    // Recent tab visits, oldest first. e.g. user goes Home → Messages →
    // Courses → history is ['/home','/messages','/courses']. Back pops to
    // Messages, back again pops to Home, back again exits the app.
    const tabHistoryRef = useRef<string[]>([]);
    // When the back button pops the history we navigate programmatically,
    // which itself triggers the pathname effect below. This flag stops us
    // from re-adding the popped-to entry back onto the history.
    const skipNextRecordRef = useRef(false);

    // Record tab visits as the user navigates between tabs.
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
    // If something is pushed on top (e.g. course-detail), the tabs lose
    // focus, this handler unmounts, and the parent Stack handles back
    // normally — popping back to the tab the user came from.
    useFocusEffect(
        useCallback(() => {
            const sub = BackHandler.addEventListener('hardwareBackPress', () => {
                const history = tabHistoryRef.current;
                if (history.length > 1) {
                    // Pop the current tab and navigate to the previous one.
                    history.pop();
                    const prev = history[history.length - 1];
                    skipNextRecordRef.current = true;
                    router.navigate(prev as any);
                    return true;
                }
                // No earlier tab to return to — only auth/onboarding sits
                // underneath in the parent stack, so exit instead.
                BackHandler.exitApp();
                return true;
            });
            return () => sub.remove();
        }, [router])
    );

    return (
        <View style={styles.container}>
            <Tabs
                tabBar={(props) => <TrainerTabBar {...props} />}
                screenOptions={{
                    headerShown: false,
                }}
            >
                <Tabs.Screen name="home" />
                <Tabs.Screen name="messages" />
                <Tabs.Screen name="courses" />
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