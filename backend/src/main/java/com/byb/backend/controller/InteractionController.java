package com.byb.backend.controller;

import com.byb.backend.dto.course.CourseResponse;
import com.byb.backend.service.CourseService;
import com.byb.backend.service.InteractionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/interactions")
@RequiredArgsConstructor
@Tag(name = "Interactions", description = "Student-course interactions")
@SecurityRequirement(name = "bearerAuth")
public class InteractionController {

    private final InteractionService interactionService;
    private final CourseService courseService;

    @PostMapping("/interested")
    @Operation(summary = "Student clicks 'Interested' button")
    public ResponseEntity<Void> markInterested(
            @RequestParam String studentId,
            @RequestParam String courseId) {
        interactionService.trackInterest(studentId, courseId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/view")
    @Operation(summary = "Track course view")
    public ResponseEntity<Void> trackView(
            @RequestParam String studentId,
            @RequestParam String courseId) {
        interactionService.trackView(studentId, courseId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/course/{courseId}/interested-count")
    @Operation(summary = "Get count of interested students")
    public ResponseEntity<Long> getInterestedCount(@PathVariable String courseId) {
        long count = interactionService.getInterestedStudentsCount(courseId);
        return ResponseEntity.ok(count);
    }

    @DeleteMapping("/interested")
    @Operation(summary = "Cancel a previously expressed interest")
    public ResponseEntity<Void> cancelInterest(
            @RequestParam String studentId,
            @RequestParam String courseId) {
        interactionService.cancelInterest(studentId, courseId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/status")
    @Operation(summary = "Check if student has expressed interest and/or is enrolled")
    public ResponseEntity<Map<String, Boolean>> getInterestStatus(
            @RequestParam String studentId,
            @RequestParam String courseId) {
        return ResponseEntity.ok(Map.of(
                "interested", interactionService.hasExpressedInterest(studentId, courseId),
                "enrolled", interactionService.isEnrolled(studentId, courseId)
        ));
    }

    // ─── Favorites ───────────────────────────────────────────────────

    /**
     * Toggle a student's "saved" state on a course. Returns the new state
     * so the client can update the heart icon without an extra round-trip.
     */
    @PostMapping("/saved")
    @Operation(summary = "Toggle a course in the student's favourites")
    public ResponseEntity<Map<String, Boolean>> toggleSaved(
            @RequestParam String studentId,
            @RequestParam String courseId) {
        boolean nowSaved = interactionService.toggleSaved(studentId, courseId);
        return ResponseEntity.ok(Map.of("saved", nowSaved));
    }

    /**
     * Fast "is this saved?" check — used by course-detail to render the
     * heart icon filled vs. outlined on first load.
     */
    @GetMapping("/saved/status")
    @Operation(summary = "Check if a single course is in the student's favourites")
    public ResponseEntity<Map<String, Boolean>> isSaved(
            @RequestParam String studentId,
            @RequestParam String courseId) {
        return ResponseEntity.ok(Map.of(
                "saved", interactionService.isSaved(studentId, courseId)
        ));
    }

    /**
     * Full list of saved courses with all their details — the favourites
     * screen renders cards directly from this response. We join here
     * (server-side) instead of returning IDs because mobile users with
     * lots of saves would otherwise need N+1 requests to render the list.
     */
    @GetMapping("/saved/student/{studentId}")
    @Operation(summary = "List the student's favourite courses with full details")
    public ResponseEntity<List<CourseResponse>> getSavedCourses(@PathVariable String studentId) {
        return ResponseEntity.ok(courseService.getSavedCoursesForStudent(studentId));
    }
}