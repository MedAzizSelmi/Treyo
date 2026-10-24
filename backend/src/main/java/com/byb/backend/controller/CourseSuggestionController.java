package com.byb.backend.controller;

import com.byb.backend.model.CourseSuggestion;
import com.byb.backend.security.AuthenticatedUser;
import com.byb.backend.security.CallerGuard;
import com.byb.backend.service.CourseSuggestionService;
import com.byb.backend.service.CourseSuggestionService.SuggestionException;
import com.byb.backend.service.CourseSuggestionService.SuggestionRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Courses learners asked for and could not find (CourseSuggestionService).
 *
 * Learners act on their own behalf only: every learner endpoint takes the
 * learner from the token and names no user. The administrators' side lives
 * under /api/admin, which SecurityConfig restricts to ADMIN.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "Course suggestions", description = "Courses learners asked for and did not find")
@SecurityRequirement(name = "bearerAuth")
public class CourseSuggestionController {

    private final CourseSuggestionService suggestions;
    private final CallerGuard callerGuard;

    /** The caller, who must be a learner: suggestions are a learner's request. */
    private String learner() {
        AuthenticatedUser me = callerGuard.current();
        if (!"STUDENT".equalsIgnoreCase(me.getRole())) throw new AccessDeniedException("Learners only");
        return me.getUserId();
    }

    @ExceptionHandler(SuggestionException.class)
    public ResponseEntity<Map<String, Object>> refused(SuggestionException e) {
        int status = "NOT_FOUND".equals(e.getCode()) ? 404 : 400;
        return ResponseEntity.status(status).body(Map.of("error", e.getCode(), "message", e.getMessage()));
    }

    // ── Learners ────────────────────────────────────────────────────────

    @PostMapping("/course-suggestions")
    @Operation(summary = "Suggest a course that is not in the catalogue")
    public ResponseEntity<Map<String, Object>> create(@RequestBody SuggestionRequest body) {
        CourseSuggestion s = suggestions.create(learner(), body);
        return ResponseEntity.ok(Map.of("suggestionId", s.getSuggestionId(), "status", s.getStatus()));
    }

    @GetMapping("/course-suggestions/similar")
    @Operation(summary = "Accepted suggestions like this one, for \"me too\"")
    public List<Map<String, Object>> similar(@RequestParam("q") String query) {
        return suggestions.similar(learner(), query);
    }

    @PostMapping("/course-suggestions/{id}/support")
    @Operation(summary = "Me too")
    public Map<String, Object> support(@PathVariable String id) {
        return Map.of("suggestionId", id, "supporters", suggestions.support(learner(), id));
    }

    @DeleteMapping("/course-suggestions/{id}/support")
    @Operation(summary = "Take back a me too")
    public ResponseEntity<Void> unsupport(@PathVariable String id) {
        suggestions.unsupport(learner(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/course-suggestions/mine")
    @Operation(summary = "What the caller suggested or backed")
    public List<Map<String, Object>> mine() {
        return suggestions.mine(learner());
    }

    @DeleteMapping("/course-suggestions/{id}")
    @Operation(summary = "Withdraw one's own open suggestion")
    public ResponseEntity<Void> withdraw(@PathVariable String id) {
        suggestions.withdraw(learner(), id);
        return ResponseEntity.noContent().build();
    }

    // ── Administrators ──────────────────────────────────────────────────

    @GetMapping("/admin/course-suggestions")
    @Operation(summary = "All suggestions, most wanted first")
    public List<Map<String, Object>> list(@RequestParam(value = "status", required = false) String status) {
        callerGuard.requireAdmin();
        return suggestions.listForAdmin(status);
    }

    /** Body: {"status": "searching" | "declined" | "rejected" | "new", "note": "…"} */
    @PutMapping("/admin/course-suggestions/{id}/status")
    @Operation(summary = "Accept, decline, or close as not a course request")
    public Map<String, Object> setStatus(@PathVariable String id, @RequestBody Map<String, String> body) {
        callerGuard.requireAdmin();
        CourseSuggestion s = suggestions.setStatus(id, body.get("status"), body.get("note"));
        return Map.of("suggestionId", s.getSuggestionId(), "status", s.getStatus());
    }

    @PutMapping("/admin/course-suggestions/{id}/note")
    @Operation(summary = "The administrators' private note")
    public Map<String, Object> setNote(@PathVariable String id, @RequestBody Map<String, String> body) {
        callerGuard.requireAdmin();
        CourseSuggestion s = suggestions.setNote(id, body.get("note"));
        return Map.of("suggestionId", s.getSuggestionId(), "status", s.getStatus());
    }

    /** Body: {"into": "SUG_…"} */
    @PostMapping("/admin/course-suggestions/{id}/merge")
    @Operation(summary = "Merge a duplicate into another suggestion")
    public Map<String, Object> merge(@PathVariable String id, @RequestBody Map<String, String> body) {
        callerGuard.requireAdmin();
        CourseSuggestion into = suggestions.merge(id, body.get("into"));
        return Map.of("suggestionId", into.getSuggestionId(), "status", into.getStatus());
    }

    /** Body: {"courseId": "CRS_…"} */
    @PostMapping("/admin/course-suggestions/{id}/publish")
    @Operation(summary = "Link the course that answers it and tell its learners")
    public Map<String, Object> publish(@PathVariable String id, @RequestBody Map<String, String> body) {
        callerGuard.requireAdmin();
        return Map.of("suggestionId", id, "told", suggestions.publish(id, body.get("courseId")));
    }

    @GetMapping("/admin/missed-searches")
    @Operation(summary = "Searches that found nothing, by at least two learners")
    public List<Map<String, Object>> missedSearches() {
        callerGuard.requireAdmin();
        return suggestions.missedSearches(LocalDateTime.now());
    }

    /** Body: {"term": "…"} */
    @PostMapping("/admin/missed-searches/hide")
    @Operation(summary = "Hide a search from the list for good")
    public ResponseEntity<Void> hide(@RequestBody Map<String, String> body) {
        String adminId = callerGuard.current().getUserId();
        callerGuard.requireAdmin();
        suggestions.hideSearch(body.get("term"), adminId);
        return ResponseEntity.noContent().build();
    }
}
