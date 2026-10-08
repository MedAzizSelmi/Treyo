package com.byb.backend.service;

import com.byb.backend.model.Student;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.StudentRepository;
import com.byb.backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Enrolling in, and checking, two-factor authentication.
 *
 * Learners and trainers live in separate tables with no shared parent,
 * which the rest of the codebase handles by branching on role. The same
 * is done here rather than introducing an inheritance hierarchy just for
 * three columns.
 *
 * Two rules shape the flow:
 *
 *   Setup is never trusted until proved. A secret is generated and
 *   stored, but twoFactorEnabled stays false until the user sends back
 *   a code their app produced. Otherwise someone who abandoned setup
 *   half way — scanned nothing, closed the screen — would be locked out
 *   of their own account at the next login.
 *
 *   Recovery codes are single use and disappear as they are spent. They
 *   exist for the lost-phone case, which is the most common way people
 *   lose an account to 2FA, and are the reason enabling it is safe to
 *   offer at all.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TwoFactorService {

    private static final String ISSUER = "Treyo";
    private static final int RECOVERY_CODE_COUNT = 10;

    private final StudentRepository studentRepository;
    private final TrainerRepository trainerRepository;
    private final TotpService totp;

    /** What setup hands the app: the secret, and the QR payload for it. */
    public record Enrolment(String secret, String otpauthUri) {}

    public boolean isEnabled(String email) {
        var student = studentRepository.findByEmail(email).orElse(null);
        if (student != null) return Boolean.TRUE.equals(student.getTwoFactorEnabled());
        var trainer = trainerRepository.findByEmail(email).orElse(null);
        return trainer != null && Boolean.TRUE.equals(trainer.getTwoFactorEnabled());
    }

    /**
     * Begin setup: mint a secret and store it, still disabled.
     *
     * Called again if the user restarts setup, which replaces the secret
     * — the half-finished one is worthless and leaving it would let an
     * older QR code they screenshotted keep working.
     */
    @Transactional
    public Enrolment beginSetup(String email) {
        if (isEnabled(email)) {
            throw new IllegalStateException("TWO_FACTOR_ALREADY_ENABLED");
        }
        String secret = totp.generateSecret();

        var student = studentRepository.findByEmail(email).orElse(null);
        if (student != null) {
            student.setTwoFactorSecret(secret);
            student.setTwoFactorEnabled(false);
            studentRepository.save(student);
        } else {
            Trainer trainer = trainerRepository.findByEmail(email)
                    .orElseThrow(() -> new IllegalArgumentException("ACCOUNT_NOT_FOUND"));
            trainer.setTwoFactorSecret(secret);
            trainer.setTwoFactorEnabled(false);
            trainerRepository.save(trainer);
        }

        return new Enrolment(secret, totp.otpauthUri(secret, email, ISSUER));
    }

    /**
     * Finish setup: the code proves the app holds the same secret.
     * Returns the recovery codes in plaintext — the only time they are
     * ever readable, since only their hashes are kept.
     */
    @Transactional
    public List<String> confirmSetup(String email, String code) {
        String secret = secretOf(email);
        if (secret == null) {
            throw new IllegalStateException("TWO_FACTOR_SETUP_NOT_STARTED");
        }
        if (!totp.verify(secret, code)) {
            throw new IllegalArgumentException("INVALID_CODE");
        }

        List<String> plain = new ArrayList<>(RECOVERY_CODE_COUNT);
        for (int i = 0; i < RECOVERY_CODE_COUNT; i++) {
            plain.add(totp.generateRecoveryCode());
        }
        String hashed = plain.stream()
                .map(totp::hashRecoveryCode)
                .collect(Collectors.joining(","));

        var student = studentRepository.findByEmail(email).orElse(null);
        if (student != null) {
            student.setTwoFactorEnabled(true);
            student.setTwoFactorRecoveryCodes(hashed);
            studentRepository.save(student);
        } else {
            Trainer trainer = trainerRepository.findByEmail(email)
                    .orElseThrow(() -> new IllegalArgumentException("ACCOUNT_NOT_FOUND"));
            trainer.setTwoFactorEnabled(true);
            trainer.setTwoFactorRecoveryCodes(hashed);
            trainerRepository.save(trainer);
        }

        log.info("Two-factor authentication enabled for {}", email);
        return plain;
    }

    /**
     * Check a code at login. Accepts either a TOTP code or one unused
     * recovery code, and spends the recovery code if that is what it was.
     */
    @Transactional
    public boolean verifyChallenge(String email, String code) {
        String secret = secretOf(email);
        if (secret == null) return false;
        if (totp.verify(secret, code)) return true;
        return spendRecoveryCode(email, code);
    }

    /**
     * Turn it off. The caller has already re-checked the password; a
     * current code is required too, so a stolen session alone cannot
     * strip the second factor off an account.
     */
    @Transactional
    public void disable(String email, String code) {
        if (!isEnabled(email)) {
            throw new IllegalStateException("TWO_FACTOR_NOT_ENABLED");
        }
        if (!verifyChallenge(email, code)) {
            throw new IllegalArgumentException("INVALID_CODE");
        }

        var student = studentRepository.findByEmail(email).orElse(null);
        if (student != null) {
            student.setTwoFactorEnabled(false);
            student.setTwoFactorSecret(null);
            student.setTwoFactorRecoveryCodes(null);
            studentRepository.save(student);
        } else {
            Trainer trainer = trainerRepository.findByEmail(email)
                    .orElseThrow(() -> new IllegalArgumentException("ACCOUNT_NOT_FOUND"));
            trainer.setTwoFactorEnabled(false);
            trainer.setTwoFactorSecret(null);
            trainer.setTwoFactorRecoveryCodes(null);
            trainerRepository.save(trainer);
        }
        log.info("Two-factor authentication disabled for {}", email);
    }

    /** How many recovery codes remain, for the settings screen. */
    public int remainingRecoveryCodes(String email) {
        String stored = recoveryCodesOf(email);
        if (stored == null || stored.isBlank()) return 0;
        return (int) Arrays.stream(stored.split(",")).filter(s -> !s.isBlank()).count();
    }

    // ── internals ───────────────────────────────────────────────────

    /**
     * Consume a recovery code if it matches an unused one.
     *
     * The matching hash is removed before returning, so the same code
     * cannot be replayed — that is what makes these safe to write down.
     */
    private boolean spendRecoveryCode(String email, String code) {
        String stored = recoveryCodesOf(email);
        if (stored == null || stored.isBlank()) return false;

        String candidate = totp.hashRecoveryCode(code);
        List<String> remaining = Arrays.stream(stored.split(","))
                .filter(s -> !s.isBlank())
                .collect(Collectors.toCollection(ArrayList::new));
        if (!remaining.remove(candidate)) return false;

        String left = String.join(",", remaining);
        var student = studentRepository.findByEmail(email).orElse(null);
        if (student != null) {
            student.setTwoFactorRecoveryCodes(left);
            studentRepository.save(student);
        } else {
            trainerRepository.findByEmail(email).ifPresent(t -> {
                t.setTwoFactorRecoveryCodes(left);
                trainerRepository.save(t);
            });
        }
        log.info("Recovery code used for {} — {} left", email, remaining.size());
        return true;
    }

    private String secretOf(String email) {
        var student = studentRepository.findByEmail(email).orElse(null);
        if (student != null) return student.getTwoFactorSecret();
        return trainerRepository.findByEmail(email)
                .map(Trainer::getTwoFactorSecret).orElse(null);
    }

    private String recoveryCodesOf(String email) {
        var student = studentRepository.findByEmail(email).orElse(null);
        if (student != null) return student.getTwoFactorRecoveryCodes();
        return trainerRepository.findByEmail(email)
                .map(Trainer::getTwoFactorRecoveryCodes).orElse(null);
    }
}
