package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * One row per emailed verification or reset link.
 *
 * Four purposes, same table:
 *   - EMAIL_VERIFY  — sent automatically after signup; clicking the
 *                     link flips Student/Trainer.isVerified to true.
 *   - PASSWORD_RESET — sent on forgot-password; clicking the link lets
 *                     the user pick a new password without knowing the
 *                     old one.
 *   - ACCOUNT_DELETE, PASSWORD_SET — six-digit codes a signed-in user
 *                     asks for, standing in for the password on the two
 *                     actions that require one. Accounts created through
 *                     Google or LinkedIn have no password they know; see
 *                     ConfirmationCodeService. For these the token column
 *                     holds a digest of the code, never the code itself,
 *                     and attempts counts wrong guesses.
 *
 * Tokens are single-use (`used` flips to true on consume) and expire on
 * a short window (15 min for reset, 24 h for verify). Old tokens are
 * NOT deleted — we just check `expiresAt` + `used` on lookup.
 */
@Entity
@Table(
        name = "verification_tokens",
        indexes = {
                @Index(name = "idx_vtoken_token", columnList = "token", unique = true),
                @Index(name = "idx_vtoken_email", columnList = "email")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class VerificationToken extends BaseEntity {

    public enum Purpose { EMAIL_VERIFY, PASSWORD_RESET, ACCOUNT_DELETE, PASSWORD_SET }

    @Id
    @Column(name = "token_id", length = 50)
    private String tokenId;

    /** The opaque random string emailed to the user. URL-safe Base64. */
    @Column(name = "token", length = 100, nullable = false, unique = true)
    private String token;

    @Column(name = "email", length = 200, nullable = false)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(name = "purpose", length = 30, nullable = false)
    private Purpose purpose;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "used", nullable = false)
    private Boolean used = false;

    @Column(name = "used_at")
    private LocalDateTime usedAt;

    /**
     * Wrong guesses against a six-digit code. Unused for links.
     *
     * NOT NULL in the database (2026-10-22_account_confirmation_codes.sql),
     * but not declared so here: ddl-auto=update would then try to add the
     * column as NOT NULL to a table that already has rows, Postgres would
     * refuse, and the column would silently not exist. Declared nullable,
     * Hibernate adds it and the migration tightens it. Code treats null as 0.
     */
    @Column(name = "attempts")
    private Integer attempts = 0;
}
