package com.byb.backend.controller;

import com.byb.backend.model.GroupReport;
import com.byb.backend.security.AuthenticatedUser;
import com.byb.backend.security.CallerGuard;
import com.byb.backend.service.GroupReportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * The trainer's end-of-course report (GroupReportService).
 *
 * Read by the group's trainer and by administrators; sent by the trainer,
 * once; annotated by administrators. Identity comes from the token: the
 * group's trainer is checked against the caller, never taken from the
 * request.
 */
@RestController
@RequestMapping("/api/group-reports")
@RequiredArgsConstructor
@Tag(name = "Group reports", description = "End-of-course reports and the attestations they decide")
public class GroupReportController {

    private final GroupReportService reportService;
    private final CallerGuard callerGuard;

    @GetMapping("/mine/pending")
    @Operation(summary = "The signed-in trainer's finished groups still waiting for a report")
    public ResponseEntity<java.util.List<Map<String, Object>>> pending() {
        return ResponseEntity.ok(reportService.pendingFor(callerGuard.current().getUserId()));
    }

    @GetMapping("/group/{groupId}")
    @Operation(summary = "The report form for a group, or its report once sent")
    public ResponseEntity<Map<String, Object>> view(@PathVariable String groupId) {
        AuthenticatedUser caller = callerGuard.current();
        return ResponseEntity.ok(reportService.view(groupId, caller.getUserId(), caller.isAdmin()));
    }

    @PostMapping("/group/{groupId}")
    @Operation(summary = "Send the end-of-course report for a group (its trainer, once)")
    public ResponseEntity<?> submit(@PathVariable String groupId,
                                    @RequestBody GroupReportService.Submission body) {
        AuthenticatedUser caller = callerGuard.current();
        try {
            GroupReport r = reportService.submit(groupId, caller.getUserId(), body);
            return ResponseEntity.ok(Map.of("reportId", r.getReportId(), "message", "Report sent"));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(Map.of("error", "Already sent", "message", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid report", "message", e.getMessage()));
        }
    }

    @PutMapping("/{reportId}/note")
    @Operation(summary = "An administrator's internal note on a report")
    public ResponseEntity<?> note(@PathVariable String reportId, @RequestBody Map<String, String> body) {
        callerGuard.requireAdmin();
        try {
            GroupReport r = reportService.setAdminNote(reportId, body == null ? null : body.get("note"));
            return ResponseEntity.ok(Map.of("reportId", r.getReportId(),
                    "adminNote", r.getAdminNote() == null ? "" : r.getAdminNote()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid note", "message", e.getMessage()));
        }
    }
}
