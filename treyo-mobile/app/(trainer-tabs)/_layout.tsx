import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { TrainerTabBar } from '../../components/TrainerTabBar';

export default function TrainerTabsLayout() {
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