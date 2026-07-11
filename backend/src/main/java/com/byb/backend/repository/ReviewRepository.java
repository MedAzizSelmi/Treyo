package com.byb.backend.repository;

import com.byb.backend.model.Review;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ReviewRepository extends JpaRepository<Review, String> {

    Optional<Review> findByStudentIdAndCourseId(String studentId, String courseId);

    List<Review> findByCourseId(String courseId);

    List<Review> findByTrainerId(String trainerId);

    /** Public-facing course reviews — drops admin-hidden rows so the
     *  course-detail "What students said" list doesn't surface them. */
    List<Review> findByCourseIdAndIsHiddenFalseOrderByCreatedAtDesc(String courseId);

    /** Public-facing trainer reviews — feeds both the trainer profile
     *  (student-viewing-trainer) and the trainer's own self-view tab. */
    List<Review> findByTrainerIdAndIsHiddenFalseOrderByCreatedAtDesc(String trainerId);

    /** Admin listing — every review newest first, including hidden ones
     *  so the moderation queue can un-hide as well as hide. JPQL form
     *  to avoid Spring Data's `findAllBy…OrderBy…` parser ambiguity
     *  (the variant without a predicate after `findAllBy` doesn't
     *  parse cleanly on every Spring Data version). */
    @Query("SELECT r FROM Review r ORDER BY r.createdAt DESC")
    List<Review> findAllNewestFirst();

    /** Average course rating used to refresh Course.averageRating. */
    @Query("SELECT AVG(r.courseRating) FROM Review r WHERE r.courseId = :courseId")
    Double averageCourseRating(String courseId);

    /** Average trainer rating used to refresh Trainer.averageRating. */
    @Query("SELECT AVG(r.trainerRating) FROM Review r WHERE r.trainerId = :trainerId")
    Double averageTrainerRating(String trainerId);

    long countByCourseId(String courseId);

    long countByTrainerId(String trainerId);
}
