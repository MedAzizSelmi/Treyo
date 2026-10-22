package com.byb.backend.service;

import com.byb.backend.model.VerificationToken;
import com.byb.backend.model.VerificationToken.Purpose;
import com.byb.backend.repository.VerificationTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * Six-digit codes, emailed to a signed-in user, that stand in for their
 * password on the actions that ask for one: deleting the account and
 * setting a password.
 *
 * Why this exists: an account created through Google or LinkedIn is given
 * a random password nobody knows (AuthService.socialLogin). Its owner
 * could sign in, but could not delete the account or set a password from
 * the app, because both asked for the current password. A code sent to
 * the account's address proves the same thing the password does — that
 * this is the person, not just someone holding an unlocked phone — and
 * it works for every way of signing in, including a forgotten password.
 *
 * The rules:
 * <ul>
 *   <li>Only the newest code for an account and purpose is accepted;
 *       asking again cancels the previous one.</li>
 *   <li>A code lasts {@value #TTL_MINUTES} minutes and is spent on use.</li>
 *   <li>{@value #MAX_ATTEMPTS} wrong guesses spend it too. Six digits are
 *       a million possibilities, so the attempt limit — not the length —
 *       is what makes guessing hopeless.</li>
 *   <li>At most {@value #MAX_CODES_PER_HOUR} codes per account and purpose
 *       an hour. The per-IP limit in RateLimitFilter can be sidestepped;
 *       this one is counted in the database, against the account.</li>
 *   <li>The database holds a digest of the code, salted with the row id,
 *       not the code.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ConfirmationCodeService {

    static final int TTL_MINUTES = 15;
    static final int MAX_ATTEMPTS = 5;
    static final int MAX_CODES_PER_HOUR = 5;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final VerificationTokenRepository tokenRepository;
    private final EmailService emailService;

    /** Too many codes asked for recently. The controller answers 429. */
    public static class TooManyCodesException extends RuntimeException {
        public TooManyCodesException() {
            super("Too many codes requested. Please wait a while and try again.");
        }
    }

    /**
     * Email a fresh code for {@code purpose} to {@code email}, cancelling
     * any earlier one.
     */
    @Transactional
    public void issue(String email, String name, Purpose purpose) {
        LocalDateTime now = LocalDateTime.now();
        long recent = tokenRepository.countByEmailAndPurposeAndCreatedAtAfter(
                email, purpose, now.minusHours(1));
        if (recent >= MAX_CODES_PER_HOUR) {
            throw new TooManyCodesException();
        }

        List<VerificationToken> open = tokenRepository.findByEmailAndPurposeAndUsedFalse(email, purpose);
        open.forEach(t -> spend(t, now));
        tokenRepository.saveAll(open);

        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        VerificationToken token = new VerificationToken();
        token.setTokenId("VTK_" + UUID.randomUUID().toString().substring(0, 12).toUpperCase());
        token.setToken(digest(token.getTokenId(), code));
        token.setEmail(email);
        token.setPurpose(purpose);
        token.setExpiresAt(now.plusMinutes(TTL_MINUTES));
        token.setUsed(false);
        token.setAttempts(0);
        tokenRepository.save(token);

        emailService.sendConfirmationCodeEmail(email, name, code, purpose, TTL_MINUTES);
        log.info("Confirmation code ({}) issued for {}", purpose, email);
    }

    /**
     * Check a code and spend it if it is right.
     *
     * Commits on its own: a wrong guess must be counted even though the
     * caller goes on to refuse the request.
     *
     * @return true only for the newest, unexpired, unspent code
     */
    @Transactional
    public boolean consume(String email, Purpose purpose, String code) {
        if (code == null) return false;
        String trimmed = code.trim();
        // A malformed entry is a typo, not a guess; don't charge for it.
        if (!trimmed.matches("\\d{6}")) return false;

        LocalDateTime now = LocalDateTime.now();
        VerificationToken token = tokenRepository
                .findFirstByEmailAndPurposeAndUsedFalseOrderByCreatedAtDesc(email, purpose)
                .orElse(null);
        if (token == null || token.getExpiresAt().isBefore(now)) return false;

        boolean matches = MessageDigest.isEqual(
                digest(token.getTokenId(), trimmed).getBytes(StandardCharsets.US_ASCII),
                token.getToken().getBytes(StandardCharsets.US_ASCII));
        if (!matches) {
            int attempts = (token.getAttempts() == null ? 0 : token.getAttempts()) + 1;
            token.setAttempts(attempts);
            if (attempts >= MAX_ATTEMPTS) {
                spend(token, now);
                log.warn("Confirmation code ({}) for {} spent after {} wrong attempts",
                        purpose, email, attempts);
            }
            tokenRepository.save(token);
            return false;
        }

        spend(token, now);
        tokenRepository.save(token);
        return true;
    }

    /** "a•••@gmail.com" — enough for the user to recognise their address. */
    public static String mask(String email) {
        int at = email == null ? -1 : email.indexOf('@');
        if (at <= 0) return "your email address";
        return email.charAt(0) + "•••" + email.substring(at);
    }

    private static void spend(VerificationToken token, LocalDateTime now) {
        token.setUsed(true);
        token.setUsedAt(now);
    }

    /**
     * Salted with the row id so equal codes give different digests: the
     * token column is unique, and two accounts will draw the same six
     * digits sooner or later. Prefixed so a digest can never be mistaken
     * for a link token in findByToken.
     */
    static String digest(String tokenId, String code) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            byte[] hash = sha.digest((tokenId + ":" + code).getBytes(StandardCharsets.UTF_8));
            return "code:" + HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
