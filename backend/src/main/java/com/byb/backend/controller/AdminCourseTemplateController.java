package com.byb.backend.controller;

import com.byb.backend.dto.admin.AssignTrainersRequest;
import com.byb.backend.dto.admin.CourseTemplateRequest;
import com.byb.backend.dto.admin.CourseTemplateResponse;
import com.byb.backend.service.CourseTemplateService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Admin-only endpoints for the new course-template architecture.
 *
 *   POST   /api/admin/course-templates                  → create master content
 *   GET    /api/admin/course-templates                  → list all
 *   GET    /api/admin/course-templates/{id}             → fetch one
 *   PUT    /api/admin/course-templates/{id}             → update content
 *                                                          (cascades to all offerings)
 *   DELETE /api/admin/course-templates/{id}             → soft-delete + hide offerings
 *   POST   /api/admin/course-templates/{id}/assign      → sync the trainer roster
 *                                                          for this template
 */
@RestController
@RequestMapping("/api/admin/course-templates")
@RequiredArgsConstructor
@Tag(name = "Admin: Course Templates", description = "Admin-managed master course content")
public class AdminCourseTemplateController {

    private final CourseTemplateService templateService;

    @PostMapping
    @Operation(summary = "Create a new course template")
    public ResponseEntity<CourseTemplateResponse> create(@Valid @RequestBody CourseTemplateRequest req) {
        return ResponseEntity.ok(templateService.createTemplate(req));
    }

    @GetMapping
    @Operation(summary = "List all course templates")
    public ResponseEntity<List<CourseTemplateResponse>> list() {
        return ResponseEntity.ok(templateService.getAllTemplates());
    }

    @GetMapping("/{templateId}")
    @Operation(summary = "Get a single course template")
    public ResponseEntity<CourseTemplateResponse> get(@PathVariable String templateId) {
        return ResponseEntity.ok(templateService.getTemplate(templateId));
    }

    @PutMapping("/{templateId}")
    @Operation(summary = "Update template content (cascades to all trainer offerings)")
    public ResponseEntity<CourseTemplateResponse> update(
            @PathVariable String templateId,
            @RequestBody CourseTemplateRequest req
    ) {
        return ResponseEntity.ok(templateService.updateTemplate(templateId, req));
    }

    @DeleteMapping("/{templateId}")
    @Operation(summary = "Soft delete template and deactivate all its offerings")
    public ResponseEntity<Map<String, String>> delete(@PathVariable String templateId) {
        templateService.deleteTemplate(templateId);
        return ResponseEntity.ok(Map.of("message", "Template deleted"));
    }

    @PostMapping("/{templateId}/assign")
    @Operation(summary = "Sync the set of trainers offering this course")
    public ResponseEntity<CourseTemplateResponse> assignTrainers(
            @PathVariable String templateId,
            @Valid @RequestBody AssignTrainersRequest req
    ) {
        return ResponseEntity.ok(templateService.assignTrainers(templateId, req));
    }
}
