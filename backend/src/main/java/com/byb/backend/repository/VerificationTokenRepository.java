package com.byb.backend.repository;

import com.byb.backend.model.VerificationToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface VerificationTokenRepository extends JpaRepository<VerificationToken, String> {

    Optional<VerificationToken> findByToken(String token);

    // ── Six-digit confirmation codes (ConfirmationCodeService) ──────────

    /** The code that counts: only the newest unused one is ever accepted. */
    Optional<VerificationToken> findFirstByEmailAndPurposeAndUsedFalseOrderByCreatedAtDesc(
            String email, VerificationToken.Purpose purpose);

    List<VerificationToken> findByEmailAndPurposeAndUsedFalse(
            String email, VerificationToken.Purpose purpose);

    long countByEmailAndPurposeAndCreatedAtAfter(
            String email, VerificationToken.Purpose purpose, LocalDateTime since);
}
