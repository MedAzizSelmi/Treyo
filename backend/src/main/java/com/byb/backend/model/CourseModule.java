package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * A module is an admin-managed category that groups courses.
 *
 * Examples: "Web Development", "Marketing", "Design", "Data Science".
 * Admins own the list; trainers pick from it when creating a course.
 * Every published course belongs to exactly one module (see
 * {@link Course#moduleId}).
 *
 * The name is intentionally the top-level classifier — the per-course
 * `domain` field on Course stays untouched for backwards compat and
 * finer-grained tagging.
 */
@Entity
@Table(
        name = "modules",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_modules_name", columnNames = "name")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class CourseModule extends BaseEntity {

    @Id
    @Column(name = "module_id", length = 50)
    private String moduleId;

    @Column(name = "name", length = 120, nullable = false)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /** Optional Ionicon name the mobile UI can render as the module's
     *  visual identity — e.g. "code-slash-outline" for web dev. */
    @Column(name = "icon", length = 60)
    private String icon;

    /** Optional hex accent colour for the module card. */
    @Column(name = "accent_color", length = 16)
    private String accentColor;

    /** Ordering hint on listings. Lower = higher up. Ties break on
     *  name, alphabetically. */
    @Column(name = "sort_order")
    private Integer sortOrder = 0;

    /** Soft-delete flag. False = hidden from trainer picker and public
     *  browse. Existing courses in the module aren't affected — we
     *  just stop showing the module as a target for new courses. */
    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;
}
