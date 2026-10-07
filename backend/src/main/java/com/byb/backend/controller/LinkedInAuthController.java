package com.byb.backend.controller;

import com.byb.backend.dto.auth.AuthResponse;
import com.byb.backend.service.AuthService;
import com.byb.backend.service.SocialIdentityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * "Sign in with LinkedIn", run on the server rather than on the device.
 *
 * ── Why not on the device, the way Google is ─────────────────────────
 * LinkedIn refuses custom-scheme redirect URLs, so the return has to land
 * on an https address; and its token exchange requires the client secret,
 * which a mobile app cannot keep — anything shipped inside a bundle can
 * be read out of it. So the browser talks to us, we talk to LinkedIn, and
 * the app only ever handles credentials we issued ourselves.
 *
 *   app → /api/auth/linkedin/start → LinkedIn → /callback (https)
 *       → treyomobile://auth?code=… → /exchange → Treyo tokens
 *
 * ── Why the last hop carries a one-time code, not the tokens ─────────
 * That final redirect uses a custom scheme, and on Android any installed
 * app may claim one. Putting the access and refresh tokens in the URL
 * would hand them to whatever app answered. The URL carries a single-use
 * reference instead, valid for two minutes, which only a call to this API
 * can turn into tokens.
 *
 * The two maps below are per-instance, which suits a single backend; a
 * second instance would need them in Redis or the database, since a user
 * could start on one node and return on the other.
 */
@RestController
@RequestMapping("/api/auth/linkedin")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Authentication", description = "Sign in with LinkedIn")
public class LinkedInAuthController {

    private final AuthService authService;
    private final SocialIdentityService socialIdentityService;
    private final WebClient.Builder webClientBuilder;

    private static final String AUTHORIZE = "https://www.linkedin.com/oauth/v2/authorization";
    private static final String TOKEN = "https://www.linkedin.com/oauth/v2/accessToken";
    private static final String APP_RETURN = "treyomobile://auth";
    private static final Duration TIMEOUT = Duration.ofSeconds(20);

    /** Long enough for someone to find their LinkedIn password. */
    private static final Duration STATE_TTL = Duration.ofMinutes(10);

    /** The app redeems this the moment the browser closes. */
    private static final Duration CODE_TTL = Duration.ofMinutes(2);

    @Value("${social.linkedin.client-id:}")
    private String clientId;

    @Value("${social.linkedin.client-secret:}")
    private String clientSecret;

    /**
     * Must match one of the "Authorized redirect URLs" registered in the
     * LinkedIn app, character for character — the tunnel address while
     * developing, the real domain in production.
     */
    @Value("${social.linkedin.redirect-uri:}")
    private String redirectUri;

    /** state → the role to give the account if this sign-in creates one. */
    private final Map<String, Started> started = new ConcurrentHashMap<>();

    /** one-time code → the tokens it stands for. */
    private final Map<String, Issued> issued = new ConcurrentHashMap<>();

    private record Started(String userType, Instant expiresAt) {}

    private record Issued(AuthResponse auth, Instant expiresAt) {}

    @GetMapping("/start")
    @Operation(summary = "Begin LinkedIn sign-in; the app opens this in a browser")
    public ResponseEntity<Void> start(@RequestParam(defaultValue = "STUDENT") String userType) {
        if (notConfigured()) {
            return redirect(APP_RETURN + "?error=" + enc("Sign in with LinkedIn is not configured on this server."));
        }
        sweep();

        String state = UUID.randomUUID().toString();
        started.put(state, new Started(normaliseUserType(userType), Instant.now().plus(STATE_TTL)));

        String url = UriComponentsBuilder.fromUriString(AUTHORIZE)
                .queryParam("response_type", "code")
                .queryParam("client_id", enc(clientId))
                .queryParam("redirect_uri", enc(redirectUri))
                .queryParam("state", enc(state))
                .queryParam("scope", enc("openid profile email"))
                .build(true)
                .toUriString();
        return redirect(url);
    }

