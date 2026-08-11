package com.byb.backend.repository;

import com.byb.backend.model.TrainerReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface TrainerReportRepository extends JpaRepository<TrainerReport, String> {

    /** Newest first — the admin queue reads top-down. */
    List<TrainerReport> findAllByOrderByCreatedAtDesc();

    List<TrainerReport> findByStatusOrderByCreatedAtDesc(String status);

    List<TrainerReport> findByTrainerIdOrderByCreatedAtDesc(String trainerId);

    /** Backs the duplicate-spam guard: one OPEN report per student/trainer pair. */
    @Query("SELECT COUNT(r) FROM TrainerReport r "
            + "WHERE r.studentId = :studentId AND r.trainerId = :trainerId AND r.status = 'OPEN'")
    long countOpenByStudentAndTrainer(String studentId, String trainerId);

    long countByStatus(String status);
}
