package com.byb.backend.repository;

import com.byb.backend.model.Interaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

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

    @Query("SELECT COUNT(i) FROM Interaction i WHERE i.courseId = :courseId AND i.interactionType = 'clicked_interested'")
    long countInterestedStudents(String courseId);
}