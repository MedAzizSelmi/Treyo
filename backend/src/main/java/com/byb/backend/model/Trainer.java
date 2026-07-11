package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "trainers")
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class Trainer extends BaseEntity {

    @Id
    @Column(name = "trainer_id", length = 50)
    private String trainerId;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String name;

    private String phone;
    private String address;
    private String city;
    private String state;

    @Column(name = "postal_code")
    private String postalCode;

    @Column(name = "profile_picture_url")
    private String profilePictureUrl;

    @Column(columnDefinition = "TEXT")
    private String bio;

    @Column(name = "cv_url")
    private String cvUrl;

    @Column(name = "professional_experience", columnDefinition = "TEXT")
    private String professionalExperience;

    // PostgreSQL array types - using @JdbcTypeCode annotation
    @Column(name = "specializations", columnDefinition = "text[]")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.ARRAY)
    private String[] specializations;

    @Column(columnDefinition = "text[]")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.ARRAY)
    private String[] skills;

    @Column(name = "experience_years")
    private Integer experienceYears;

    private String education;

    @Column(name = "linkedin_url")
    private String linkedinUrl;

    @Column(name = "github_url")
    private String githubUrl;

    @Column(name = "portfolio_url")
    private String portfolioUrl;

    @Column(name = "max_concurrent_groups")
    private Integer maxConcurrentGroups = 3;

    @Column(name = "hourly_rate", precision = 10, scale = 2)
    private BigDecimal hourlyRate;

    @Column(name = "average_rating", precision = 3, scale = 2)
    private BigDecimal averageRating = BigDecimal.ZERO;

    @Column(name = "total_ratings")
    private Integer totalRatings = 0;

    @Column(name = "total_students_taught")
    private Integer totalStudentsTaught = 0;

    @Column(name = "total_courses_created")
    private Integer totalCoursesCreated = 0;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "is_active")
    private Boolean isActive = true;

    @Column(name = "is_verified")
    private Boolean isVerified = false;

    @Column(name = "is_available")
    private Boolean isAvailable = true;

    /**
     * Admin's approval verdict on this trainer's onboarding submission.
     * Distinct from {@code isVerified} (email confirmation) and
     * {@code isActive} (trainer-controlled availability):
     *   - PENDING  : default at signup. Trainer can't sign in; admin
     *                hasn't reviewed their onboarding yet.
     *   - APPROVED : admin reviewed and accepted. Trainer can sign in.
     *   - REJECTED : admin declined. Trainer is told and can't sign in.
     * Stored as a String so the admin dashboard + mobile can render
     * the value without an enum-mapping layer in between.
     */
    @Column(name = "approval_status", length = 20, nullable = false)
    private String approvalStatus = "PENDING";

    /** Free-text reason an admin can attach to a rejection so the
     *  notification email can include "what to improve". Optional. */
    @Column(name = "approval_note", columnDefinition = "TEXT")
    private String approvalNote;

    /** Timestamp of the most recent approval / rejection decision. */
    @Column(name = "approval_decided_at")
    private LocalDateTime approvalDecidedAt;

    /** Trainer-chosen display currency (ISO-4217). Used as the default
     *  currency when the trainer creates a new course and as the label
     *  when the app shows earnings or revenue on their side. */
    @Column(name = "preferred_currency", length = 8)
    private String preferredCurrency = "TND";

    // Transient field for role
    @Transient
    public Role getRole() {
        return Role.TRAINER;
    }

    // Helper method to check if profile setup is complete (3-page onboarding)
    @Transient
    public boolean isProfileComplete() {
        boolean page1 = phone != null && address != null && city != null &&
                state != null && postalCode != null;
        boolean page2 = specializations != null && specializations.length > 0 &&
                experienceYears != null && education != null &&
                skills != null && skills.length > 0;
        // profilePictureUrl is optional — only bio is required to complete page 3
        boolean page3 = bio != null;

        return page1 && page2 && page3;
    }
}