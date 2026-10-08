package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "admins")
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class Admin extends BaseEntity {

    @Id
    @Column(name = "admin_id", length = 50)
    private String adminId;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String name;

    @Column(name = "is_active")
    private Boolean isActive = true;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    /**
     * Tokens issued before this instant are refused.
     *
     * Stateless JWT means nothing issued can normally be taken back, and
     * refresh tokens last 30 days. This is the revocation point: signing
     * out everywhere sets it, and so does changing the password. NULL
     * means nothing has ever been revoked.
     */
    @Column(name = "tokens_valid_from")
    private LocalDateTime tokensValidFrom;
}
