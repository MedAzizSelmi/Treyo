package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * A skill a learner can choose to develop at onboarding, under one of the
 * onboarding fields (SkillOptionService.FIELDS).
 *
 * Administrators manage the list — it used to be written into the app,
 * so nothing could be added as fields moved on. {@link #name} is what a
 * learner's profile stores, as before (students.specific_interests), so
 * it is what the recommendation engine reads; the translations are only
 * how the app shows it. A skill some learner chose is hidden rather than
 * deleted, so their profile keeps meaning something.
 */
@Entity
@Table(name = "skill_options", indexes = @Index(name = "idx_skill_options_field", columnList = "field"))
@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class SkillOption extends BaseEntity {

    @Id
    @Column(name = "skill_id", length = 50)
    private String skillId;

    /** The onboarding field it belongs to: informatique, marketing… */
    @Column(name = "field", length = 30)
    private String field;

    /** The name stored on learners' profiles. */
    @Column(name = "name", length = 100)
    private String name;

    @Column(name = "name_fr", length = 100)
    private String nameFr;

    @Column(name = "name_ar", length = 100)
    private String nameAr;

    @Column(name = "name_es", length = 100)
    private String nameEs;

    /** Hidden skills are not offered to new learners. */
    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "sort_order")
    private Integer sortOrder;
}
