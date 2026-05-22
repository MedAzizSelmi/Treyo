package com.byb.backend.repository;

import com.byb.backend.model.Interaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface InteractionRepository extends JpaRepository<Interaction, String> {

    List<Interaction> findByStudentId(String studentId);

    List<Interaction> findByCourseId(String courseId);

    List<Interaction> findByStudentIdAndCourseId(String studentId, String courseId);

    long countByCreatedAtAfter(LocalDateTime date);

    long countByStudentId(String studentId);

    @Query("SELECT i FROM Interaction i WHERE i.studentId = :studentId AND i.interactionType = 'clicked_interested'")
    List<Interaction> findInterestedCoursesByStudent(String studentId);

    @Query("SELECT COUNT(DISTINCT i.studentId) FROM Interaction i WHERE i.courseId = :courseId AND i.interactionType = 'clicked_interested'")
    long countInterestedStudents(String courseId);

    // ─── Favorites (interaction_type = 'saved') ──────────────────────
    // We store a student's favourites as interactions of type 'saved'.
    // Reusing the existing table keeps the data model simple and means
    // the ML model already picks up the engagement signal (saved has
    // weight 2 in the collaborative filter). The three queries below
    // back the toggle / list / status endpoints.

    /** True if this student has at least one 'saved' row for this course. */
    boolean existsByStudentIdAndCourseIdAndInteractionType(
            String studentId, String courseId, String interactionType);

    /** Remove every 'saved' row for this (student, course) pair. Used by
     *  the unfavourite path — `existsBy…` above stays a clean "is saved" check. */
    @Modifying
    @Transactional
    @Query("DELETE FROM Interaction i WHERE i.studentId = :studentId "
            + "AND i.courseId = :courseId AND i.interactionType = :type")
    void deleteByStudentIdAndCourseIdAndInteractionType(
            @Param("studentId") String studentId,
            @Param("courseId") String courseId,
            @Param("type") String type);

    /** Distinct course IDs the student has saved. DISTINCT is defensive —
     *  the toggle endpoint guarantees only one row per (student, course)
     *  but old data or races could leave duplicates. */
    @Query("SELECT DISTINCT i.courseId FROM Interaction i "
            + "WHERE i.studentId = :studentId AND i.interactionType = 'saved'")
    List<String> findSavedCourseIdsByStudent(@Param("studentId") String studentId);
}