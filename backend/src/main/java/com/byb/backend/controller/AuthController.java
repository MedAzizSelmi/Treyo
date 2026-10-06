package com.byb.backend.controller;

import com.byb.backend.dto.auth.*;
import com.byb.backend.service.AuthService;
import com.byb.backend.service.SocialIdentityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Tag(name = "Authentication", description = "Authentication endpoints")
public class AuthController {

    private final AuthService authService;
    private final SocialIdentityService socialIdentityService;

    @PostMapping("/register/student")
    @Operation(summary = "Register a new student")
    public ResponseEntity<AuthResponse> registerStudent(@Valid @RequestBody RegisterStudentRequest request) {
        AuthResponse response = authService.registerStudent(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/register/trainer")
    @Operation(summary = "Register a new trainer")
    public ResponseEntity<AuthResponse> registerTrainer(@Valid @RequestBody RegisterTrainerRequest request) {
        AuthResponse response = authService.registerTrainer(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/login")
    @Operation(summary = "Login (student/trainer/admin)")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    /**
     * Sign in with Google, Apple or LinkedIn.
     *
     * Body: { "token": "...", "userType": "STUDENT" | "TRAINER" }
     *
     * `token` is the provider's own token — an ID token for Google and
     * Apple, an access token for LinkedIn. It is verified against the
     * provider before anything else happens, so a forged body gets
     * nowhere. `userType` is only read when the account does not exist
     * yet; an existing learner does not become a trainer by signing in
     * from a different screen.
     *
     * Public, like /login: the caller has no Treyo credentials yet.
     */
    @PostMapping("/social/{provider}")
    @Operation(summary = "Login or sign up with Google, Apple or LinkedIn")
    public ResponseEntity<?> socialLogin(
            @PathVariable String provider,
            @RequestBody Map<String, String> body) {
        String token = body == null ? null : body.get("token");
        String userType = body == null ? null : body.get("userType");
        try {
            var identity = socialIdentityService.verify(
                    provider.toLowerCase(), token);
            return ResponseEntity.ok(authService.socialLogin(identity, userType));
        } catch (SocialIdentityService.SocialAuthException e) {
            return ResponseEntity.status(401).body(Map.of(
                    "error", "Sign-in failed",
                    "message", e.getMessage()));
        }
    }

    /**
     * Exchange a refresh token for a new access token.
     *
     * Access tokens last one hour; without this endpoint a user would be
     * signed out every hour with no way back in short of re-entering their
     * password. The client calls this transparently when a request comes
     * back 401.
     */
    @PostMapping("/refresh")
    @Operation(summary = "Exchange a refresh token for a new access token")
    public ResponseEntity<AuthResponse> refresh(@RequestBody Map<String, String> body) {
        String refreshToken = body == null ? null : body.get("refreshToken");
        AuthResponse response = authService.refreshAccessToken(refreshToken);
        return ResponseEntity.ok(response);
    }

    // ── Email verification ───────────────────────────────────────────────

    @PostMapping("/verify-email")
    @Operation(summary = "Verify an email address via the emailed token")
    public ResponseEntity<?> verifyEmail(@RequestBody Map<String, String> body) {
        String token = body.get("token");
        if (token == null || token.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Token is required"));
        }
        try {
            authService.verifyEmail(token);
            return ResponseEntity.ok(Map.of("status", "verified"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/resend-verification")
    @Operation(summary = "Resend the email-verification link")
    public ResponseEntity<?> resendVerification(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        }
        // Always return ok — the service silently no-ops for unknown
        // emails so this endpoint can't be used to enumerate accounts.
        authService.resendVerification(email.trim().toLowerCase());
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    // ── Password reset ──────────────────────────────────────────────────

    @PostMapping("/forgot-password")
    @Operation(summary = "Trigger a password-reset email")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        }
        // Same silent-on-unknown behaviour as resend-verification — keeps
        // the endpoint from being a user-enumeration oracle. Response is
        // identical whether the email matched or not.
        authService.forgotPassword(email.trim().toLowerCase());
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @PostMapping("/reset-password")
    @Operation(summary = "Complete a password reset using the emailed token")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> body) {
        String token = body.get("token");
        String newPassword = body.get("newPassword");
        if (token == null || token.isBlank() || newPassword == null || newPassword.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Token and newPassword are required"));
        }
        try {
            authService.resetPassword(token, newPassword);
            return ResponseEntity.ok(Map.of("status", "reset"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}