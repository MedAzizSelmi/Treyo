package com.byb.backend.controller;

import com.byb.backend.dto.auth.ChangePasswordRequest;
import com.byb.backend.model.VerificationToken.Purpose;
import com.byb.backend.repository.StudentRepository;
import com.byb.backend.repository.TrainerRepository;
import com.byb.backend.security.AuthenticatedUser;
import com.byb.backend.service.AccountDeletionService;
import com.byb.backend.service.AuthService;
import com.byb.backend.service.ConfirmationCodeService;
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
 * Deletion is irreversible, so it asks for proof again rather than
 * trusting the token alone: a phone left unlocked for two minutes should
 * not be enough to erase someone's account. The proof is the password, or
 * a six-digit code emailed to the account's address. The code exists for
 * accounts created through Google or LinkedIn, which were given a random
 * password their owner never knew, and so could not be deleted from the
 * app at all. It serves anyone who has forgotten their password too.
 * Setting a password works the same way.
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
    private final ConfirmationCodeService confirmationCodeService;
    private final FileAccessService fileAccessService;
    private final StudentRepository studentRepository;
    private final TrainerRepository trainerRepository;
    private final PasswordEncoder passwordEncoder;

    /**
     * Change the password, proving it with the current one — or, for an
     * account that never had one it knows, with a PASSWORD_SET code.
     */
    @PostMapping("/change-password")
    @Operation(summary = "Change password for the currently authenticated user")
    public ResponseEntity<?> changePassword(
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

        boolean hasCode = request.getCode() != null && !request.getCode().isBlank();
        boolean hasPassword = request.getCurrentPassword() != null && !request.getCurrentPassword().isBlank();
        if (hasCode == hasPassword) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Confirmation required",
                    "message", "Enter your current password, or a code sent to your email."));
        }

        if (hasCode) {
            if (!confirmationCodeService.consume(email, Purpose.PASSWORD_SET, request.getCode())) {
                return wrongCode();
            }
            authService.setPasswordAfterCode(email, role, request.getNewPassword());
        } else {
            authService.changePassword(email, role, request.getCurrentPassword(), request.getNewPassword());
        }
        return ResponseEntity.ok(Map.of("message", "Password updated successfully"));
    }

    /**
     * Email a six-digit code that confirms one action.
     *
     * Body: {@code { "purpose": "delete-account" | "set-password" }}.
     * The code goes to the address on the account the caller is signed
     * into; the request names no address, so it cannot be pointed at
     * someone else's inbox.
     */
    @PostMapping("/confirmation-code")
    @Operation(summary = "Email a code confirming account deletion or a password change")
    public ResponseEntity<?> sendConfirmationCode(@RequestBody(required = false) Map<String, String> body) {
        AuthenticatedUser caller = fileAccessService.caller().orElse(null);
        if (caller == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Not signed in"));
        }
        if (caller.isAdmin()) {
            return ResponseEntity.status(403).body(Map.of(
                    "error", "Not available for administrators",
                    "message", "Administrators change their password from the dashboard."));
        }

        String requested = body == null ? null : body.get("purpose");
        Purpose purpose;
        if ("delete-account".equals(requested)) {
            purpose = Purpose.ACCOUNT_DELETE;
        } else if ("set-password".equals(requested)) {
            purpose = Purpose.PASSWORD_SET;
        } else {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Unknown purpose",
                    "message", "purpose must be delete-account or set-password."));
        }

        String email;
        String name;
        if (caller.isTrainer()) {
            var trainer = trainerRepository.findByTrainerId(caller.getUserId()).orElse(null);
            if (trainer == null) return ResponseEntity.status(404).body(Map.of("error", "Account not found"));
            email = trainer.getEmail();
            name = trainer.getName();
        } else {
            var student = studentRepository.findByStudentId(caller.getUserId()).orElse(null);
            if (student == null) return ResponseEntity.status(404).body(Map.of("error", "Account not found"));
            email = student.getEmail();
            name = student.getName();
        }

        try {
            confirmationCodeService.issue(email, name, purpose);
        } catch (ConfirmationCodeService.TooManyCodesException e) {
            return ResponseEntity.status(429).body(Map.of(
                    "error", "Too many codes",
                    "message", e.getMessage()));
        }
        return ResponseEntity.ok(Map.of(
                "status", "sent",
                "sentTo", ConfirmationCodeService.mask(email)));
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

    /**
     * Body: {@code { "password": "…" }} or {@code { "code": "123456" }},
     * the code from POST /confirmation-code with purpose delete-account.
     */
    @DeleteMapping
    @Operation(summary = "Delete the signed-in user's own account")
    public ResponseEntity<?> deleteOwnAccount(@RequestBody(required = false) Map<String, String> body) {
        var caller = fileAccessService.caller().orElse(null);
        if (caller == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Not signed in"));
        }
        String password = body == null ? null : body.get("password");
        String code = body == null ? null : body.get("code");
        boolean hasPassword = password != null && !password.isBlank();
        boolean hasCode = code != null && !code.isBlank();
        if (!hasPassword && !hasCode) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Confirmation required",
                    "message", "Confirm with your password, or a code sent to your email."));
        }

        if (caller.isAdmin()) {
            return ResponseEntity.status(403).body(Map.of(
                    "error", "Not available for administrators",
                    "message", "Ask another administrator to remove your account."));
        }

        if (caller.isTrainer()) {
            var trainer = trainerRepository.findByTrainerId(caller.getUserId()).orElse(null);
            if (trainer == null) return hasCode ? wrongCode() : wrongPassword();
            if (hasCode) {
                if (!confirmationCodeService.consume(trainer.getEmail(), Purpose.ACCOUNT_DELETE, code)) {
                    return wrongCode();
                }
            } else if (!passwordEncoder.matches(password, trainer.getPasswordHash())) {
                return wrongPassword();
            }
            accountDeletionService.deleteTrainer(trainer.getTrainerId());
        } else {
            var student = studentRepository.findByStudentId(caller.getUserId()).orElse(null);
            if (student == null) return hasCode ? wrongCode() : wrongPassword();
            if (hasCode) {
                if (!confirmationCodeService.consume(student.getEmail(), Purpose.ACCOUNT_DELETE, code)) {
                    return wrongCode();
                }
            } else if (!passwordEncoder.matches(password, student.getPasswordHash())) {
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

    private ResponseEntity<?> wrongCode() {
        // 403 for the same reason as wrongPassword. One message for wrong,
        // expired and used-up: the difference would only help a guesser.
        return ResponseEntity.status(403).body(Map.of(
                "error", "Incorrect code",
                "message", "That code is wrong or has expired. Ask for a new one."));
    }
}
