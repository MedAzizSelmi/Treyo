import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { StudentTabBar } from '../../components/StudentTabBar';

export default function StudentTabsLayout() {
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