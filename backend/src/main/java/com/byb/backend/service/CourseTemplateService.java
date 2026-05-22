package com.byb.backend.service;

import com.byb.backend.dto.admin.AssignTrainersRequest;
import com.byb.backend.dto.admin.CourseTemplateRequest;
import com.byb.backend.dto.admin.CourseTemplateResponse;
import com.byb.backend.model.Course;
import com.byb.backend.model.CourseTemplate;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.CourseTemplateRepository;
import com.byb.backend.repository.EnrollmentRepository;
import com.byb.backend.repository.InteractionRepository;
import com.byb.backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The admin-side course system. Admins manage {@link CourseTemplate}s
 * (master content) and assign them to a roster of trainers. Each assignment
 * spins up a {@link Course} offering (trainer-specific instance with its own
 * enrollments / interactions / groups). When the template changes, all linked
 * offerings get the new shared values pushed down so students see consistent
 * info regardless of which trainer's version they're looking at.
 */
@Service
@RequiredArgsConstructor
public class CourseTemplateService {

    private final CourseTemplateRepository templateRepository;
    private final CourseRepository courseRepository;
    private final TrainerRepository trainerRepository;
    private final InteractionRepository interactionRepository;
    private final EnrollmentRepository enrollmentRepository;

    // ─── CRUD ──────────────────────────────────────────────────────────

