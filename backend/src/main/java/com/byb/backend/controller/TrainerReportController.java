package com.byb.backend.controller;

import com.byb.backend.model.TrainerReport;
import com.byb.backend.service.TrainerReportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Student-facing report submission + the admin moderation queue.
 *
 * Student routes live under /api/reports (any authenticated user);
 * admin routes under /api/admin/reports, which SecurityConfig already
 * restricts to the ADMIN role via the /api/admin/** matcher.
 */
@RestController
@RequiredArgsConstructor
@Tag(name = "Trainer Reports", description = "Report a trainer / moderate reports")
@SecurityRequirement(name = "bearerAuth")
public class TrainerReportController {

    private final TrainerReportService reportService;

    /** Student submits a report about a trainer. */
    @PostMapping("/api/reports/trainer")
    @Operation(summary = "Report a trainer")
    public ResponseEntity<?> reportTrainer(@RequestBody Map<String, String> body) {
        try {
            TrainerReport saved = reportService.submit(
                    body.get("studentId"),
                    body.get("trainerId"),
                    body.get("reason"),
                    body.get("details"),
                    body.get("courseId")
            );
            return ResponseEntity.ok(Map.of(
                    "message", "Report submitted",
                    "reportId", saved.getReportId()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            // Duplicate open report — 409 so the client can show the
            // "already reported" message rather than a generic failure.
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        }
    }

    // ── Admin moderation ──

    @GetMapping("/api/admin/reports")
    @Operation(summary = "List trainer reports (optionally filtered by status)")
    public ResponseEntity<List<Map<String, Object>>> listReports(
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(reportService.getAllForAdmin(status));
    }

    @GetMapping("/api/admin/reports/open-count")
    @Operation(summary = "Number of reports still awaiting review")
    public ResponseEntity<Map<String, Long>> openCount() {
        return ResponseEntity.ok(Map.of("openCount", reportService.countOpen()));
    }

    @PutMapping("/api/admin/reports/{reportId}/status")
    @Operation(summary = "Mark a report REVIEWED or DISMISSED")
    public ResponseEntity<?> updateStatus(
            @PathVariable String reportId,
            @RequestBody Map<String, String> body) {
        try {
            reportService.updateStatus(reportId, body.get("status"), body.get("adminNote"));
            return ResponseEntity.ok(Map.of("message", "Report updated"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
