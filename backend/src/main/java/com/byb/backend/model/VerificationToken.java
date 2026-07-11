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
 * Two purposes, same table:
 *   - EMAIL_VERIFY  — sent automatically after signup; clicking the
 *                     link flips Student/Trainer.isVerified to true.
 *   - PASSWORD_RESET — sent on forgot-password; clicking the link lets
 *                     the user pick a new password without knowing the
 *                     old one.
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

    public enum Purpose { EMAIL_VERIFY, PASSWORD_RESET }

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
}
