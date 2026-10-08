import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';

/**
 * Where Google's sign-in redirect lands, so it stops hitting the 404.
 *
 * Google's OAuth clients only accept a redirect built from the reversed
 * client id — "com.googleusercontent.apps.<id>:/oauthredirect" — and that
 * reversed id is declared in app.json as one of the app's URL schemes, so
 * Android must hand the URL to us. expo-router then tries to resolve its
 * path, "/oauthredirect", as a route; with no file to match it, it fell
 * through to +not-found and flashed "This screen doesn't exist" for a
 * moment before the sign-in finished and navigated away.
 *
 * expo-auth-session has already captured the response by this point — the
 * browser session resolves on its own. Nothing is left to do here but
 * occupy the route quietly, so this renders a plain dark screen matching
 * the app's background instead of a white flash or an error.
 */
export default function OAuthRedirect() {
    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.container} />
        </>
    );
}

const styles = StyleSheet.create({
    // Same near-black the splash and ScreenBackground settle on, so the
    // handover is invisible rather than a jarring blank frame.
    container: { flex: 1, backgroundColor: '#02000e' },
});
