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
        boolean page3 = profilePictureUrl != null && bio != null;

        return page1 && page2 && page3;
    }
}