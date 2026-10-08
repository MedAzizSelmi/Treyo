package com.byb.backend.service;

import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;

/**
 * Time-based one-time passwords, RFC 6238.
 *
 * Written out rather than pulled from a library: the algorithm is a
 * HMAC and a modulo, the JDK already ships both, and the build runs
 * Maven offline. Base32 is here for the same reason — the JDK has
 * Base64 but not Base32, and authenticator apps only speak Base32.
 *
 * Interoperable with Google Authenticator, Authy, 1Password and the
 * rest: SHA-1, 6 digits, 30-second steps. Those are the defaults every
 * app assumes, and none of them are worth changing — SHA-1's weaknesses
 * are in collision resistance, which HMAC does not rely on.
 */
@Service
public class TotpService {

    private static final int DIGITS = 6;
    private static final int PERIOD_SECONDS = 30;
    private static final String HMAC = "HmacSHA1";

    /**
     * How many steps either side of now are accepted.
     *
     * One step tolerates the usual causes of a near miss: a phone clock
     * drifting by a few seconds, and the user typing a code that rolls
     * over mid-entry. It widens the guessing window from one code to
     * three, which against a six-digit space and rate limiting is a
     * trade every implementation makes.
     */
    private static final int WINDOW_STEPS = 1;

    private static final String BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private final SecureRandom random = new SecureRandom();

    /** A fresh 160-bit secret, Base32-encoded as the apps expect. */
    public String generateSecret() {
        byte[] bytes = new byte[20];
        random.nextBytes(bytes);
        return base32Encode(bytes);
    }

    /**
     * The otpauth:// URI an authenticator app reads from a QR code.
     * The label carries the issuer twice by convention — once as a
     * prefix, once as a parameter — because older apps read only one.
     */
    public String otpauthUri(String secret, String accountName, String issuer) {
        String label = enc(issuer) + ":" + enc(accountName);
        return "otpauth://totp/" + label
                + "?secret=" + secret
                + "&issuer=" + enc(issuer)
                + "&algorithm=SHA1"
                + "&digits=" + DIGITS
                + "&period=" + PERIOD_SECONDS;
    }

    /** True if `code` is valid for `secret` right now. */
    public boolean verify(String secret, String code) {
        if (secret == null || code == null) return false;
        String cleaned = code.replaceAll("[^0-9]", "");
        if (cleaned.length() != DIGITS) return false;

        long step = System.currentTimeMillis() / 1000L / PERIOD_SECONDS;
        for (int offset = -WINDOW_STEPS; offset <= WINDOW_STEPS; offset++) {
            if (constantTimeEquals(generate(secret, step + offset), cleaned)) {
                return true;
            }
        }
        return false;
    }

    /** The code for one time step. Package-private so tests can pin it. */
    String generate(String secret, long step) {
        try {
            byte[] key = base32Decode(secret);
            byte[] counter = new byte[8];
            for (int i = 7; i >= 0; i--) {
                counter[i] = (byte) (step & 0xff);
                step >>= 8;
            }

            Mac mac = Mac.getInstance(HMAC);
            mac.init(new SecretKeySpec(key, HMAC));
            byte[] hash = mac.doFinal(counter);

            // Dynamic truncation, RFC 4226 §5.3: the low nibble of the
            // last byte picks where to read four bytes from.
            int offset = hash[hash.length - 1] & 0x0f;
            int binary = ((hash[offset] & 0x7f) << 24)
                    | ((hash[offset + 1] & 0xff) << 16)
                    | ((hash[offset + 2] & 0xff) << 8)
                    | (hash[offset + 3] & 0xff);

            int otp = binary % (int) Math.pow(10, DIGITS);
            return String.format("%0" + DIGITS + "d", otp);
        } catch (Exception e) {
            throw new IllegalStateException("Could not generate a TOTP code", e);
        }
    }

    // ── recovery codes ──────────────────────────────────────────────

    /**
     * Ten single-use codes, shown once when 2FA is switched on.
     *
     * Formatted in two groups of four so they can be read off a screen
     * and typed without losing one's place. The alphabet omits the
     * characters people confuse — no O/0, no I/1/L.
     */
    public String generateRecoveryCode() {
        final String alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        StringBuilder sb = new StringBuilder(9);
        for (int i = 0; i < 8; i++) {
            if (i == 4) sb.append('-');
            sb.append(alphabet.charAt(random.nextInt(alphabet.length())));
        }
        return sb.toString();
    }

    /** Recovery codes are stored hashed; see the migration for why SHA-256. */
    public String hashRecoveryCode(String code) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] out = md.digest(normalise(code).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(out);
        } catch (Exception e) {
            throw new IllegalStateException("Could not hash a recovery code", e);
        }
    }

    /** Upper-case, punctuation stripped, so formatting never fails a match. */
    public String normalise(String code) {
        return code == null ? "" : code.toUpperCase().replaceAll("[^A-Z0-9]", "");
    }

    // ── Base32 (RFC 4648, no padding) ───────────────────────────────

    private String base32Encode(byte[] data) {
        StringBuilder sb = new StringBuilder();
        int buffer = 0, bitsLeft = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xff);
            bitsLeft += 8;
            while (bitsLeft >= 5) {
                sb.append(BASE32_ALPHABET.charAt((buffer >> (bitsLeft - 5)) & 0x1f));
                bitsLeft -= 5;
            }
        }
        if (bitsLeft > 0) {
            sb.append(BASE32_ALPHABET.charAt((buffer << (5 - bitsLeft)) & 0x1f));
        }
        return sb.toString();
    }

    private byte[] base32Decode(String encoded) {
        String clean = encoded.trim().replace("=", "").replace(" ", "").toUpperCase();
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        int buffer = 0, bitsLeft = 0;
        for (char c : clean.toCharArray()) {
            int value = BASE32_ALPHABET.indexOf(c);
            if (value < 0) throw new IllegalArgumentException("Not Base32: " + c);
            buffer = (buffer << 5) | value;
            bitsLeft += 5;
            if (bitsLeft >= 8) {
                out.write((buffer >> (bitsLeft - 8)) & 0xff);
                bitsLeft -= 8;
            }
        }
        return out.toByteArray();
    }

    // ── helpers ─────────────────────────────────────────────────────

    /**
     * Compared without an early exit, so the time taken does not reveal
     * how much of a guessed code was correct.
     */
    private boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null || a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) {
            diff |= a.charAt(i) ^ b.charAt(i);
        }
        return diff == 0;
    }

    private String enc(String s) {
        return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8);
    }
}
