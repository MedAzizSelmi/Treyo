package com.byb.backend.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TOTP is only useful if it agrees, digit for digit, with whatever app
 * the user scanned the QR code into. There is no way to find out that it
 * does not except by a user failing to log in, so the published RFC 6238
 * vectors are pinned here.
 *
 * The RFC's SHA-1 vectors use the ASCII secret "12345678901234567890",
 * which is GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ in Base32. They are quoted
 * as 8 digits; this implementation emits the 6 that authenticator apps
 * use, so the expectations are the last six of each.
 */
class TotpServiceTest {

    private final TotpService totp = new TotpService();

    private static final String RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    /** The RFC tabulates times in seconds; TOTP counts 30-second steps. */
    private static long stepFor(long epochSeconds) {
        return epochSeconds / 30L;
    }

    @Test
    @DisplayName("matches the RFC 6238 SHA-1 test vectors")
    void matchesRfcVectors() {
        assertEquals("287082", totp.generate(RFC_SECRET, stepFor(59L)));
        assertEquals("081804", totp.generate(RFC_SECRET, stepFor(1111111109L)));
        assertEquals("050471", totp.generate(RFC_SECRET, stepFor(1111111111L)));
        assertEquals("005924", totp.generate(RFC_SECRET, stepFor(1234567890L)));
        assertEquals("279037", totp.generate(RFC_SECRET, stepFor(2000000000L)));
        assertEquals("353130", totp.generate(RFC_SECRET, stepFor(20000000000L)));
    }

    @Test
    @DisplayName("generated secrets are Base32 and usable")
    void secretsAreUsable() {
        String secret = totp.generateSecret();
        // 160 bits in 5-bit groups: 32 characters, no padding.
        assertEquals(32, secret.length());
        assertTrue(secret.matches("[A-Z2-7]+"), "not Base32: " + secret);
        assertTrue(totp.generate(secret, 1L).matches("\\d{6}"));
    }

    @Test
    @DisplayName("accepts the current code and rejects a wrong one")
    void verifiesCurrentCode() {
        String secret = totp.generateSecret();
        long now = System.currentTimeMillis() / 1000L / 30L;

        assertTrue(totp.verify(secret, totp.generate(secret, now)));
        assertFalse(totp.verify(secret, "000000".equals(totp.generate(secret, now))
                ? "111111" : "000000"));
    }

    @Test
    @DisplayName("tolerates one step of clock drift, but not two")
    void toleratesOneStepOfDrift() {
        String secret = totp.generateSecret();
        long now = System.currentTimeMillis() / 1000L / 30L;

        assertTrue(totp.verify(secret, totp.generate(secret, now - 1)),
                "a code that just rolled over should still work");
        assertTrue(totp.verify(secret, totp.generate(secret, now + 1)),
                "a slightly fast phone should still work");
        assertFalse(totp.verify(secret, totp.generate(secret, now - 5)),
                "a code from two and a half minutes ago must not work");
    }

    @Test
    @DisplayName("malformed input is refused, not thrown on")
    void refusesMalformedInput() {
        String secret = totp.generateSecret();
        assertFalse(totp.verify(secret, null));
        assertFalse(totp.verify(secret, ""));
        assertFalse(totp.verify(secret, "12345"));
        assertFalse(totp.verify(secret, "abcdef"));
        assertFalse(totp.verify(null, "123456"));
    }

    @Test
    @DisplayName("the otpauth URI carries what an authenticator app needs")
    void buildsOtpauthUri() {
        String uri = totp.otpauthUri("ABCDEFGHIJKLMNOP", "learner@example.com", "Treyo");
        assertTrue(uri.startsWith("otpauth://totp/Treyo:"));
        assertTrue(uri.contains("secret=ABCDEFGHIJKLMNOP"));
        assertTrue(uri.contains("issuer=Treyo"));
        assertTrue(uri.contains("digits=6"));
        assertTrue(uri.contains("period=30"));
        // The @ in an email address has to survive as %40, or the label
        // breaks the URI and the app refuses the QR code.
        assertTrue(uri.contains("learner%40example.com"), uri);
    }

    @Test
    @DisplayName("recovery codes are readable, and hash stably whatever the formatting")
    void recoveryCodesHashStably() {
        String code = totp.generateRecoveryCode();
        assertTrue(code.matches("[A-Z2-9]{4}-[A-Z2-9]{4}"), code);
        // Nothing in the alphabet that reads as something else.
        assertFalse(code.matches(".*[OIL01].*"), "ambiguous character in " + code);

        // Typed back in lower case, or without the dash, must still match.
        String expected = totp.hashRecoveryCode(code);
        assertEquals(expected, totp.hashRecoveryCode(code.toLowerCase()));
        assertEquals(expected, totp.hashRecoveryCode(code.replace("-", "")));
        assertEquals(expected, totp.hashRecoveryCode(" " + code + " "));
        assertNotEquals(expected, totp.hashRecoveryCode(totp.generateRecoveryCode()));
    }
}
