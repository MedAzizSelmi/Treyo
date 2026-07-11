package com.byb.backend.controller;

import com.byb.backend.dto.auth.*;
import com.byb.backend.service.AuthService;
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