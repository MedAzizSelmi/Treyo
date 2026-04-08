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

    Optional<Enrollment> findByStudentIdAndCourseId(String studentId, String courseId);

    long countByEnrollmentStatus(String status);

    long countByCreatedAtAfter(LocalDateTime date);

    long countByStudentId(String studentId);

    @Query("SELECT e FROM Enrollment e WHERE e.studentId = :studentId AND e.enrollmentStatus = 'active'")
    List<Enrollment> findActiveEnrollmentsByStudent(String studentId);

    @Query("SELECT COUNT(e) FROM Enrollment e WHERE e.courseId = :courseId AND e.enrollmentStatus = 'confirmed'")
    long countConfirmedEnrollments(String courseId);
}