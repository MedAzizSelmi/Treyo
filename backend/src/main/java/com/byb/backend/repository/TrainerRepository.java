package com.byb.backend.repository;

import com.byb.backend.model.Trainer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface TrainerRepository extends JpaRepository<Trainer, String> {

    Optional<Trainer> findByEmail(String email);

    boolean existsByEmail(String email);

    Optional<Trainer> findByTrainerId(String trainerId);

    long countByCreatedAtAfter(LocalDateTime date);

    /** Counts trainers who logged in after the given timestamp. Backs the
     *  "Active Today" dashboard tile alongside the equivalent on students. */
    long countByLastLoginAtAfter(LocalDateTime date);

    List<Trainer> findByIsVerified(Boolean isVerified);

    List<Trainer> findByIsActiveTrue();
}