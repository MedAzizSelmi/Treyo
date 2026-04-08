package com.byb.backend.repository;

import com.byb.backend.model.Course;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface CourseRepository extends JpaRepository<Course, String> {

    Optional<Course> findByCourseId(String courseId);

    List<Course> findByTrainerId(String trainerId);

    List<Course> findByDomain(String domain);

    List<Course> findByIsPublishedTrueAndIsActiveTrue();

    long countByIsPublishedAndIsActive(Boolean isPublished, Boolean isActive);

    long countByCreatedAtAfter(LocalDateTime date);

    List<Course> findByIsPublished(Boolean isPublished);

    long countByTrainerId(String trainerId);

    // Financial queries (optional - return null if not implemented)
    @Query("SELECT COALESCE(SUM(c.price * c.totalEnrolled), 0) FROM Course c WHERE c.isActive = true")
    BigDecimal getTotalRevenue();

    @Query("SELECT COALESCE(SUM(c.price * c.totalEnrolled), 0) FROM Course c WHERE c.isActive = true AND c.createdAt > :date")
    BigDecimal getRevenueAfter(@Param("date") LocalDateTime date);

    @Query("SELECT COALESCE(AVG(c.price), 0) FROM Course c WHERE c.isActive = true AND c.price > 0")
    BigDecimal getAverageCoursePrice();

    @Query("SELECT c FROM Course c WHERE c.isPublished = true AND c.isActive = true " +
            "AND c.domain = :domain ORDER BY c.averageRating DESC, c.totalEnrolled DESC")
    List<Course> findTopCoursesByDomain(String domain);

    @Query("SELECT c FROM Course c WHERE c.trainerId = :trainerId AND c.isActive = true")
    List<Course> findActiveByTrainerId(String trainerId);
}