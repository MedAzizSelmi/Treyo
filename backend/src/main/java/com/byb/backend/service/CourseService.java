package com.byb.backend.service;

import com.byb.backend.dto.course.CreateCourseRequest;
import com.byb.backend.dto.course.CourseResponse;
import com.byb.backend.model.Course;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.EnrollmentRepository;
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
    private final EnrollmentRepository enrollmentRepository;
    private final com.byb.backend.repository.ModuleRepository moduleRepository;

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
        course.setMaxGroupsAllowed(request.getMaxGroupsAllowed());
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
                // Approval gate — pending / rejected trainer-created
                // courses stay hidden from students. Legacy rows have
                // approvalStatus = APPROVED (default) so they aren't
                // affected by the switchover.
                .filter(c -> {
                    String s = c.getApprovalStatus();
                    return s == null || "APPROVED".equalsIgnoreCase(s);
                })
                .map(course -> {
                    Trainer trainer = trainerRepository.findByTrainerId(course.getTrainerId())
                            .orElse(null);
                    String trainerName = trainer != null ? trainer.getName() : "Unknown";
                    return mapToCourseResponse(course, trainerName);
                })
                .collect(Collectors.toList());
    }

    // ── New v2 course lifecycle (module + approval) ──────────────────

    /**
     * Trainer submits a new course for admin review.
     * Starts as isPublished=true (so the course-listing filter picks
     * it up on approval) + isActive=true + approvalStatus=PENDING.
     * The APPROVED filter on read endpoints keeps students from
     * seeing it until the admin decides.
     */
    @Transactional
    public CourseResponse createTrainerCourse(String trainerId, CreateCourseRequest request) {
        Trainer trainer = trainerRepository.findByTrainerId(trainerId)
                .orElseThrow(() -> new IllegalArgumentException("Trainer not found"));
        if (request.getModuleId() == null || request.getModuleId().isBlank()) {
            throw new IllegalArgumentException("moduleId is required — pick a module for this course.");
        }

        Course course = new Course();
        course.setCourseId("CRS_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        course.setTrainerId(trainerId);
        applyRequest(course, request);
        course.setIsActive(true);
        course.setIsPublished(true);
        course.setPublishedAt(LocalDateTime.now());
        course.setApprovalStatus("PENDING");
        course.setApprovalDecidedAt(null);
        course.setApprovalNote(null);

        course = courseRepository.save(course);
        return mapToCourseResponse(course, trainer.getName());
    }

    /**
     * Trainer edits their own course. Only allowed while the course
     * is PENDING or REJECTED — an APPROVED course is locked so the
     * admin's verdict can't be quietly changed under them. Editing a
     * REJECTED course re-opens it as PENDING for the admin to review
     * the changes.
     */
    @Transactional
    public CourseResponse updateTrainerCourse(String courseId, String trainerId, CreateCourseRequest request) {
        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new IllegalArgumentException("Course not found"));
        if (!course.getTrainerId().equals(trainerId)) {
            throw new IllegalArgumentException("You can only edit your own courses.");
        }
        String s = course.getApprovalStatus();
        if ("APPROVED".equalsIgnoreCase(s)) {
            throw new IllegalArgumentException("This course has already been approved and can no longer be edited. Ask the admin if changes are needed.");
        }

        applyRequest(course, request);
        // Any edit puts the course back in the queue.
        course.setApprovalStatus("PENDING");
        course.setApprovalNote(null);
        course.setApprovalDecidedAt(null);
        course = courseRepository.save(course);

        Trainer trainer = trainerRepository.findByTrainerId(trainerId).orElse(null);
        return mapToCourseResponse(course, trainer != null ? trainer.getName() : "Unknown");
    }

    /** Shared field-copying used by both create and edit. Also copies
     *  the two new fields — moduleId and materialUrl — that the v2
     *  flow relies on. */
    private void applyRequest(Course course, CreateCourseRequest request) {
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
        course.setMaxGroupsAllowed(request.getMaxGroupsAllowed());
        course.setHasCertificate(request.getHasCertificate());
        // v2 fields
        if (request.getModuleId() != null) course.setModuleId(request.getModuleId());
        if (request.getMaterialUrl() != null) course.setMaterialUrl(request.getMaterialUrl());
        if (request.getMaterialName() != null) course.setMaterialName(request.getMaterialName());
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

    /**
     * Returns the student's saved/favourited courses as full CourseResponse
     * objects so the mobile favourites screen can render cards directly
     * (no N+1 lookup from the client). Inactive courses are filtered out —
     * if a trainer's offering was deactivated after the student saved it,
     * we just hide it rather than rendering a broken stub.
     */
    public List<CourseResponse> getSavedCoursesForStudent(String studentId) {
        List<String> savedIds = interactionRepository.findSavedCourseIdsByStudent(studentId);
        if (savedIds.isEmpty()) return List.of();

        return courseRepository.findAllById(savedIds).stream()
                .filter(c -> Boolean.TRUE.equals(c.getIsActive()))
                .map(course -> {
                    Trainer trainer = trainerRepository.findByTrainerId(course.getTrainerId())
                            .orElse(null);
                    String trainerName = trainer != null ? trainer.getName() : "Unknown";
                    return mapToCourseResponse(course, trainerName);
                })
                .collect(Collectors.toList());
    }

    @Transactional
    public CourseResponse updateCourse(String courseId, String trainerId, CreateCourseRequest request) {
        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new RuntimeException("Course not found"));

        if (!course.getTrainerId().equals(trainerId)) {
            throw new RuntimeException("Unauthorized: You can only edit your own courses");
        }

        if (request.getTitle() != null) course.setTitle(request.getTitle());
        if (request.getDescription() != null) course.setDescription(request.getDescription());
        if (request.getDomain() != null) course.setDomain(request.getDomain());
        if (request.getSpecificTopic() != null) course.setSpecificTopic(request.getSpecificTopic());
        if (request.getLevel() != null) course.setLevel(request.getLevel());
        if (request.getDurationHours() != null) course.setDurationHours(request.getDurationHours());
        if (request.getLanguage() != null) course.setLanguage(request.getLanguage());
        if (request.getFormat() != null) course.setFormat(request.getFormat());
        if (request.getPrerequisites() != null) course.setPrerequisites(request.getPrerequisites());
        if (request.getLearningOutcomes() != null) course.setLearningOutcomes(request.getLearningOutcomes());
        if (request.getPrice() != null) course.setPrice(request.getPrice());
        if (request.getMinStudentsRequired() != null) course.setMinStudentsRequired(request.getMinStudentsRequired());
        if (request.getMaxStudentsPerGroup() != null) course.setMaxStudentsPerGroup(request.getMaxStudentsPerGroup());
        if (request.getMaxGroupsAllowed() != null) course.setMaxGroupsAllowed(request.getMaxGroupsAllowed());
        if (request.getHasCertificate() != null) course.setHasCertificate(request.getHasCertificate());

        course = courseRepository.save(course);

        Trainer trainer = trainerRepository.findByTrainerId(trainerId).orElse(null);
        return mapToCourseResponse(course, trainer != null ? trainer.getName() : "Unknown");
    }

    public CourseResponse getCourseById(String courseId) {
        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new RuntimeException("Course not found"));

        Trainer trainer = trainerRepository.findByTrainerId(course.getTrainerId())
                .orElse(null);
        String trainerName = trainer != null ? trainer.getName() : "Unknown";

        return mapToCourseResponse(course, trainerName);
    }

    /** Public shim so other services (e.g. AdminService.getPendingCourses)
     *  can reuse this mapper without duplicating the field list. */
    public CourseResponse toResponse(Course course, String trainerName) {
        return mapToCourseResponse(course, trainerName);
    }

    private CourseResponse mapToCourseResponse(Course course, String trainerName) {
        // Count interested students AND actual enrollments (dynamic — stays in sync with DB)
        long interestedCount = interactionRepository.countInterestedStudents(course.getCourseId());
        long actualEnrolled = enrollmentRepository.countByCourseId(course.getCourseId());
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
                .totalEnrolled((int) actualEnrolled)
                .totalCompleted(course.getTotalCompleted())
                .completionRate(course.getCompletionRate())
                .isPublished(course.getIsPublished())
                .isActive(course.getIsActive())
                .publishedAt(course.getPublishedAt())
                .createdAt(course.getCreatedAt())
                .interestedStudentsCount((int) interestedCount)
                .canFormGroup(canFormGroup)
                // v2 fields
                .moduleId(course.getModuleId())
                .moduleName(course.getModuleId() == null ? null :
                        moduleRepository.findById(course.getModuleId())
                                .map(com.byb.backend.model.CourseModule::getName)
                                .orElse(null))
                .materialUrl(course.getMaterialUrl())
                .materialName(course.getMaterialName())
                .approvalStatus(course.getApprovalStatus() == null ? "APPROVED" : course.getApprovalStatus())
                .approvalNote(course.getApprovalNote())
                .approvalDecidedAt(course.getApprovalDecidedAt())
                .build();
    }
}