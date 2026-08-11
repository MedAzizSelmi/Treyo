package com.byb.backend.repository;

import com.byb.backend.model.Enrollment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface EnrollmentRepository extends JpaRepository<Enrollment, String> {

    Optional<Enrollment> findByEnrollmentId(String enrollmentId);

    List<Enrollment> findByStudentId(String studentId);

    List<Enrollment> findByCourseId(String courseId);

    /** Every enrollment belonging to a single group. Used by the
     *  lifecycle service to cascade "completed" status from the group
     *  down to each member's enrollment row. */
    List<Enrollment> findByGroupId(String groupId);

    Optional<Enrollment> findByStudentIdAndCourseId(String studentId, String courseId);

    long countByEnrollmentStatus(String status);

    /** All enrollments for a course (used to count "real" enrolled students). */
    long countByCourseId(String courseId);

    /** Confirmed/active enrollments — students who have committed to a group. */
    @Query("SELECT COUNT(e) FROM Enrollment e WHERE e.courseId = :courseId AND e.enrollmentStatus IN ('confirmed','active','completed')")
    long countCommittedEnrollments(String courseId);

    long countByCreatedAtAfter(LocalDateTime date);

    long countByStudentId(String studentId);

    @Query("SELECT e FROM Enrollment e WHERE e.studentId = :studentId AND e.enrollmentStatus = 'active'")
    List<Enrollment> findActiveEnrollmentsByStudent(String studentId);

    @Query("SELECT COUNT(e) FROM Enrollment e WHERE e.courseId = :courseId AND e.enrollmentStatus = 'confirmed'")
    long countConfirmedEnrollments(String courseId);

    /**
     * Students the trainer is currently training for this course.
     *
     * Deliberately excludes 'completed' and 'cancelled': once
     * CourseLifecycleService closes a group it flips those enrollments to
     * 'completed', so this count drops back down and the trainer's card
     * reflects who they're teaching *now* rather than a lifetime total.
     * (countByCourseId, used for totalEnrolled, keeps the lifetime figure
     * the admin dashboard reports.)
     */
    @Query("SELECT COUNT(e) FROM Enrollment e WHERE e.courseId = :courseId AND e.enrollmentStatus IN ('confirmed','active')")
    long countActiveEnrollments(String courseId);
}