package com.byb.backend.controller;

import com.byb.backend.service.InteractionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/interactions")
@RequiredArgsConstructor
@Tag(name = "Interactions", description = "Student-course interactions")
@SecurityRequirement(name = "bearerAuth")
public class InteractionController {

    private final InteractionService interactionService;

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
}