    @GetMapping("/callback")
    @Operation(summary = "Where LinkedIn returns; redeems the code and hands the app a one-time reference")
    public ResponseEntity<Void> callback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error,
            @RequestParam(name = "error_description", required = false) String errorDescription) {

        sweep();

        if (error != null) {
            // The person declined, or LinkedIn refused. Not an incident.
            log.info("LinkedIn sign-in returned error={} description={}", error, errorDescription);
            return redirect(APP_RETURN + "?error=" + enc("LinkedIn did not complete the sign-in."));
        }

        Started origin = state == null ? null : started.remove(state);
        if (code == null || origin == null) {
            // No matching state means this callback was not one we started,
            // or it arrived far too late to still be trusted.
            log.warn("LinkedIn callback without a matching state");
            return redirect(APP_RETURN + "?error=" + enc("This sign-in link has expired. Please try again."));
        }

        try {
            String accessToken = exchangeWithLinkedIn(code);

            // Identity comes from LinkedIn's userinfo endpoint, through the
            // same verifier the other providers use — never from anything
            // the client told us.
            SocialIdentityService.SocialIdentity identity =
                    socialIdentityService.verify("linkedin", accessToken);
            AuthResponse auth = authService.socialLogin(identity, origin.userType());

            String handover = UUID.randomUUID().toString();
            issued.put(handover, new Issued(auth, Instant.now().plus(CODE_TTL)));
            return redirect(APP_RETURN + "?code=" + enc(handover));

        } catch (SocialIdentityService.SocialAuthException e) {
            // Safe to show: these messages are about the account, not about
            // our internals ("no verified email address", and so on).
            log.warn("LinkedIn identity rejected: {}", e.getMessage());
            return redirect(APP_RETURN + "?error=" + enc(e.getMessage()));

        } catch (RuntimeException e) {
            // The account rules raise these — a trainer still awaiting
            // approval, a rejected or disabled account. The app shows the
            // message and routes accordingly.
            log.warn("LinkedIn sign-in failed: {}", e.getMessage());
            String message = e.getMessage() == null ? "Sign-in failed. Please try again." : e.getMessage();
            return redirect(APP_RETURN + "?error=" + enc(message));
        }
    }

    @PostMapping("/exchange")
    @Operation(summary = "Exchange the one-time reference for this account's tokens")
    public ResponseEntity<?> exchange(@RequestBody(required = false) Map<String, String> body) {
        sweep();
        String code = body == null ? null : body.get("code");
        Issued redeemed = code == null ? null : issued.remove(code);
        if (redeemed == null || redeemed.expiresAt().isBefore(Instant.now())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                    "error", "Expired",
                    "message", "This sign-in reference is no longer valid. Please sign in again."));
        }
        return ResponseEntity.ok(redeemed.auth());
    }

    // ── LinkedIn's token endpoint ───────────────────────────────────

    @SuppressWarnings("unchecked")
    private String exchangeWithLinkedIn(String code) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("code", code);
        form.add("redirect_uri", redirectUri);
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);

        Map<String, Object> token = webClientBuilder.build()
                .post().uri(TOKEN)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(BodyInserters.fromFormData(form))
                .retrieve().bodyToMono(Map.class).block(TIMEOUT);

        Object accessToken = token == null ? null : token.get("access_token");
        if (accessToken == null) {
            // Deliberately not logged with the body: it would hold the code.
            throw new SocialIdentityService.SocialAuthException(
                    "LinkedIn did not return an access token.");
        }
        return String.valueOf(accessToken);
    }

    // ── helpers ─────────────────────────────────────────────────────

    private boolean notConfigured() {
        return isBlank(clientId) || isBlank(clientSecret) || isBlank(redirectUri);
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    /** Anything other than an explicit TRAINER signs in as a student. */
    private String normaliseUserType(String userType) {
        return "TRAINER".equalsIgnoreCase(userType) ? "TRAINER" : "STUDENT";
    }

    /** Drop what has timed out, so neither map grows without bound. */
    private void sweep() {
        Instant now = Instant.now();
        started.entrySet().removeIf(e -> e.getValue().expiresAt().isBefore(now));
        issued.entrySet().removeIf(e -> e.getValue().expiresAt().isBefore(now));
    }

    private ResponseEntity<Void> redirect(String url) {
        HttpHeaders headers = new HttpHeaders();
        headers.setLocation(URI.create(url));
        return new ResponseEntity<>(headers, HttpStatus.FOUND);
    }

    private String enc(String s) {
        return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8);
    }
}
