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

    @Column(name = "has_certificate")
    private Boolean hasCertificate = false;

    @Column(name = "min_students_required")
    private Integer minStudentsRequired = 5;

    @Column(name = "max_students_per_group")
    private Integer maxStudentsPerGroup = 30;

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