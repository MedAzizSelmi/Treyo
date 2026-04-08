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

    // Activity
    private Long coursesCreated; // trainers
    private Long enrollments; // students
    private Long messagesCount;
    private Long interactionsCount;
}