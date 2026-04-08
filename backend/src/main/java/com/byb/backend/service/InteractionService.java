package com.byb.backend.service;

import com.byb.backend.model.Interaction;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.InteractionRepository;
import com.byb.backend.repository.StudentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InteractionService {

    private final InteractionRepository interactionRepository;
    private final StudentRepository studentRepository;
    private final CourseRepository courseRepository;
    private final MLRecommendationService mlRecommendationService;
    private final GroupFormationService groupFormationService;

    @Transactional
    public void trackInterest(String studentId, String courseId) {
        // Verify student and course exist
        studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found"));

        courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new RuntimeException("Course not found"));

        // Create interaction
        Interaction interaction = new Interaction();
        interaction.setInteractionId("INT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        interaction.setStudentId(studentId);
        interaction.setCourseId(courseId);
        interaction.setInteractionType("clicked_interested");

        interactionRepository.save(interaction);

        // Track in ML service
        mlRecommendationService.trackInteraction(studentId, courseId, "clicked_interested");

        // Check if group can be formed
        groupFormationService.checkAndFormGroup(courseId);
    }

    @Transactional
    public void trackView(String studentId, String courseId) {
        Interaction interaction = new Interaction();
        interaction.setInteractionId("INT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        interaction.setStudentId(studentId);
        interaction.setCourseId(courseId);
        interaction.setInteractionType("viewed");

        interactionRepository.save(interaction);

        // Track in ML service
        mlRecommendationService.trackInteraction(studentId, courseId, "viewed");
    }

    public long getInterestedStudentsCount(String courseId) {
        return interactionRepository.countInterestedStudents(courseId);
    }
}