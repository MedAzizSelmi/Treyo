package com.byb.backend.controller;

import com.byb.backend.repository.StudentRepository;
import com.byb.backend.repository.TrainerRepository;
import com.byb.backend.service.TwoFactorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Enrolling in and cancelling two-factor authentication, by the account
 * holder, for their own account.
 *
 * Setup is two calls on purpose. The first hands back a secret and the
 * QR payload for it; the second takes a code and only then switches 2FA
 * on. Enabling in one step would lock out anyone whose scan failed, who
 * closed the screen, or who typed the key in wrong — they would be
 * holding a factor they cannot produce.
 */
@RestController
@RequestMapping("/api/account/2fa")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Account", description = "Two-factor authentication")
@SecurityRequirement(name = "bearerAuth")
public class TwoFactorController {

    private final TwoFactorService twoFactorService;
    private final StudentRepository studentRepository;
    private final TrainerRepository trainerRepository;
    private final PasswordEncoder passwordEncoder;

    @GetMapping("/status")
    @Operation(summary = "Whether 2FA is on for the signed-in user")
    public ResponseEntity<?> status(Authentication authentication) {
        String email = authentication.getName();
        boolean enabled = twoFactorService.isEnabled(email);
        Map<String, Object> body = new HashMap<>();
        body.put("enabled", enabled);
        body.put("recoveryCodesRemaining",
                enabled ? twoFactorService.remainingRecoveryCodes(email) : 0);
        return ResponseEntity.ok(body);
    }

    @PostMapping("/setup")
    @Operation(summary = "Start setup: returns the secret and its otpauth URI")
    public ResponseEntity<?> setup(Authentication authentication) {
        try {
            var enrolment = twoFactorService.beginSetup(authentication.getName());
            // The secret goes out exactly once, here, so the app can show
            // it for manual entry when a QR code cannot be scanned. Once
            // 2FA is on it is never returned again.
            return ResponseEntity.ok(Map.of(
                    "secret", enrolment.secret(),
                    "otpauthUri", enrolment.otpauthUri()));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", e.getMessage(),
                    "message", "Two-factor authentication is already switched on."));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/enable")
    @Operation(summary = "Confirm setup with a code; returns the recovery codes")
    public ResponseEntity<?> enable(Authentication authentication,
                                    @RequestBody Map<String, String> body) {
        String code = body == null ? null : body.get("code");
        if (code == null || code.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "CODE_REQUIRED",
                    "message", "Enter the 6-digit code from your authenticator app."));
        }
        try {
            List<String> recoveryCodes =
                    twoFactorService.confirmSetup(authentication.getName(), code);
            // Shown once. Only hashes are kept, so there is no second
            // chance to read these and the app must make that clear.
            return ResponseEntity.ok(Map.of(
                    "enabled", true,
                    "recoveryCodes", recoveryCodes));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", e.getMessage(),
                    "message", "That code is not right. Check your app and try again."));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", e.getMessage(),
                    "message", "Start the setup again."));
        }
    }

    @PostMapping("/disable")
    @Operation(summary = "Turn 2FA off; needs the password and a current code")
    public ResponseEntity<?> disable(Authentication authentication,
                                     @RequestBody Map<String, String> body) {
        String email = authentication.getName();
        String password = body == null ? null : body.get("password");
        String code = body == null ? null : body.get("code");

        if (password == null || password.isBlank() || code == null || code.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "PASSWORD_AND_CODE_REQUIRED",
                    "message", "Enter your password and a current code to switch this off."));
        }

        // Both factors again, not just the session. Removing the second
        // factor is exactly what someone who stole a logged-in phone
        // would want to do first.
        if (!passwordMatches(email, password)) {
            return ResponseEntity.status(403).body(Map.of(
                    "error", "INVALID_PASSWORD",
                    "message", "That password doesn't match this account."));
        }

        try {
            twoFactorService.disable(email, code);
            return ResponseEntity.ok(Map.of(
                    "enabled", false,
                    "message", "Two-factor authentication is off."));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", e.getMessage(),
                    "message", "That code is not right."));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    private boolean passwordMatches(String email, String password) {
        var student = studentRepository.findByEmail(email).orElse(null);
        if (student != null) {
            return passwordEncoder.matches(password, student.getPasswordHash());
        }
        return trainerRepository.findByEmail(email)
                .map(t -> passwordEncoder.matches(password, t.getPasswordHash()))
                .orElse(false);
    }
}
