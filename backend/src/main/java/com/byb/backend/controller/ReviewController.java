package com.byb.backend.controller;

import com.byb.backend.model.Course;
import com.byb.backend.model.Review;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.ReviewRepository;
import com.byb.backend.repository.TrainerRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Course + trainer end-of-course survey endpoints.
 *
 * One review per (student, course) — enforced both by the unique index
 * in the DB and an explicit pre-check here so we can return a clean
 * 409 instead of a generic constraint violation.
 *
 * After every submit we recompute and persist the course's and the
 * trainer's averageRating so the UI doesn't have to AVG() on every read.
 */
@RestController
@RequestMapping("/api/reviews")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Reviews", description = "Course & trainer ratings + feedback")
@SecurityRequirement(name = "bearerAuth")
public class ReviewController {

    private final ReviewRepository reviewRepository;
    private final CourseRepository courseRepository;
    private final TrainerRepository trainerRepository;
    // Needed for enriching review responses with the author's name and
    // photo so the mobile UI doesn't have to fan-out per-review lookups.
    private final com.byb.backend.repository.StudentRepository studentRepository;

    /**
     * Whether the student has already left a review for this course.
     * Used by the mobile survey trigger so we don't re-prompt after submit.
     */
    @GetMapping("/check")
    @Operation(summary = "Has this student already reviewed this course?")
    public ResponseEntity<Map<String, Object>> check(
            @RequestParam String studentId,
            @RequestParam String courseId) {
        Optional<Review> existing = reviewRepository.findByStudentIdAndCourseId(studentId, courseId);
        Map<String, Object> out = new HashMap<>();
        out.put("reviewed", existing.isPresent());
        existing.ifPresent(r -> {
            out.put("courseRating", r.getCourseRating());
            out.put("trainerRating", r.getTrainerRating());
            out.put("courseFeedback", r.getCourseFeedback());
            out.put("trainerFeedback", r.getTrainerFeedback());
        });
        return ResponseEntity.ok(out);
    }

