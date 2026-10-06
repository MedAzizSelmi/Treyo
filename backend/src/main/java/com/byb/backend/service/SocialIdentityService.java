package com.byb.backend.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Jwk;
import io.jsonwebtoken.security.Jwks;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.security.PublicKey;
import java.time.Duration;
import java.util.*;

/**
 * Turns a provider's token into a verified identity.
 *
 * ── The rule ────────────────────────────────────────────────────────
 * Everything here is verified against the provider's own signing keys,
 * server-side. The mobile app hands us a token and claims it belongs to
 * someone; believing that claim would let anyone sign in as anyone by
 * posting a handcrafted body. For Google and Apple that means checking
 * an RS256 signature, the issuer, the expiry and — critically — the
 * audience, so a token minted for somebody else's app is refused. For
 * LinkedIn it means calling their userinfo endpoint with the access
 * token and using what they return, never what the client says.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class SocialIdentityService {

    private final WebClient.Builder webClientBuilder;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    private static final Duration TIMEOUT = Duration.ofSeconds(15);
    private static final String APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
    private static final String APPLE_ISSUER = "https://appleid.apple.com";
    private static final String LINKEDIN_USERINFO = "https://api.linkedin.com/v2/userinfo";

    /**
     * Audiences accepted for a Google ID token: the web client id the
     * backend was configured with, plus the Android and iOS ones, since
     * each platform's SDK mints tokens for its own client.
     */
    @Value("${social.google.client-ids:}")
    private String googleClientIds;

    /** Bundle id / service id a token from Apple must be addressed to. */
    @Value("${social.apple.client-ids:}")
    private String appleClientIds;

    /** What a verified provider account tells us about the person. */
    public record SocialIdentity(String email, String name, String provider, String subject) {}

    public static class SocialAuthException extends RuntimeException {
        public SocialAuthException(String message) {
            super(message);
        }
    }

    public boolean isConfigured(String provider) {
        return switch (provider) {
            case "google" -> notBlank(googleClientIds);
            case "apple" -> notBlank(appleClientIds);
            // LinkedIn needs no local configuration: the access token is
            // presented to LinkedIn itself, which decides whether it is valid.
            case "linkedin" -> true;
            default -> false;
        };
    }

    public SocialIdentity verify(String provider, String token) {
        if (token == null || token.isBlank()) {
            throw new SocialAuthException("No token supplied.");
        }
        if (!isConfigured(provider)) {
            throw new SocialAuthException(
                    "Sign in with " + provider + " is not configured on this server.");
        }
        return switch (provider) {
            case "google" -> verifyGoogle(token);
            case "apple" -> verifyApple(token);
            case "linkedin" -> verifyLinkedIn(token);
            default -> throw new SocialAuthException("Unknown provider: " + provider);
        };
    }

    // ── Google ──────────────────────────────────────────────────────

    private SocialIdentity verifyGoogle(String idToken) {
        try {
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(
                    new NetHttpTransport(), GsonFactory.getDefaultInstance())
                    .setAudience(split(googleClientIds))
                    .build();

            GoogleIdToken parsed = verifier.verify(idToken);
            if (parsed == null) {
                // Covers a bad signature, a wrong audience and an expired
                // token alike — the library does not distinguish, and
                // neither should the message we hand back.
                throw new SocialAuthException("Google rejected this sign-in.");
            }
            GoogleIdToken.Payload payload = parsed.getPayload();
            if (!Boolean.TRUE.equals(payload.getEmailVerified())) {
                throw new SocialAuthException("This Google account has no verified email address.");
            }
            return new SocialIdentity(
                    payload.getEmail().toLowerCase(),
                    (String) payload.get("name"),
                    "google",
                    payload.getSubject());
        } catch (SocialAuthException e) {
            throw e;
        } catch (Exception e) {
            log.error("Google token verification failed: {}", e.getMessage());
            throw new SocialAuthException("Could not verify this Google sign-in.");
        }
    }

    // ── Apple ───────────────────────────────────────────────────────

    private SocialIdentity verifyApple(String identityToken) {
        try {
            String kid = unverifiedHeaderKid(identityToken);
            PublicKey key = applePublicKey(kid);

            Jws<Claims> jws = Jwts.parser()
                    .verifyWith(key)
                    .requireIssuer(APPLE_ISSUER)
                    .build()
                    .parseSignedClaims(identityToken);

            Claims claims = jws.getPayload();
            if (!split(appleClientIds).contains(claims.getAudience() == null
                    ? "" : claims.getAudience().iterator().next())) {
                throw new SocialAuthException("This Apple token was issued for another app.");
            }
            String email = claims.get("email", String.class);
            if (email == null) {
                // Apple only returns the address on the very first
                // authorisation; afterwards the app must send the one it
                // stored. Without it we cannot match an account.
                throw new SocialAuthException("Apple did not return an email address.");
            }
            return new SocialIdentity(email.toLowerCase(), null, "apple", claims.getSubject());
        } catch (SocialAuthException e) {
            throw e;
        } catch (Exception e) {
            log.error("Apple token verification failed: {}", e.getMessage());
            throw new SocialAuthException("Could not verify this Apple sign-in.");
        }
    }

    /** The key id from the token header, read before any verification. */
    private String unverifiedHeaderKid(String jwt) {
        String[] parts = jwt.split("\\.");
        if (parts.length < 2) throw new SocialAuthException("Malformed token.");
        String header = new String(Base64.getUrlDecoder().decode(parts[0]));
        int i = header.indexOf("\"kid\"");
        if (i < 0) throw new SocialAuthException("Token has no key id.");
        int start = header.indexOf('"', header.indexOf(':', i)) + 1;
        int end = header.indexOf('"', start);
        return header.substring(start, end);
    }

    /** Apple's published signing keys, matched on the token's key id. */
    @SuppressWarnings("unchecked")
    private PublicKey applePublicKey(String kid) {
        Map<String, Object> jwks = webClientBuilder.build()
                .get().uri(APPLE_KEYS_URL)
                .retrieve().bodyToMono(Map.class).block(TIMEOUT);
        if (jwks == null) throw new SocialAuthException("Apple's keys are unavailable.");

        List<Map<String, Object>> keys = (List<Map<String, Object>>) jwks.get("keys");
        for (Map<String, Object> k : keys == null ? List.<Map<String, Object>>of() : keys) {
            if (kid.equals(k.get("kid"))) {
                try {
                    // jjwt parses a JWK from its JSON text, so the entry is
                    // serialised back rather than hand-decoded from n/e.
                    Jwk<?> jwk = Jwks.parser().build().parse(objectMapper.writeValueAsString(k));
                    return (PublicKey) jwk.toKey();
                } catch (Exception e) {
                    throw new SocialAuthException("Apple signing key could not be read.");
                }
            }
        }
        throw new SocialAuthException("Apple signing key not found.");
    }

    // ── LinkedIn ────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private SocialIdentity verifyLinkedIn(String accessToken) {
        try {
            Map<String, Object> me = webClientBuilder.build()
                    .get().uri(LINKEDIN_USERINFO)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                    .retrieve().bodyToMono(Map.class).block(TIMEOUT);
            if (me == null || me.get("email") == null) {
                throw new SocialAuthException("LinkedIn did not return an email address.");
            }
            if (Boolean.FALSE.equals(me.get("email_verified"))) {
                throw new SocialAuthException("This LinkedIn email address is not verified.");
            }
            return new SocialIdentity(
                    String.valueOf(me.get("email")).toLowerCase(),
                    me.get("name") == null ? null : String.valueOf(me.get("name")),
                    "linkedin",
                    me.get("sub") == null ? null : String.valueOf(me.get("sub")));
        } catch (SocialAuthException e) {
            throw e;
        } catch (Exception e) {
            log.error("LinkedIn verification failed: {}", e.getMessage());
            throw new SocialAuthException("Could not verify this LinkedIn sign-in.");
        }
    }

    // ── helpers ─────────────────────────────────────────────────────

    private List<String> split(String csv) {
        if (!notBlank(csv)) return List.of();
        return Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    private boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
