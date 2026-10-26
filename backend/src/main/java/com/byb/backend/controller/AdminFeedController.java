package com.byb.backend.controller;

import com.byb.backend.model.FeedPost;
import com.byb.backend.security.CallerGuard;
import com.byb.backend.service.TrainerIntroService;
import com.byb.backend.service.TrainerIntroService.IntroException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Administrators introducing new trainers in the learners' feed
 * (TrainerIntroService). Under /api/admin, which SecurityConfig restricts
 * to ADMIN; each endpoint checks again.
 */
@RestController
@RequestMapping("/api/admin/feed")
@RequiredArgsConstructor
@Tag(name = "Admin feed", description = "Trainer introductions in the feed")
@SecurityRequirement(name = "bearerAuth")
public class AdminFeedController {

    private final TrainerIntroService intros;
    private final CallerGuard callerGuard;

    @ExceptionHandler(IntroException.class)
    public ResponseEntity<Map<String, Object>> refused(IntroException e) {
        int status = "NOT_FOUND".equals(e.getCode()) ? 404 : 400;
        return ResponseEntity.status(status).body(Map.of("error", e.getCode(), "message", e.getMessage()));
    }

    @GetMapping("/trainer-intro/{trainerId}")
    @Operation(summary = "Whether a trainer can be introduced, and their introduction if up")
    public Map<String, Object> status(@PathVariable String trainerId) {
        callerGuard.requireAdmin();
        return intros.status(trainerId);
    }

    /** Body: {"trainerId": "TRN_…", "intro": "…"} */
    @PostMapping("/trainer-intro")
    @Operation(summary = "Introduce a trainer in the feed")
    public Map<String, Object> publish(@RequestBody Map<String, String> body) {
        callerGuard.requireAdmin();
        FeedPost p = intros.publish(body.get("trainerId"), body.get("intro"), LocalDateTime.now());
        return Map.of("postId", p.getPostId(), "pinnedUntil", p.getPinnedUntil());
    }

    @DeleteMapping("/posts/{postId}")
    @Operation(summary = "Take a trainer introduction out of the feed")
    public ResponseEntity<Void> remove(@PathVariable String postId) {
        callerGuard.requireAdmin();
        intros.remove(postId);
        return ResponseEntity.noContent().build();
    }
}