    /**
     * Submit a new end-of-course survey.
     *
     * Body:
     *   {
     *     "studentId": "...",
     *     "courseId": "...",
     *     "trainerId": "...",          // server cross-checks against course
     *     "enrollmentId": "...",       // optional
     *     "courseRating": 1..5,
     *     "trainerRating": 1..5,
     *     "courseFeedback": "free text about the course (optional)",
     *     "trainerFeedback": "free text about the trainer (optional)"
     *   }
     *
     * Backwards-compat: a single legacy `feedback` field is still
     * accepted and treated as the courseFeedback so older clients
     * keep working until they update.
     */
    @PostMapping
    @Operation(summary = "Submit a course + trainer review")
    public ResponseEntity<?> submit(@RequestBody Map<String, Object> body) {
        String studentId = stringOrNull(body.get("studentId"));
        String courseId = stringOrNull(body.get("courseId"));
        String trainerId = stringOrNull(body.get("trainerId"));
        String enrollmentId = stringOrNull(body.get("enrollmentId"));
        Integer courseRating = intOrNull(body.get("courseRating"));
        Integer trainerRating = intOrNull(body.get("trainerRating"));
        String courseFeedback = stringOrNull(body.get("courseFeedback"));
        String trainerFeedback = stringOrNull(body.get("trainerFeedback"));
        // Legacy single-field fallback — older clients sent everything
        // as `feedback`. Treat it as the course feedback so submissions
        // from before the split don't silently drop their text.
        if (courseFeedback == null && trainerFeedback == null) {
            courseFeedback = stringOrNull(body.get("feedback"));
        }

        if (studentId == null || courseId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "studentId and courseId are required"));
        }
        if (courseRating == null || courseRating < 1 || courseRating > 5) {
            return ResponseEntity.badRequest().body(Map.of("error", "courseRating must be 1-5"));
        }
        if (trainerRating == null || trainerRating < 1 || trainerRating > 5) {
            return ResponseEntity.badRequest().body(Map.of("error", "trainerRating must be 1-5"));
        }

        Course course = courseRepository.findByCourseId(courseId).orElse(null);
        if (course == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Course not found"));
        }
        // Trust the course's recorded trainerId over whatever the client sends.
        String resolvedTrainerId = course.getTrainerId();
        if (resolvedTrainerId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Course has no trainer assigned"));
        }
        if (trainerId != null && !trainerId.equals(resolvedTrainerId)) {
            // Not fatal — we just use the canonical one.
            trainerId = resolvedTrainerId;
        } else if (trainerId == null) {
            trainerId = resolvedTrainerId;
        }

        if (reviewRepository.findByStudentIdAndCourseId(studentId, courseId).isPresent()) {
            return ResponseEntity.status(409).body(Map.of("error", "You've already reviewed this course"));
        }

        try {
            Review r = new Review();
            r.setReviewId("rev_" + UUID.randomUUID().toString().replace("-", "").substring(0, 18));
            r.setStudentId(studentId);
            r.setCourseId(courseId);
            r.setTrainerId(trainerId);
            r.setEnrollmentId(enrollmentId);
            r.setCourseRating(courseRating);
            r.setTrainerRating(trainerRating);
            r.setCourseFeedback(courseFeedback);
            r.setTrainerFeedback(trainerFeedback);
            reviewRepository.save(r);

            // Recompute rolling averages so the next read on Course / Trainer
            // already reflects this review without a JOIN. Wrapped in
            // their own try/catch so an aggregate-update failure can't
            // roll back the actual review we just saved.
            try {
                Double avgCourse = reviewRepository.averageCourseRating(courseId);
                if (avgCourse != null) {
                    course.setAverageRating(BigDecimal.valueOf(avgCourse).setScale(2, RoundingMode.HALF_UP));
                    courseRepository.save(course);
                }
                Trainer trainer = trainerRepository.findByTrainerId(trainerId).orElse(null);
                if (trainer != null) {
                    Double avgTrainer = reviewRepository.averageTrainerRating(trainerId);
                    if (avgTrainer != null) {
                        trainer.setAverageRating(BigDecimal.valueOf(avgTrainer).setScale(2, RoundingMode.HALF_UP));
                        trainerRepository.save(trainer);
                    }
                }
            } catch (Exception aggEx) {
                log.warn("Review saved but aggregate refresh failed for course {}: {}",
                        courseId, aggEx.getMessage());
            }

            // Build the response as a mutable map so a null on any value
            // can't blow up Map.of(...).
            Map<String, Object> response = new java.util.HashMap<>();
            response.put("status", "saved");
            response.put("reviewId", r.getReviewId());
            response.put("courseRating", courseRating);
            response.put("trainerRating", trainerRating);
            response.put("submittedAt", LocalDateTime.now().toString());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            // Surface the actual DB / serialisation error to the mobile
            // instead of returning a bare 500 — the client falls back
            // to "Could not submit your review" when there's no `error`
            // field on the response body.
            log.error("Review submit failed for student {} course {}: {}",
                    studentId, courseId, e.getMessage(), e);
            return ResponseEntity.status(500).body(Map.of(
                    "error", "Could not save review: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage())
            ));
        }
    }

    /**
     * Public list of reviews for a course — backs the "What students
     * said" section on course-detail. Hidden reviews are filtered out.
     * Includes the author's name + photo so the mobile renders cards
     * directly without a per-row lookup.
     */
    @GetMapping("/course/{courseId}")
    @Operation(summary = "Visible reviews for a course (admin-hidden ones excluded)")
    public ResponseEntity<List<Map<String, Object>>> forCourse(@PathVariable String courseId) {
        return ResponseEntity.ok(
                reviewRepository.findByCourseIdAndIsHiddenFalseOrderByCreatedAtDesc(courseId)
                        .stream().map(this::enrich).toList()
        );
    }

    /**
     * Public list of reviews for a trainer — used by the trainer
     * profile (when a student is viewing them) and the trainer's own
     * self-view tab.
     */
    @GetMapping("/trainer/{trainerId}")
    @Operation(summary = "Visible reviews for a trainer (admin-hidden ones excluded)")
    public ResponseEntity<List<Map<String, Object>>> forTrainer(@PathVariable String trainerId) {
        return ResponseEntity.ok(
                reviewRepository.findByTrainerIdAndIsHiddenFalseOrderByCreatedAtDesc(trainerId)
                        .stream().map(this::enrich).toList()
        );
    }

    /**
     * Admin moderation list — every review including hidden ones,
     * newest first. The `isHidden` flag tells the dashboard whether
     * to render the row as muted + "Show" button vs visible + "Hide".
     */
    @GetMapping("/admin/all")
    @Operation(summary = "Full review list for moderation (admin)")
    public ResponseEntity<?> adminListAll() {
        try {
            List<Map<String, Object>> out = reviewRepository.findAllNewestFirst()
                    .stream().map(r -> {
                        Map<String, Object> m = enrich(r);
                        m.put("isHidden", Boolean.TRUE.equals(r.getIsHidden()));
                        // Course / trainer titles too, so the admin can
                        // tell what was reviewed without resolving the
                        // IDs separately.
                        if (r.getCourseId() != null) {
                            courseRepository.findByCourseId(r.getCourseId()).ifPresent(c ->
                                    m.put("courseTitle", c.getTitle()));
                        }
                        if (r.getTrainerId() != null) {
                            trainerRepository.findByTrainerId(r.getTrainerId()).ifPresent(t ->
                                    m.put("trainerName", t.getName()));
                        }
                        return m;
                    }).toList();
            return ResponseEntity.ok(out);
        } catch (Exception e) {
            // Surface the real cause instead of a bare 400/500. The
            // admin dashboard's catch block falls back to a generic
            // message otherwise, which makes this very hard to debug
            // from the network tab.
            log.error("Review admin list failed: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body(Map.of(
                    "error", "Could not load reviews: " +
                            (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage())
            ));
        }
    }

    /**
     * Toggle the hidden flag on a review. Idempotent — hits the same
     * endpoint twice flips the state back. The aggregate course /
     * trainer rating is NOT recomputed: hiding a row is a presentation
     * decision; the underlying score stays accurate.
     */
    @PutMapping("/admin/{reviewId}/visibility")
    @Operation(summary = "Hide or unhide a review (admin)")
    public ResponseEntity<?> setVisibility(
            @PathVariable String reviewId,
            @RequestBody Map<String, Object> body) {
        Review r = reviewRepository.findById(reviewId).orElse(null);
        if (r == null) return ResponseEntity.notFound().build();
        Object v = body.get("hidden");
        boolean hidden = v instanceof Boolean ? (Boolean) v : Boolean.parseBoolean(String.valueOf(v));
        r.setIsHidden(hidden);
        reviewRepository.save(r);
        return ResponseEntity.ok(Map.of("reviewId", reviewId, "hidden", hidden));
    }

    /** Common review → response map. Pulls author name + photo + uses
     *  initials as a fallback for null photo URLs. */
    private Map<String, Object> enrich(Review r) {
        Map<String, Object> m = new HashMap<>();
        m.put("reviewId", r.getReviewId());
        m.put("studentId", r.getStudentId());
        m.put("courseRating", r.getCourseRating());
        m.put("trainerRating", r.getTrainerRating());
        m.put("courseFeedback", r.getCourseFeedback());
        m.put("trainerFeedback", r.getTrainerFeedback());
        // Legacy alias — older mobile builds read `feedback` directly.
        // Prefer course feedback so the existing course-detail UI shows
        // something meaningful until those clients update.
        m.put("feedback", r.getCourseFeedback() != null ? r.getCourseFeedback() : r.getTrainerFeedback());
        m.put("createdAt", r.getCreatedAt());
        m.put("courseId", r.getCourseId());
        m.put("trainerId", r.getTrainerId());
        studentRepository.findByStudentId(r.getStudentId()).ifPresent(s -> {
            m.put("studentName", s.getName());
            m.put("studentPhoto", s.getProfilePictureUrl());
        });
        return m;
    }

    private static String stringOrNull(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Integer intOrNull(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v).trim()); }
        catch (Exception e) { return null; }
    }
}
