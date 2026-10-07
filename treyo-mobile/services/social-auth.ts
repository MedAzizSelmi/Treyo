import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

/**
 * Sign in with Google, Apple or LinkedIn.
 *
 * Each provider is asked for a token that proves who the user is; that
 * token is then sent to our backend, which verifies it against the
 * provider's own signing keys before issuing Treyo credentials. The app
 * never decides who you are — it only carries the proof.
 *
 * Google and Apple run their flow here on the device. LinkedIn cannot —
 * it refuses custom-scheme redirects and needs a client secret — so the
 * backend drives that one and the app only opens the browser; see
 * linkedinOneTimeCode below.
 *
 * Google's and Apple's configuration lives in app.json under
 * `extra.social` (or the matching EXPO_PUBLIC_ variables) because client
 * IDs differ per platform and are not secrets: the OAuth flow is designed
 * around a public client, which is exactly why the backend re-verifies
 * everything. LinkedIn's credentials are on the server only.
 */

// Finish any browser session left open by a previous attempt.
WebBrowser.maybeCompleteAuthSession();

type Provider = 'google' | 'apple' | 'linkedin';

function cfg(key: string): string {
    const extra = (require('expo-constants').default?.expoConfig as any)?.extra?.social ?? {};
    return extra[key] ?? '';
}

export function isProviderConfigured(provider: Provider): boolean {
    switch (provider) {
        case 'google':
            return !!(Platform.OS === 'ios' ? cfg('googleIosClientId') : cfg('googleAndroidClientId'));
        case 'linkedin':
            // Nothing to check here: LinkedIn's client id and secret live
            // on the backend (see linkedinOneTimeCode below). If the server
            // has not been configured, it returns to the app with an error
            // message, which the sign-in screen shows.
            return true;
        case 'apple':
            // Apple's native sheet exists on iOS only; Android would need
            // the web flow, which Apple requires a Services ID for.
            return Platform.OS === 'ios';
        default:
            return false;
    }
}

/**
 * Run the provider's own flow on the device and return the ID token our
 * backend verifies. Google and Apple only: LinkedIn cannot work this way,
 * and goes through linkedinOneTimeCode instead.
 */
export async function getProviderToken(provider: 'google' | 'apple'): Promise<string> {
    switch (provider) {
        case 'google':
            return googleIdToken();
        case 'apple':
            return appleIdentityToken();
    }
}

/**
 * Google, via authorization code + PKCE.
 *
 * Not the implicit id_token flow: Google refuses it for installed apps
 * ("doesn't comply with Google's OAuth 2.0 policy for keeping apps
 * secure"), and PKCE is what replaces the client secret a mobile app
 * cannot keep. The code is exchanged on the device — native client types
 * have no secret — and the token response carries the id_token our
 * backend verifies.
 */
async function googleIdToken(): Promise<string> {
    const clientId = Platform.OS === 'ios' ? cfg('googleIosClientId') : cfg('googleAndroidClientId');
    if (!clientId) throw new Error('Google sign-in is not configured in this build.');

    // Google's iOS and Android OAuth clients only accept a redirect built
    // from the REVERSED client id — "com.googleusercontent.apps.<id>" —
    // not an app scheme of our choosing. Using treyomobile:// here returns
    // redirect_uri_mismatch. That reversed value must also be registered
    // as a URL scheme of the app (see app.json "scheme").
    // Built by hand, not with makeRedirectUri, which produces
    // "scheme://oauthredirect": Google's form for installed apps has a
    // single slash, and the two-slash variant is refused.
    //
    // Reversed client id on both platforms. On Android this requires
    // "Custom URI scheme" to be enabled on the OAuth client — Google
    // disables it by default on new Android clients and answers
    // "Custom URI scheme is not enabled for your Android client".
    const redirectUri = `${reversedClientId(clientId)}:/oauthredirect`;
    console.log('[google] redirectUri =', redirectUri);
    const discovery = await AuthSession.fetchDiscoveryAsync('https://accounts.google.com');

    const request = new AuthSession.AuthRequest({
        clientId,
        redirectUri,
        scopes: ['openid', 'profile', 'email'],
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true,
    });

    const result = await request.promptAsync(discovery);
    if (result.type !== 'success' || !result.params?.code) {
        throw new Error('CANCELLED');
    }

    const token = await AuthSession.exchangeCodeAsync(
        {
            clientId,
            code: result.params.code,
            redirectUri,
            extraParams: { code_verifier: request.codeVerifier ?? '' },
        },
        discovery,
    );
    if (!token.idToken) throw new Error('Google did not return an identity token.');
    return token.idToken;
}

/**
 * LinkedIn, run by the backend rather than on the device.
 *
 * Two things rule out the Google approach here. LinkedIn refuses
 * custom-scheme redirect URLs, so the return has to land on an https
 * address; and its token exchange requires the client secret, which
 * cannot be shipped inside an app — a bundle can be unpacked and read.
 *
 * So the backend drives the exchange, and the app's part is just to open
 * the browser and catch the return:
 *
 *   /api/auth/linkedin/start → LinkedIn → /api/auth/linkedin/callback
 *     → treyomobile://auth?code=…
 *
 * What comes back on that last hop is a one-time reference, not tokens.
 * Any Android app may claim a scheme, so tokens in the URL would be
 * handed to whatever app answered; this reference is worthless without a
 * call to /api/auth/linkedin/exchange, which is what api.ts does next.
 *
 * Returns the one-time code. Throws 'CANCELLED' if the browser is
 * dismissed, or the server's message if it sent one back.
 */
export async function linkedinOneTimeCode(startUrl: string): Promise<string> {
    // openAuthSessionAsync intercepts the redirect to this scheme itself,
    // so no route has to exist at treyomobile://auth.
    const result = await WebBrowser.openAuthSessionAsync(startUrl, 'treyomobile://auth');

    if (result.type !== 'success' || !result.url) {
        throw new Error('CANCELLED');
    }

    const { queryParams } = Linking.parse(result.url);
    const error = queryParams?.error;
    if (error) {
        // The backend puts a readable sentence here — an unapproved
        // trainer, an unverified address, or its own misconfiguration.
        throw new Error(String(error));
    }
    const code = queryParams?.code;
    if (!code) throw new Error('LinkedIn sign-in did not complete.');
    return String(code);
}

/**
 * Apple's native sheet. The identity token is a JWT the backend checks
 * against Apple's published keys.
 *
 * Only available on iOS; Apple's web flow needs a Services ID and a
 * server-side secret, which is work for the day an Android build needs
 * it. Note too that Apple returns the email address only on the very
 * first authorisation.
 */
async function appleIdentityToken(): Promise<string> {
    if (Platform.OS !== 'ios') {
        throw new Error('Sign in with Apple is available on iOS only.');
    }
    // Imported lazily: the module is iOS-only and pulls native code that
    // need not load on Android.
    const AppleAuthentication = await import('expo-apple-authentication');
    const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
    });
    if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
    return credential.identityToken;
}

/**
 * "123456-abc.apps.googleusercontent.com" →
 * "com.googleusercontent.apps.123456-abc"
 */
function reversedClientId(clientId: string): string {
    const id = clientId.replace('.apps.googleusercontent.com', '');
    return `com.googleusercontent.apps.${id}`;
}
