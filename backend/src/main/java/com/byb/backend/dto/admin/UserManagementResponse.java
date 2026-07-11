package com.byb.backend.dto.admin;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * User details for admin dashboard
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserManagementResponse {

    private String userId;
    private String name;
    private String email;
    private String userType; // STUDENT or TRAINER
    private Boolean isActive;
    private Boolean isVerified;
    private LocalDateTime registeredAt;
    private LocalDateTime lastLoginAt;

    // Student-specific
    private String[] primaryDomains;
    private String[] specificInterests;
    private String experienceLevel;

    // Trainer-specific
    private String[] specializations;
    private String[] skills;
    private Integer experienceYears;
    private Double rating;
    private Boolean profileComplete;
    private String verificationStatus; // PENDING, APPROVED, REJECTED
    // Detail fields used by the admin "Pending approval" review pane
    // so the reviewer can read the trainer's full onboarding submission
    // without a second round-trip.
    private String bio;
    private String education;
    private String professionalExperience;
    private String phone;
    private String address;
    private String city;
    private String state;
    private String postalCode;
    private String linkedinUrl;
    private String portfolioUrl;
    private String githubUrl;
    /** Uploaded CV (if the trainer attached one). Path is relative —
     *  prefix with API_BASE_URL on the client to download. */
    private String cvUrl;
    private String profilePictureUrl;
    /** Set when the trainer was approved/rejected. */
    private LocalDateTime approvalDecidedAt;
    /** Optional reason an admin attached when rejecting. */
    private String approvalNote;

    // Activity
    private Long coursesCreated; // trainers
    private Long enrollments; // students
    private Long messagesCount;
    private Long interactionsCount;
}