    @Transactional
    public CourseTemplateResponse createTemplate(CourseTemplateRequest req) {
        CourseTemplate t = new CourseTemplate();
        t.setTemplateId("TPL_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        applyRequestToTemplate(t, req, /*isCreate=*/ true);
        t.setIsActive(true);
        t = templateRepository.save(t);
        return toResponse(t);
    }

    @Transactional
    public CourseTemplateResponse updateTemplate(String templateId, CourseTemplateRequest req) {
        CourseTemplate t = templateRepository.findByTemplateId(templateId)
                .orElseThrow(() -> new RuntimeException("Template not found: " + templateId));

        applyRequestToTemplate(t, req, /*isCreate=*/ false);
        t = templateRepository.save(t);

        // Cascade content fields to every offering created from this template.
        // We never touch per-offering state (enrollments, ratings, publish flag).
        List<Course> offerings = courseRepository.findByTemplateId(templateId);
        for (Course c : offerings) {
            copyTemplateContentToCourse(t, c);
        }
        courseRepository.saveAll(offerings);

        return toResponse(t);
    }

    @Transactional
    public void deleteTemplate(String templateId) {
        CourseTemplate t = templateRepository.findByTemplateId(templateId)
                .orElseThrow(() -> new RuntimeException("Template not found: " + templateId));

        // Soft delete: deactivate template and all its offerings. This protects
        // any historical enrollments / groups while hiding the course everywhere.
        t.setIsActive(false);
        templateRepository.save(t);

        List<Course> offerings = courseRepository.findByTemplateId(templateId);
        for (Course c : offerings) {
            c.setIsActive(false);
            c.setIsPublished(false);
        }
        courseRepository.saveAll(offerings);
    }

    public List<CourseTemplateResponse> getAllTemplates() {
        return templateRepository.findAll().stream()
                .sorted(Comparator.comparing(
                        CourseTemplate::getCreatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public CourseTemplateResponse getTemplate(String templateId) {
        CourseTemplate t = templateRepository.findByTemplateId(templateId)
                .orElseThrow(() -> new RuntimeException("Template not found: " + templateId));
        return toResponse(t);
    }

    // ─── ASSIGNMENT ────────────────────────────────────────────────────

    /**
     * Sync the set of trainers this template is offered through. Diff-based:
     *   - New trainers in the list → create an offering for each (immediately live)
     *   - Trainers in the list that already have an offering → no-op
     *   - Existing offerings whose trainerId is NOT in the list → soft-deactivate
     *
     * Drafts were removed (admin owns content; assigning = publishing), so every
     * new offering is created live. The legacy isPublished column is still set
     * to true to keep older queries working.
     */
    @Transactional
    public CourseTemplateResponse assignTrainers(String templateId, AssignTrainersRequest req) {
        CourseTemplate t = templateRepository.findByTemplateId(templateId)
                .orElseThrow(() -> new RuntimeException("Template not found: " + templateId));

        Set<String> requestedTrainerIds = new HashSet<>(req.getTrainerIds());
        List<Course> existing = courseRepository.findByTemplateId(templateId);
        Set<String> existingTrainerIds = existing.stream()
                .map(Course::getTrainerId)
                .collect(Collectors.toSet());

        // 1) Deactivate offerings whose trainers were removed from the list.
        for (Course c : existing) {
            if (!requestedTrainerIds.contains(c.getTrainerId())) {
                c.setIsActive(false);
            } else if (Boolean.FALSE.equals(c.getIsActive())) {
                // Trainer was previously removed and is now re-added → revive.
                c.setIsActive(true);
                c.setIsPublished(true);
            }
        }
        courseRepository.saveAll(existing);

        // 2) Create offerings for trainers that don't have one yet.
        for (String trainerId : requestedTrainerIds) {
            if (existingTrainerIds.contains(trainerId)) continue;

            Trainer trainer = trainerRepository.findByTrainerId(trainerId).orElse(null);
            if (trainer == null) {
                // Skip unknown trainerIds rather than failing the whole batch;
                // admin will see them missing from the response and can retry.
                continue;
            }

            Course c = new Course();
            c.setCourseId("CRS_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
            c.setTrainerId(trainerId);
            c.setTemplateId(templateId);
            copyTemplateContentToCourse(t, c);
            c.setIsActive(true);
            c.setIsPublished(true);
            c.setPublishedAt(LocalDateTime.now());
            courseRepository.save(c);
        }

        return toResponse(t);
    }

    // ─── HELPERS ───────────────────────────────────────────────────────

    /** Applies the request DTO to the template entity. On update, nulls mean "leave unchanged". */
    private void applyRequestToTemplate(CourseTemplate t, CourseTemplateRequest r, boolean isCreate) {
        if (isCreate || r.getTitle() != null) t.setTitle(r.getTitle());
        if (isCreate || r.getDescription() != null) t.setDescription(r.getDescription());
        if (isCreate || r.getDomain() != null) t.setDomain(r.getDomain());
        if (isCreate || r.getSpecificTopic() != null) t.setSpecificTopic(r.getSpecificTopic());
        if (isCreate || r.getLevel() != null) t.setLevel(r.getLevel());
        if (isCreate || r.getDurationHours() != null) t.setDurationHours(r.getDurationHours());
        if (isCreate || r.getLanguage() != null) t.setLanguage(r.getLanguage());
        if (isCreate || r.getFormat() != null) t.setFormat(r.getFormat());
        if (isCreate || r.getPrerequisites() != null) t.setPrerequisites(r.getPrerequisites());
        if (isCreate || r.getLearningOutcomes() != null) t.setLearningOutcomes(r.getLearningOutcomes());
        if (isCreate || r.getPrice() != null) t.setPrice(r.getPrice());
        if (isCreate || r.getMinStudentsRequired() != null) t.setMinStudentsRequired(r.getMinStudentsRequired());
        if (isCreate || r.getMaxStudentsPerGroup() != null) t.setMaxStudentsPerGroup(r.getMaxStudentsPerGroup());
        if (isCreate || r.getMaxGroupsAllowed() != null) t.setMaxGroupsAllowed(r.getMaxGroupsAllowed());
        if (isCreate || r.getHasCertificate() != null) t.setHasCertificate(r.getHasCertificate());
    }

    /** Copies all *content* fields from template → course offering. Does NOT touch trainerId,
     *  publish state, group counts, or any rating/enrollment counters. */
    private void copyTemplateContentToCourse(CourseTemplate t, Course c) {
        c.setTitle(t.getTitle());
        c.setDescription(t.getDescription());
        c.setDomain(t.getDomain());
        c.setSpecificTopic(t.getSpecificTopic());
        c.setLevel(t.getLevel());
        c.setDurationHours(t.getDurationHours());
        c.setLanguage(t.getLanguage());
        c.setFormat(t.getFormat());
        c.setPrerequisites(t.getPrerequisites());
        c.setLearningOutcomes(t.getLearningOutcomes());
        c.setPrice(t.getPrice());
        c.setCurrency(t.getCurrency());
        c.setHasCertificate(t.getHasCertificate());
        c.setMinStudentsRequired(t.getMinStudentsRequired());
        c.setMaxStudentsPerGroup(t.getMaxStudentsPerGroup());
        c.setMaxGroupsAllowed(t.getMaxGroupsAllowed());
    }

    private CourseTemplateResponse toResponse(CourseTemplate t) {
        List<Course> offerings = courseRepository.findByTemplateId(t.getTemplateId());

        List<CourseTemplateResponse.AssignedTrainer> assigned = new ArrayList<>();
        for (Course c : offerings) {
            if (Boolean.FALSE.equals(c.getIsActive())) continue; // hide deactivated assignments
            Trainer tr = trainerRepository.findByTrainerId(c.getTrainerId()).orElse(null);
            long enrolled = enrollmentRepository.countByCourseId(c.getCourseId());
            long interested = interactionRepository.countInterestedStudents(c.getCourseId());
            assigned.add(CourseTemplateResponse.AssignedTrainer.builder()
                    .trainerId(c.getTrainerId())
                    .trainerName(tr != null ? tr.getName() : "Unknown")
                    .courseId(c.getCourseId())
                    .isPublished(c.getIsPublished())
                    .totalEnrolled((int) enrolled)
                    .interestedCount((int) interested)
                    .build());
        }

        return CourseTemplateResponse.builder()
                .templateId(t.getTemplateId())
                .title(t.getTitle())
                .description(t.getDescription())
                .domain(t.getDomain())
                .specificTopic(t.getSpecificTopic())
                .level(t.getLevel())
                .durationHours(t.getDurationHours())
                .language(t.getLanguage())
                .format(t.getFormat())
                .prerequisites(t.getPrerequisites())
                .learningOutcomes(t.getLearningOutcomes())
                .price(t.getPrice())
                .currency(t.getCurrency())
                .hasCertificate(t.getHasCertificate())
                .minStudentsRequired(t.getMinStudentsRequired())
                .maxStudentsPerGroup(t.getMaxStudentsPerGroup())
                .maxGroupsAllowed(t.getMaxGroupsAllowed())
                .isActive(t.getIsActive())
                .createdAt(t.getCreatedAt())
                .updatedAt(t.getUpdatedAt())
                .assignedTrainers(assigned)
                .offeringCount(assigned.size())
                .build();
    }
}
