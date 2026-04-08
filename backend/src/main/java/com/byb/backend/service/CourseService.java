package com.byb.backend.service;

import com.byb.backend.dto.course.CreateCourseRequest;
import com.byb.backend.dto.course.CourseResponse;
import com.byb.backend.model.Course;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.InteractionRepository;
import com.byb.backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CourseService {

    private final CourseRepository courseRepository;
    private final TrainerRepository trainerRepository;
    private final InteractionRepository interactionRepository;

    @Transactional
    public CourseResponse createCourse(String trainerId, CreateCourseRequest request) {
        // Verify trainer exists
        Trainer trainer = trainerRepository.findByTrainerId(trainerId)
                .orElseThrow(() -> new RuntimeException("Trainer not found"));

        // Create course
        Course course = new Course();
        course.setCourseId("CRS_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        course.setTrainerId(trainerId);
        course.setTitle(request.getTitle());
        course.setDescription(request.getDescription());
        course.setDomain(request.getDomain());
        course.setSpecificTopic(request.getSpecificTopic());
        course.setLevel(request.getLevel());
        course.setDurationHours(request.getDurationHours());
        course.setLanguage(request.getLanguage());
        course.setFormat(request.getFormat());
        course.setPrerequisites(request.getPrerequisites());
        course.setLearningOutcomes(request.getLearningOutcomes());
        course.setPrice(request.getPrice());
        course.setMinStudentsRequired(request.getMinStudentsRequired());
        course.setMaxStudentsPerGroup(request.getMaxStudentsPerGroup());
        course.setHasCertificate(request.getHasCertificate());
        course.setIsActive(true);
        course.setIsPublished(false); // Initially unpublished

        course = courseRepository.save(course);

        return mapToCourseResponse(course, trainer.getName());
    }

    @Transactional
    public CourseResponse publishCourse(String courseId, String trainerId) {
        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new RuntimeException("Course not found"));

        if (!course.getTrainerId().equals(trainerId)) {
            throw new RuntimeException("Unauthorized: You can only publish your own courses");
        }

        course.setIsPublished(true);
        course.setPublishedAt(LocalDateTime.now());
        course = courseRepository.save(course);

        Trainer trainer = trainerRepository.findByTrainerId(trainerId)
                .orElseThrow(() -> new RuntimeException("Trainer not found"));

        return mapToCourseResponse(course, trainer.getName());
    }

    public List<CourseResponse> getAllPublishedCourses() {
        return courseRepository.findByIsPublishedTrueAndIsActiveTrue()
                .stream()
                .map(course -> {
                    Trainer trainer = trainerRepository.findByTrainerId(course.getTrainerId())
                            .orElse(null);
                    String trainerName = trainer != null ? trainer.getName() : "Unknown";
                    return mapToCourseResponse(course, trainerName);
                })
                .collect(Collectors.toList());
    }

    public List<CourseResponse> getCoursesByTrainer(String trainerId) {
        return courseRepository.findByTrainerId(trainerId)
                .stream()
                .map(course -> {
                    Trainer trainer = trainerRepository.findByTrainerId(trainerId)
                            .orElse(null);
                    String trainerName = trainer != null ? trainer.getName() : "Unknown";
                    return mapToCourseResponse(course, trainerName);
                })
                .collect(Collectors.toList());
    }

    public CourseResponse getCourseById(String courseId) {
        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new RuntimeException("Course not found"));

        Trainer trainer = trainerRepository.findByTrainerId(course.getTrainerId())
                .orElse(null);
        String trainerName = trainer != null ? trainer.getName() : "Unknown";

        return mapToCourseResponse(course, trainerName);
    }

    private CourseResponse mapToCourseResponse(Course course, String trainerName) {
        // Count interested students
        long interestedCount = interactionRepository.countInterestedStudents(course.getCourseId());
        boolean canFormGroup = course.canFormGroup((int) interestedCount);

        return CourseResponse.builder()
                .courseId(course.getCourseId())
                .trainerId(course.getTrainerId())
                .trainerName(trainerName)
                .title(course.getTitle())
                .description(course.getDescription())
                .domain(course.getDomain())
                .specificTopic(course.getSpecificTopic())
                .level(course.getLevel())
                .durationHours(course.getDurationHours())
                .language(course.getLanguage())
                .format(course.getFormat())
                .prerequisites(course.getPrerequisites())
                .learningOutcomes(course.getLearningOutcomes())
                .price(course.getPrice())
                .currency(course.getCurrency())
                .hasCertificate(course.getHasCertificate())
                .minStudentsRequired(course.getMinStudentsRequired())
                .maxStudentsPerGroup(course.getMaxStudentsPerGroup())
                .currentGroupsCount(course.getCurrentGroupsCount())
                .averageRating(course.getAverageRating())
                .totalRatings(course.getTotalRatings())
                .totalEnrolled(course.getTotalEnrolled())
                .totalCompleted(course.getTotalCompleted())
                .completionRate(course.getCompletionRate())
                .isPublished(course.getIsPublished())
                .isActive(course.getIsActive())
                .publishedAt(course.getPublishedAt())
                .createdAt(course.getCreatedAt())
                .interestedStudentsCount((int) interestedCount)
                .canFormGroup(canFormGroup)
                .build();
    }
}