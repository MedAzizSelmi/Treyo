package com.byb.backend.controller;

import com.byb.backend.model.FeedReaction;
import com.byb.backend.security.CallerGuard;
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
 * Whatever `userId` the client sends, it must be the caller's own: it
 * was trusted, so anyone could like and save posts as anyone, or read
 * what another user had saved.
 *
 * `/generate` seeds the table on first deploy and backs the empty-feed
 * button in the app; see generate() for who may run it when.
 */
@RestController
@RequestMapping("/api/feed")
@RequiredArgsConstructor
@Tag(name = "Feed", description = "AI-generated daily learning feed")
@SecurityRequirement(name = "bearerAuth")
public class FeedController {

    private final FeedService feedService;
    private final FeedGenerationService feedGenerationService;
    private final CallerGuard callerGuard;

    @GetMapping
    @Operation(summary = "Paged feed (newest first)")
    public ResponseEntity<Map<String, Object>> getFeed(
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String lang,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        userId = callerGuard.selfOrAdmin(userId);
        return ResponseEntity.ok(feedService.getFeed(userId, lang, page, Math.min(size, 50)));
    }

    @GetMapping("/saved")
    @Operation(summary = "Posts the user has tapped Save on")
    public ResponseEntity<List<Map<String, Object>>> getSaved(
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String lang) {
        userId = callerGuard.selfOrAdmin(userId);
        return ResponseEntity.ok(feedService.getSavedPosts(userId, lang));
    }

    @PostMapping("/{postId}/like")
    @Operation(summary = "Toggle like on a post")
    public ResponseEntity<?> toggleLike(@PathVariable String postId, @RequestBody(required = false) Map<String, String> body) {
        String userId = callerGuard.self(body == null ? null : body.get("userId"));
        boolean liked = feedService.toggleReaction(userId, postId, FeedReaction.Type.LIKE);
        return ResponseEntity.ok(Map.of("liked", liked));
    }

    @PostMapping("/{postId}/save")
    @Operation(summary = "Toggle save on a post")
    public ResponseEntity<?> toggleSave(@PathVariable String postId, @RequestBody(required = false) Map<String, String> body) {
        String userId = callerGuard.self(body == null ? null : body.get("userId"));
        boolean saved = feedService.toggleReaction(userId, postId, FeedReaction.Type.SAVE);
        return ResponseEntity.ok(Map.of("saved", saved));
    }

    /**
     * Manual generation trigger.
     *
     * Administrators generate a batch whenever they ask. Everyone else
     * gets the daily job's rule: a batch only if today has none yet. Each
     * batch is a paid Gemini call, and this was open to every account, so
     * one learner could run up the bill and flood the feed. Admin-only
     * would have been simpler but would leave the app's empty-feed button
     * doing nothing for the people who see it.
     */
    @PostMapping("/generate")
    @Operation(summary = "Generate a batch (admins always; others only if today has none)")
    public ResponseEntity<?> generate() {
        int n = callerGuard.isAdmin()
                ? feedGenerationService.generateBatch()
                : feedGenerationService.generateIfTodayIsEmpty();
        return ResponseEntity.ok(Map.of("status", "ok", "inserted", n));
    }
}
