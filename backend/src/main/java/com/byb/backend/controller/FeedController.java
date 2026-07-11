package com.byb.backend.controller;

import com.byb.backend.model.FeedReaction;
import com.byb.backend.service.FeedGenerationService;
import com.byb.backend.service.FeedService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Public surface for the AI-generated daily feed.
 *
 * Read endpoints take an optional `userId` query param so the response
 * can pre-populate the heart-icon state. Reactions are POST-toggle
 * with the same body shape; the response tells you the new state.
 *
 * `/generate` is a hatch we expose for manual regeneration during
 * testing and to seed the table on first deploy. Once the cron is
 * working it's effectively unused but kept around for admin tooling.
 */
@RestController
@RequestMapping("/api/feed")
@RequiredArgsConstructor
@Tag(name = "Feed", description = "AI-generated daily learning feed")
@SecurityRequirement(name = "bearerAuth")
public class FeedController {

    private final FeedService feedService;
    private final FeedGenerationService feedGenerationService;

    @GetMapping
    @Operation(summary = "Paged feed (newest first)")
    public ResponseEntity<Map<String, Object>> getFeed(
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String lang,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(feedService.getFeed(userId, lang, page, Math.min(size, 50)));
    }

    @GetMapping("/saved")
    @Operation(summary = "Posts the user has tapped Save on")
    public ResponseEntity<List<Map<String, Object>>> getSaved(
            @RequestParam String userId,
            @RequestParam(required = false) String lang) {
        return ResponseEntity.ok(feedService.getSavedPosts(userId, lang));
    }

    @PostMapping("/{postId}/like")
    @Operation(summary = "Toggle like on a post")
    public ResponseEntity<?> toggleLike(@PathVariable String postId, @RequestBody Map<String, String> body) {
        String userId = body.get("userId");
        if (userId == null) return ResponseEntity.badRequest().body(Map.of("error", "userId is required"));
        boolean liked = feedService.toggleReaction(userId, postId, FeedReaction.Type.LIKE);
        return ResponseEntity.ok(Map.of("liked", liked));
    }

    @PostMapping("/{postId}/save")
    @Operation(summary = "Toggle save on a post")
    public ResponseEntity<?> toggleSave(@PathVariable String postId, @RequestBody Map<String, String> body) {
        String userId = body.get("userId");
        if (userId == null) return ResponseEntity.badRequest().body(Map.of("error", "userId is required"));
        boolean saved = feedService.toggleReaction(userId, postId, FeedReaction.Type.SAVE);
        return ResponseEntity.ok(Map.of("saved", saved));
    }

    /**
     * Manual generation trigger. Open under bearerAuth so any logged-in
     * user can hit it during testing; should be tightened to ADMIN
     * before production launch.
     */
    @PostMapping("/generate")
    @Operation(summary = "Manually generate a batch (admin / dev seed)")
    public ResponseEntity<?> generate() {
        int n = feedGenerationService.generateBatch();
        return ResponseEntity.ok(Map.of("status", "ok", "inserted", n));
    }
}
