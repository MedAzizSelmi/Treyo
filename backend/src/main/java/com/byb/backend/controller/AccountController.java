package com.byb.backend.controller;

import com.byb.backend.dto.auth.ChangePasswordRequest;
import com.byb.backend.repository.StudentRepository;
import com.byb.backend.repository.TrainerRepository;
import com.byb.backend.service.AccountDeletionService;
import com.byb.backend.service.AuthService;
import com.byb.backend.service.FileAccessService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * The account's owner acting on their own account.
 *
 * Deletion is irreversible, so it asks for the password again rather
 * than trusting the token alone: a phone left unlocked for two minutes
 * should not be enough to erase someone's account.
 *
 * Administrators are deliberately not covered. An admin who could delete
 * themselves could leave the platform with no administrator at all;
 * removing one is another admin's job, from the dashboard.
 */
@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Account", description = "Self-service account management")
@SecurityRequirement(name = "bearerAuth")
public class AccountController {

    private final AuthService authService;
    private final AccountDeletionService accountDeletionService;
    private final FileAccessService fileAccessService;
    private final StudentRepository studentRepository;
    private final TrainerRepository trainerRepository;
    private final PasswordEncoder passwordEncoder;

    @PostMapping("/change-password")
    @Operation(summary = "Change password for the currently authenticated user")
    public ResponseEntity<Map<String, String>> changePassword(
            Authentication authentication,
            @Valid @RequestBody ChangePasswordRequest request
    ) {
        String email = authentication.getName();
        // JwtAuthenticationFilter puts the token's role in as ROLE_<X>;
        // strip the prefix so the service can match on STUDENT/TRAINER/ADMIN.
        String role = authentication.getAuthorities().stream()
                .map(a -> a.getAuthority())
                .filter(a -> a != null && a.startsWith("ROLE_"))
                .map(a -> a.substring("ROLE_".length()))
                .findFirst()
                .orElse(null);
        authService.changePassword(email, role, request.getCurrentPassword(), request.getNewPassword());
        return ResponseEntity.ok(Map.of("message", "Password updated successfully"));
    }

    /**
     * End every session on this account, including the current one.
     *
     * The remedy that did not exist: refresh tokens live 30 days and
     * nothing could be taken back, so a stolen phone stayed signed in for
     * a month and changing the password did not help.
     *
     * No password is asked for, deliberately. This only ever reduces
     * access — someone who has hold of a session gains nothing by
     * triggering it, since it signs them out too — and the moment a
     * person reaches for it is the moment they are least able to recall
     * a password calmly.
     *
     * Access tokens are not re-checked per request, so another device may
     * keep reading for up to the access token's lifetime (an hour) before
     * its refresh is refused. The app says so rather than implying the
     * cut is instant.
     */
    @PostMapping("/sign-out-everywhere")
    @Operation(summary = "Invalidate every token issued for this account")
    public ResponseEntity<?> signOutEverywhere(Authentication authentication) {
        String email = authentication.getName();
        authService.revokeAllSessions(email);
        return ResponseEntity.ok(Map.of(
                "status", "revoked",
                "message", "All devices have been signed out."));
    }

    @DeleteMapping
    @Operation(summary = "Delete the signed-in user's own account")
    public ResponseEntity<?> deleteOwnAccount(@RequestBody Map<String, String> body) {
        var caller = fileAccessService.caller().orElse(null);
        if (caller == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Not signed in"));
        }
        String password = body == null ? null : body.get("password");
        if (password == null || password.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Password required",
                    "message", "Confirm your password to delete your account."));
        }

        if (caller.isAdmin()) {
            return ResponseEntity.status(403).body(Map.of(
                    "error", "Not available for administrators",
                    "message", "Ask another administrator to remove your account."));
        }

        if (caller.isTrainer()) {
            var trainer = trainerRepository.findByTrainerId(caller.getUserId()).orElse(null);
            if (trainer == null || !passwordEncoder.matches(password, trainer.getPasswordHash())) {
                return wrongPassword();
            }
            accountDeletionService.deleteTrainer(trainer.getTrainerId());
        } else {
            var student = studentRepository.findByStudentId(caller.getUserId()).orElse(null);
            if (student == null || !passwordEncoder.matches(password, student.getPasswordHash())) {
                return wrongPassword();
            }
            accountDeletionService.deleteStudent(student.getStudentId());
        }

        return ResponseEntity.ok(Map.of(
                "status", "deleted",
                "message", "Your account has been deleted."));
    }

    private ResponseEntity<?> wrongPassword() {
        // 403 rather than 401: the token is valid, the confirmation is not.
        // A 401 would make the client's interceptor sign the user out and
        // hide the reason.
        return ResponseEntity.status(403).body(Map.of(
                "error", "Incorrect password",
                "message", "That password doesn't match this account."));
    }
}
