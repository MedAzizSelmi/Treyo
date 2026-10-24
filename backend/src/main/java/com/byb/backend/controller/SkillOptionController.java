package com.byb.backend.controller;

import com.byb.backend.model.SkillOption;
import com.byb.backend.security.CallerGuard;
import com.byb.backend.service.SkillOptionService;
import com.byb.backend.service.SkillOptionService.SkillException;
import com.byb.backend.service.SkillOptionService.SkillRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * The skills learners choose from at onboarding (SkillOptionService). Any
 * signed-in user can read the offered ones; administrators manage them
 * under /api/admin, which SecurityConfig restricts to ADMIN.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "Skills", description = "Skills learners choose to develop")
@SecurityRequirement(name = "bearerAuth")
public class SkillOptionController {

    private final SkillOptionService skills;
    private final CallerGuard callerGuard;

    @ExceptionHandler(SkillException.class)
    public ResponseEntity<Map<String, Object>> refused(SkillException e) {
        int status = "NOT_FOUND".equals(e.getCode()) ? 404 : 400;
        return ResponseEntity.status(status).body(Map.of("error", e.getCode(), "message", e.getMessage()));
    }

    /** ?fields=informatique,design — the skills offered under those fields. */
    @GetMapping("/skills")
    @Operation(summary = "Skills offered under some onboarding fields")
    public List<Map<String, Object>> offered(@RequestParam("fields") String fields) {
        return skills.forLearner(Arrays.stream(fields.split(",")).map(String::trim).filter(f -> !f.isEmpty()).toList());
    }

    /** Every offered skill, for the suggestions under the CV screen's skills box. */
    @GetMapping("/skills/suggestions")
    @Operation(summary = "All offered skills, to suggest while typing")
    public List<Map<String, Object>> suggestions() {
        return skills.suggestions();
    }

    @GetMapping("/admin/skills")
    @Operation(summary = "Every skill, with how many learners chose it")
    public Map<String, Object> list() {
        callerGuard.requireAdmin();
        return skills.listForAdmin();
    }

    @PostMapping("/admin/skills")
    @Operation(summary = "Add a skill")
    public Map<String, Object> create(@RequestBody SkillRequest body) {
        callerGuard.requireAdmin();
        SkillOption s = skills.create(body);
        return Map.of("skillId", s.getSkillId(), "name", s.getName());
    }

    @PutMapping("/admin/skills/{id}")
    @Operation(summary = "Edit, translate, hide or show a skill")
    public Map<String, Object> update(@PathVariable String id, @RequestBody SkillRequest body) {
        callerGuard.requireAdmin();
        SkillOption s = skills.update(id, body);
        return Map.of("skillId", s.getSkillId(), "name", s.getName());
    }

    @DeleteMapping("/admin/skills/{id}")
    @Operation(summary = "Delete a skill no learner chose")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        callerGuard.requireAdmin();
        skills.delete(id);
        return ResponseEntity.noContent().build();
    }
}
