package com.byb.backend.controller;

import com.byb.backend.model.CourseModule;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.ModuleRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Modules — the admin-owned course categories trainers pick from
 * when creating a new course.
 *
 * Public GET list is used by:
 *   - trainer's course-create screen (picker)
 *   - student's browse-by-category future UI
 *
 * Admin-only routes live under /admin/modules and require the ADMIN
 * role via SecurityConfig's requestMatchers rule.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "Modules", description = "Admin-managed course categories")
@SecurityRequirement(name = "bearerAuth")
public class ModuleController {

    private final ModuleRepository moduleRepository;
    private final CourseRepository courseRepository;

    /** Public — every logged-in user can read the module list. Used
     *  by the trainer picker + potential student browse UI. */
    @GetMapping("/modules")
    @Operation(summary = "Active modules for the trainer picker + student browse")
    public ResponseEntity<List<Map<String, Object>>> listActive() {
        return ResponseEntity.ok(moduleRepository.findActiveOrdered().stream()
                .map(this::toMap).toList());
    }

    /** Admin — sees archived rows too and gets the course count so the
     *  UI can show "12 courses" on each module card. */
    @GetMapping("/admin/modules")
    @Operation(summary = "All modules (admin)")
    public ResponseEntity<List<Map<String, Object>>> listAllAdmin() {
        return ResponseEntity.ok(moduleRepository.findAllForAdmin().stream()
                .map(m -> {
                    Map<String, Object> map = toMap(m);
                    // Course count — approved + pending combined so the
                    // admin sees the true footprint of the category.
                    map.put("courseCount", courseRepository.countByModuleId(m.getModuleId()));
                    return map;
                }).toList());
    }

    /**
     * Create a module. Body: { name (required), description?,
     * icon?, accentColor?, sortOrder? }. Rejects duplicate names
     * via the unique index on `name`.
     */
    @PostMapping("/admin/modules")
    @Operation(summary = "Create a module (admin)")
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        String name = stringOrNull(body.get("name"));
        if (name == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "name is required"));
        }
        CourseModule m = new CourseModule();
        m.setModuleId("mod_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        m.setName(name);
        m.setDescription(stringOrNull(body.get("description")));
        m.setIcon(stringOrNull(body.get("icon")));
        m.setAccentColor(stringOrNull(body.get("accentColor")));
        Object sortObj = body.get("sortOrder");
        m.setSortOrder(sortObj instanceof Number ? ((Number) sortObj).intValue() : 0);
        m.setIsActive(true);
        try {
            moduleRepository.save(m);
        } catch (Exception e) {
            return ResponseEntity.status(400).body(Map.of("error", "Module name already exists"));
        }
        return ResponseEntity.ok(toMap(m));
    }

    /** Partial update — only the fields present in the body change. */
    @PutMapping("/admin/modules/{moduleId}")
    @Operation(summary = "Update a module (admin)")
    public ResponseEntity<?> update(@PathVariable String moduleId, @RequestBody Map<String, Object> body) {
        CourseModule m = moduleRepository.findById(moduleId).orElse(null);
        if (m == null) return ResponseEntity.notFound().build();

        if (body.containsKey("name")) m.setName(stringOrNull(body.get("name")));
        if (body.containsKey("description")) m.setDescription(stringOrNull(body.get("description")));
        if (body.containsKey("icon")) m.setIcon(stringOrNull(body.get("icon")));
        if (body.containsKey("accentColor")) m.setAccentColor(stringOrNull(body.get("accentColor")));
        if (body.containsKey("sortOrder")) {
            Object v = body.get("sortOrder");
            m.setSortOrder(v instanceof Number ? ((Number) v).intValue() : 0);
        }
        if (body.containsKey("isActive")) {
            Object v = body.get("isActive");
            m.setIsActive(v instanceof Boolean ? (Boolean) v : Boolean.parseBoolean(String.valueOf(v)));
        }
        moduleRepository.save(m);
        return ResponseEntity.ok(toMap(m));
    }

    /**
     * Archive (soft-delete) a module. Hard delete refuses if any
     * course still references the module — otherwise those rows
     * would orphan. Soft delete just flips isActive so the picker
     * drops it but historical data is preserved.
     */
    @DeleteMapping("/admin/modules/{moduleId}")
    @Operation(summary = "Archive a module (admin, soft delete)")
    public ResponseEntity<?> archive(@PathVariable String moduleId) {
        CourseModule m = moduleRepository.findById(moduleId).orElse(null);
        if (m == null) return ResponseEntity.notFound().build();
        m.setIsActive(false);
        moduleRepository.save(m);
        return ResponseEntity.ok(Map.of("moduleId", moduleId, "archived", true));
    }

    private Map<String, Object> toMap(CourseModule m) {
        Map<String, Object> map = new HashMap<>();
        map.put("moduleId", m.getModuleId());
        map.put("name", m.getName());
        map.put("description", m.getDescription());
        map.put("icon", m.getIcon());
        map.put("accentColor", m.getAccentColor());
        map.put("sortOrder", m.getSortOrder());
        map.put("isActive", m.getIsActive());
        map.put("createdAt", m.getCreatedAt());
        return map;
    }

    private static String stringOrNull(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
