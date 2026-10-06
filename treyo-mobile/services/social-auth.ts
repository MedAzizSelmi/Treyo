import * as AuthSession from 'expo-auth-session';
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
 * Configuration lives in app.json under `extra.social` (or the matching
 * EXPO_PUBLIC_ variables) because client IDs differ per platform and are
 * not secrets: the OAuth flow is designed around a public client, which
 * is exactly why the backend re-verifies everything.
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
            return !!cfg('linkedinClientId');
        case 'apple':
            // Apple's native sheet exists on iOS only; Android would need
            // the web flow, which Apple requires a Services ID for.
            return Platform.OS === 'ios';
        default:
            return false;
    }
}

/**
 * Run the provider's flow and return the token our backend expects:
 * an ID token for Google and Apple, an access token for LinkedIn.
 */
export async function getProviderToken(provider: Provider): Promise<string> {
    switch (provider) {
        case 'google':
            return googleIdToken();
        case 'linkedin':
            return linkedinAccessToken();
        case 'apple':
            return appleIdentityToken();
    }
}

/**
 * Google, via the implicit id_token flow: no client secret, nothing to
 * exchange server-side, and the backend gets a signed token it can
 * verify on its own.
 */
async function googleIdToken(): Promise<string> {
    const clientId = Platform.OS === 'ios' ? cfg('googleIosClientId') : cfg('googleAndroidClientId');
    if (!clientId) throw new Error('Google sign-in is not configured in this build.');

    // Google's iOS and Android OAuth clients only accept a redirect built
    // from the REVERSED client id — "com.googleusercontent.apps.<id>" —
    // not an app scheme of our choosing. Using treyomobile:// here returns
    // redirect_uri_mismatch. That reversed value must also be registered
    // as a URL scheme of the app (see app.json "scheme").
    const redirectUri = AuthSession.makeRedirectUri({
        scheme: reversedClientId(clientId),
        path: 'oauthredirect',
    });
    const discovery = await AuthSession.fetchDiscoveryAsync('https://accounts.google.com');

    const request = new AuthSession.AuthRequest({
        clientId,
        redirectUri,
        scopes: ['openid', 'profile', 'email'],
        responseType: AuthSession.ResponseType.IdToken,
        // Google requires a nonce for the id_token response type; the
        // library generates and checks one when asked.
        extraParams: { nonce: await nonce() },
    });

    const result = await request.promptAsync(discovery);
    if (result.type !== 'success') {
        throw new Error('CANCELLED');
    }
    const idToken = result.params?.id_token;
    if (!idToken) throw new Error('Google did not return an identity token.');
    return idToken;
}

/**
 * LinkedIn, via authorization code + PKCE. LinkedIn does not issue an
 * id_token to public clients, so the backend receives the access token
 * and asks LinkedIn's userinfo endpoint who it belongs to.
 */
async function linkedinAccessToken(): Promise<string> {
    const clientId = cfg('linkedinClientId');
    if (!clientId) throw new Error('LinkedIn sign-in is not configured in this build.');

    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'treyomobile' });
    const discovery = {
        authorizationEndpoint: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenEndpoint: 'https://www.linkedin.com/oauth/v2/accessToken',
    };

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
    if (!token.accessToken) throw new Error('LinkedIn did not return an access token.');
    return token.accessToken;
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

async function nonce(): Promise<string> {
    const Crypto = await import('expo-crypto');
    const bytes = await Crypto.getRandomBytesAsync(16);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
