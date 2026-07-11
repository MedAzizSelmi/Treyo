package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "courses")
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class Course extends BaseEntity {

    @Id
    @Column(name = "course_id", length = 50)
    private String courseId;

    @Column(name = "trainer_id", length = 50, nullable = false)
    private String trainerId;

    /**
     * Link back to the admin-owned CourseTemplate that this offering was
     * created from. When admin edits the template, the shared content fields
     * on this row are kept in sync. Null only for legacy rows created before
     * the template system existed.
     */
    @Column(name = "template_id", length = 50)
    private String templateId;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String description;

    @Column(nullable = false, length = 100)
    private String domain;

    @Column(name = "specific_topic", nullable = false, length = 200)
    private String specificTopic;

    @Column(length = 20)
    private String level; // beginner, intermediate, expert

    @Column(name = "duration_hours")
    private Integer durationHours;

    @Column(length = 50)
    private String language = "French";

    @Column(length = 50)
    private String format; // Video, Live Sessions, Hybrid, Text-based, Project-based

    @Column(columnDefinition = "TEXT")
    private String prerequisites;

    @Column(name = "learning_outcomes", columnDefinition = "text[]")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.ARRAY)
    private String[] learningOutcomes;

    @Column(precision = 10, scale = 2)
    private BigDecimal price = BigDecimal.ZERO;

    @Column(length = 10)
    private String currency = "TND";

    /**
     * How much the trainer earns per day they train this course, in
     * the same currency as {@link #currency}. Admin-set from the
     * courses management page. Null = "not set yet"; the trainer's
     * earnings screen will simply skip that course's sessions until
     * the admin sets a value.
     */
    @Column(name = "trainer_daily_revenue", precision = 10, scale = 2)
    private BigDecimal trainerDailyRevenue;

    @Column(name = "has_certificate")
    private Boolean hasCertificate = false;

    @Column(name = "min_students_required")
    private Integer minStudentsRequired = 5;

    @Column(name = "max_students_per_group")
    private Integer maxStudentsPerGroup = 30;

    /**
     * Maximum number of parallel groups the trainer is willing to run for this
     * course. Once this many groups have been formed, the course stops accepting
     * new enrollments. Defaults to 1 — most trainers run a single cohort.
     */
    @Column(name = "max_groups_allowed")
    private Integer maxGroupsAllowed = 1;

    @Column(name = "current_groups_count")
    private Integer currentGroupsCount = 0;

    @Column(name = "average_rating", precision = 3, scale = 2)
    private BigDecimal averageRating = BigDecimal.ZERO;

    @Column(name = "total_ratings")
    private Integer totalRatings = 0;

    @Column(name = "total_enrolled")
    private Integer totalEnrolled = 0;

    @Column(name = "total_completed")
    private Integer totalCompleted = 0;

    @Column(name = "completion_rate", precision = 5, scale = 2)
    private BigDecimal completionRate = BigDecimal.ZERO;

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    @Column(name = "is_active")
    private Boolean isActive = true;

    @Column(name = "is_published")
    private Boolean isPublished = false;

    /**
     * Reference to the admin-managed module (category) this course
     * belongs to. Set by the trainer when creating the course from a
     * picker of active modules. Null on legacy rows created before
     * the module system landed.
     */
    @Column(name = "module_id", length = 50)
    private String moduleId;

    /**
     * Public URL to the training material the trainer uploaded (PDF,
     * PPT, ZIP, etc.). The admin previews this during approval; it's
     * NOT shown to students on the public course page. Stored as
     * whatever /files/upload returns — usually a relative path like
     * "/files/course-materials/xyz.pdf".
     */
    @Column(name = "material_url", length = 500)
    private String materialUrl;

    /** Original filename of the uploaded material — used for the
     *  download link label so admins see "syllabus.pdf" rather than
     *  the mangled storage filename. */
    @Column(name = "material_name", length = 255)
    private String materialName;

    /**
     * Admin's approval verdict for a trainer-submitted course.
     *   PENDING  — waiting for admin review, invisible to students.
     *   APPROVED — visible everywhere (search, home recs, browse).
     *   REJECTED — hidden from students; trainer sees a "rejected"
     *              badge in their courses list.
     * Legacy rows (admin-assigned templates) default to APPROVED so
     * the switchover doesn't hide historical courses.
     */
    @Column(name = "approval_status", length = 20, nullable = false)
    private String approvalStatus = "APPROVED";

    /** Optional note the admin attached when rejecting. Emailed to
     *  the trainer verbatim + surfaced on the trainer's course card
     *  so they know what to fix. */
    @Column(name = "approval_note", columnDefinition = "TEXT")
    private String approvalNote;

    @Column(name = "approval_decided_at")
    private LocalDateTime approvalDecidedAt;

    // Helper method to check if course can form a group
    @Transient
    public boolean canFormGroup(int interestedCount) {
        return interestedCount >= minStudentsRequired;
    }

    // Helper method to check if group is full
    @Transient
    public boolean isGroupFull(int enrolledCount) {
        return enrolledCount >= maxStudentsPerGroup;
    }
}