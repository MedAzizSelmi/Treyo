package com.byb.backend.service;

import com.byb.backend.model.Interaction;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.EnrollmentRepository;
import com.byb.backend.repository.InteractionRepository;
import com.byb.backend.repository.StudentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InteractionService {

    private final InteractionRepository interactionRepository;
    private final StudentRepository studentRepository;
    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final MLRecommendationService mlRecommendationService;

    @Transactional
    public void trackInterest(String studentId, String courseId) {
        studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found"));

        courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new RuntimeException("Course not found"));

        // 1) Self-heal: if there's already at least one row (incl. stale duplicates
        //    from past races), keep exactly one and delete the rest. Then we're done.
        List<Interaction> existing = interactionRepository.findByStudentIdAndCourseId(studentId, courseId).stream()
                .filter(i -> "clicked_interested".equals(i.getInteractionType()))
                .toList();
        if (!existing.isEmpty()) {
            if (existing.size() > 1) {
                interactionRepository.deleteAll(existing.subList(1, existing.size()));
            }
            return;
        }

        // 2) Insert. The unique constraint on (student_id, course_id, interaction_type)
        //    means a concurrent insert will throw DataIntegrityViolationException — we
        //    treat that as success because the row was already added by the other request.
        Interaction interaction = new Interaction();
        interaction.setInteractionId("INT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        interaction.setStudentId(studentId);
        interaction.setCourseId(courseId);
        interaction.setInteractionType("clicked_interested");

        try {
            interactionRepository.saveAndFlush(interaction);
        } catch (DataIntegrityViolationException ignored) {
            return;
        }

        mlRecommendationService.trackInteraction(studentId, courseId, "clicked_interested");
        // Note: group formation is now admin-driven (POST /admin/courses/{id}/notify-interested)
    }

    @Transactional
    public void cancelInterest(String studentId, String courseId) {
        List<Interaction> existing = interactionRepository.findByStudentIdAndCourseId(studentId, courseId).stream()
                .filter(i -> "clicked_interested".equals(i.getInteractionType()))
                .toList();
        if (!existing.isEmpty()) {
            interactionRepository.deleteAll(existing);
        }
    }

    public boolean hasExpressedInterest(String studentId, String courseId) {
        return interactionRepository.findByStudentIdAndCourseId(studentId, courseId).stream()
                .anyMatch(i -> "clicked_interested".equals(i.getInteractionType()));
    }

    public boolean isEnrolled(String studentId, String courseId) {
        return enrollmentRepository.findByStudentIdAndCourseId(studentId, courseId).isPresent();
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

    // ─── Favorites ───────────────────────────────────────────────────
    // The "favourites" feature reuses interaction_type='saved'. One row
    // per (student, course) when saved; row deleted on unsave. The ML
    // model also picks up the engagement signal (weight 2) so saving a
    // course nudges similar-courses recommendations in that direction.

    /**
     * Toggle a course's saved state for the student. Returns the new state:
     * true means "now saved", false means "now unsaved". Idempotent — calling
     * twice in a row gets you back to the original state.
     */
    @Transactional
    public boolean toggleSaved(String studentId, String courseId) {
        // Validate the IDs so we don't write orphan rows.
        studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found"));
        courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new RuntimeException("Course not found"));

        boolean alreadySaved = interactionRepository
                .existsByStudentIdAndCourseIdAndInteractionType(studentId, courseId, "saved");

        if (alreadySaved) {
            // Unsave: drop every 'saved' row for this pair. Defensive — we
            // expect at most one row but a race could have left duplicates.
            interactionRepository.deleteByStudentIdAndCourseIdAndInteractionType(
                    studentId, courseId, "saved");
            return false;
        }

        // Save: insert a fresh row.
        Interaction interaction = new Interaction();
        interaction.setInteractionId("INT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        interaction.setStudentId(studentId);
        interaction.setCourseId(courseId);
        interaction.setInteractionType("saved");

        try {
            interactionRepository.saveAndFlush(interaction);
        } catch (DataIntegrityViolationException ignored) {
            // Race with another concurrent save — the row exists either way.
        }

        // Mirror to ML so the engagement signal lands in the next refresh.
        mlRecommendationService.trackInteraction(studentId, courseId, "saved");
        return true;
    }

    /** Lightweight "is this saved?" check — backs the heart icon's filled
     *  / outlined state on the course-detail screen. */
    public boolean isSaved(String studentId, String courseId) {
        return interactionRepository
                .existsByStudentIdAndCourseIdAndInteractionType(studentId, courseId, "saved");
    }

    /** Course IDs the student has favourited. The favourites screen fetches
     *  course details for each one in a second pass — separation of concerns
     *  keeps this query trivial and lets the frontend reuse the existing
     *  course-by-id endpoint. */
    public List<String> getSavedCourseIds(String studentId) {
        return interactionRepository.findSavedCourseIdsByStudent(studentId);
    }
}