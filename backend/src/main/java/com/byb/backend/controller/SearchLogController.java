package com.byb.backend.controller;

import com.byb.backend.model.SearchLog;
import com.byb.backend.repository.SearchLogRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Records the student's queries so the ML recommendation engine can
 * use them as a "current interest" signal. The mobile course-search
 * screen fires a fire-and-forget POST here on each recorded search.
 *
 * No rate limiting — searches are cheap and the index on student_id
 * keeps reads fast even with a lot of rows. We could deduplicate
 * client-side (don't log the same query twice in a row), but the
 * data is more honest if every actual search is captured.
 */
@RestController
@RequestMapping("/api/searches")
@RequiredArgsConstructor
@Tag(name = "Search Logs", description = "Records student queries for ML recs")
@SecurityRequirement(name = "bearerAuth")
public class SearchLogController {

    private final SearchLogRepository searchLogRepository;

    /**
     * Body:
     *   {
     *     "studentId": "...",
     *     "query": "node.js fundamentals",
     *     "clickedCourseId": "..." | null
     *   }
     *
     * Returns 200 silently — the caller never blocks on this and the
     * recommendation engine will pick it up on its next model refresh.
     */
    @PostMapping("/log")
    @Operation(summary = "Record a search query (drives ML recommendations)")
    public ResponseEntity<?> log(@RequestBody Map<String, Object> body) {
        String studentId = stringOrNull(body.get("studentId"));
        String queryText = stringOrNull(body.get("query"));
        String clickedCourseId = stringOrNull(body.get("clickedCourseId"));

        if (studentId == null || queryText == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "studentId and query are required"));
        }
        if (queryText.length() > 200) queryText = queryText.substring(0, 200);

        SearchLog log = new SearchLog();
        log.setSearchId("sl_" + UUID.randomUUID().toString().replace("-", "").substring(0, 18));
        log.setStudentId(studentId);
        log.setQuery(queryText);
        log.setClickedCourseId(clickedCourseId);
        searchLogRepository.save(log);

        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    private static String stringOrNull(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
