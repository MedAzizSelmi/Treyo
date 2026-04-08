package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Type;

import java.time.LocalDateTime;

@Entity
@Table(name = "students")
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class Student extends BaseEntity {

    @Id
    @Column(name = "student_id", length = 50)
    private String studentId;

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

    // PostgreSQL array type - using @Type annotation
    @Column(name = "primary_domains", columnDefinition = "text[]")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.ARRAY)
    private String[] primaryDomains;

    @Column(name = "specific_interests", columnDefinition = "text[]")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.ARRAY)
    private String[] specificInterests;

    @Column(name = "experience_level", length = 20)
    private String experienceLevel;

    @Column(name = "engagement_type", length = 20)
    private String engagementType;

    @Column(name = "total_courses_enrolled")
    private Integer totalCoursesEnrolled = 0;

    @Column(name = "total_courses_completed")
    private Integer totalCoursesCompleted = 0;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "cv_url")
    private String cvUrl;

    @Column(name = "professional_experience", columnDefinition = "TEXT")
    private String professionalExperience;

    @Column(name = "key_skills", columnDefinition = "text[]")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.ARRAY)
    private String[] keySkills;

    @Column(name = "education_level")
    private String educationLevel;

    @Column(name = "training_domain")
    private String trainingDomain;

    @Column(name = "is_active")
    private Boolean isActive = true;

    @Column(name = "is_verified")
    private Boolean isVerified = false;

    // Transient field for role
    @Transient
    public Role getRole() {
        return Role.STUDENT;
    }

    // Helper method to check if onboarding is complete
    @Transient
    public boolean isOnboardingComplete() {
        return primaryDomains != null && primaryDomains.length > 0 &&
                specificInterests != null && specificInterests.length > 0;
    }
}