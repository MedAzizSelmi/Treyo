package com.byb.backend.service;

import com.byb.backend.model.VerificationToken;
import com.byb.backend.model.VerificationToken.Purpose;
import com.byb.backend.repository.VerificationTokenRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * The rules that make a six-digit code safe to stand in for a password:
 * only the newest code works, it is spent on use, five wrong guesses
 * spend it, it expires, and an account can only ask for so many.
 */
class ConfirmationCodeServiceTest {

    private static final String EMAIL = "learner@example.test";

    private VerificationTokenRepository repo;
    private EmailService email;
    private ConfirmationCodeService service;

    /** The one code row this fake repository holds. */
    private VerificationToken stored;

    @BeforeEach
    void setUp() {
        repo = mock(VerificationTokenRepository.class);
        email = mock(EmailService.class);
        service = new ConfirmationCodeService(repo, email);

        when(repo.save(any())).thenAnswer(inv -> {
            stored = inv.getArgument(0);
            if (stored.getCreatedAt() == null) stored.setCreatedAt(LocalDateTime.now());
            return stored;
        });
        // Behaves like the real query: a spent code is never returned.
        when(repo.findFirstByEmailAndPurposeAndUsedFalseOrderByCreatedAtDesc(EMAIL, Purpose.ACCOUNT_DELETE))
                .thenAnswer(inv -> stored == null || stored.getUsed()
                        ? Optional.empty() : Optional.of(stored));
    }

    /** Issue a code and return what was emailed. */
    private String issue() {
        service.issue(EMAIL, "Learner", Purpose.ACCOUNT_DELETE);
        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(email, atLeastOnce()).sendConfirmationCodeEmail(
                eq(EMAIL), eq("Learner"), code.capture(), eq(Purpose.ACCOUNT_DELETE), anyInt());
        return code.getValue();
    }

    private static String wrong(String code) {
        return code.equals("000000") ? "111111" : "000000";
    }

    @Test
    void emailsSixDigitsAndStoresOnlyADigest() {
        String code = issue();
        assertTrue(code.matches("\\d{6}"));
        assertNotEquals(code, stored.getToken());
        assertFalse(stored.getToken().contains(code), "the code must not be stored in the clear");
        assertTrue(stored.getToken().startsWith("code:"));
        assertEquals(0, stored.getAttempts());
    }

    @Test
    void rightCodeIsAcceptedOnce() {
        String code = issue();
        assertTrue(service.consume(EMAIL, Purpose.ACCOUNT_DELETE, code));
        assertTrue(stored.getUsed());
        assertFalse(service.consume(EMAIL, Purpose.ACCOUNT_DELETE, code), "a code is single-use");
    }

    @Test
    void wrongGuessesAreCountedAndTheFifthSpendsTheCode() {
        String code = issue();
        for (int i = 1; i <= 4; i++) {
            assertFalse(service.consume(EMAIL, Purpose.ACCOUNT_DELETE, wrong(code)));
            assertEquals(i, stored.getAttempts());
            assertFalse(stored.getUsed());
        }
        assertFalse(service.consume(EMAIL, Purpose.ACCOUNT_DELETE, wrong(code)));
        assertTrue(stored.getUsed(), "five wrong guesses spend the code");
        assertFalse(service.consume(EMAIL, Purpose.ACCOUNT_DELETE, code),
                "the right code no longer works once it has been guessed at five times");
    }

    @Test
    void malformedEntryIsNotChargedAsAGuess() {
        issue();
        assertFalse(service.consume(EMAIL, Purpose.ACCOUNT_DELETE, "12 34"));
        assertFalse(service.consume(EMAIL, Purpose.ACCOUNT_DELETE, ""));
        assertFalse(service.consume(EMAIL, Purpose.ACCOUNT_DELETE, null));
        assertEquals(0, stored.getAttempts());
    }

    @Test
    void expiredCodeIsRefused() {
        String code = issue();
        stored.setExpiresAt(LocalDateTime.now().minusSeconds(1));
        assertFalse(service.consume(EMAIL, Purpose.ACCOUNT_DELETE, code));
    }

    @Test
    void codeIsBoundToItsPurpose() {
        String code = issue();
        when(repo.findFirstByEmailAndPurposeAndUsedFalseOrderByCreatedAtDesc(EMAIL, Purpose.PASSWORD_SET))
                .thenReturn(Optional.empty());
        assertFalse(service.consume(EMAIL, Purpose.PASSWORD_SET, code));
    }

    @Test
    void askingAgainCancelsTheEarlierCode() {
        VerificationToken earlier = new VerificationToken();
        earlier.setUsed(false);
        when(repo.findByEmailAndPurposeAndUsedFalse(EMAIL, Purpose.ACCOUNT_DELETE))
                .thenReturn(List.of(earlier));
        issue();
        assertTrue(earlier.getUsed());
        assertNotNull(earlier.getUsedAt());
    }

    @Test
    void anAccountCanOnlyAskForSoMany() {
        when(repo.countByEmailAndPurposeAndCreatedAtAfter(eq(EMAIL), eq(Purpose.ACCOUNT_DELETE), any()))
                .thenReturn((long) ConfirmationCodeService.MAX_CODES_PER_HOUR);
        assertThrows(ConfirmationCodeService.TooManyCodesException.class,
                () -> service.issue(EMAIL, "Learner", Purpose.ACCOUNT_DELETE));
        verifyNoInteractions(email);
    }

    @Test
    void equalCodesGiveDifferentDigestsPerRow() {
        assertNotEquals(ConfirmationCodeService.digest("VTK_A", "123456"),
                ConfirmationCodeService.digest("VTK_B", "123456"));
    }

    @Test
    void masksTheAddress() {
        assertEquals("l•••@example.test", ConfirmationCodeService.mask(EMAIL));
    }
}
