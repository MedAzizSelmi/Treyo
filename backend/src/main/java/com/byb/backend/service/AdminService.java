package com.byb.backend.service;

import com.byb.backend.dto.admin.CourseManagementResponse;
import com.byb.backend.dto.admin.DashboardStatsResponse;
import com.byb.backend.dto.admin.SendNotificationRequest;
import com.byb.backend.dto.admin.UserManagementResponse;
import com.byb.backend.model.*;
import com.byb.backend.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminService {

    private final StudentRepository studentRepository;
    private final TrainerRepository trainerRepository;
    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final GroupRepository groupRepository;
    private final InteractionRepository interactionRepository;
    private final MessageRepository messageRepository;
    private final AdminRepository adminRepository;
    private final NotificationRepository notificationRepository;
    // Used to email the trainer when their approval verdict lands.
    private final EmailService emailService;
    // Reused for the CourseResponse mapper so the admin pending-courses
    // list and the mobile trainer's own list return identical shapes.
    private final CourseService courseService;
    private final AdminGroupFormationService groupFormationService;
    private final PasswordEncoder passwordEncoder;

    /**
     * Get dashboard overview statistics
     */
    public DashboardStatsResponse getDashboardStats() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime weekAgo = now.minusWeeks(1);
        LocalDateTime monthAgo = now.minusMonths(1);
        LocalDateTime todayStart = now.toLocalDate().atStartOfDay();

        // User statistics
        long totalStudents = studentRepository.count();
        long totalTrainers = trainerRepository.count();
        long totalUsers = totalStudents + totalTrainers;

        long newStudentsThisWeek = studentRepository.countByCreatedAtAfter(weekAgo);
        long newTrainersThisWeek = trainerRepository.countByCreatedAtAfter(weekAgo);
        long newUsersThisWeek = newStudentsThisWeek + newTrainersThisWeek;

        long newStudentsThisMonth = studentRepository.countByCreatedAtAfter(monthAgo);
        long newTrainersThisMonth = trainerRepository.countByCreatedAtAfter(monthAgo);
        long newUsersThisMonth = newStudentsThisMonth + newTrainersThisMonth;

        // Active users today = anyone whose lastLoginAt is past midnight today.
        // AuthService updates lastLoginAt on every successful login, so this
        // reflects "people who signed in at least once today" rather than the
        // looser "people who have any activity at all". For a per-session
        // metric we'd add a sessions table; this is enough for the dashboard.
        long activeStudentsToday = studentRepository.countByLastLoginAtAfter(todayStart);
        long activeTrainersToday = trainerRepository.countByLastLoginAtAfter(todayStart);
        long activeUsersToday = activeStudentsToday + activeTrainersToday;

        // Course statistics
        long totalCourses = courseRepository.count();
        long publishedCourses = courseRepository.countByIsPublishedAndIsActive(true, true);
        long pendingCourses = courseRepository.countByIsPublishedAndIsActive(false, true);
        long coursesCreatedThisWeek = courseRepository.countByCreatedAtAfter(weekAgo);

        // Enrollment statistics
        long totalEnrollments = enrollmentRepository.count();
        long activeEnrollments = enrollmentRepository.countByEnrollmentStatus("active");
        long completedEnrollments = enrollmentRepository.countByEnrollmentStatus("completed");
        long enrollmentsThisWeek = enrollmentRepository.countByCreatedAtAfter(weekAgo);

        // Group statistics
        long totalGroups = groupRepository.count();
        long activeGroups = groupRepository.countByGroupStatus("active");
        Double averageGroupSize = groupRepository.getAverageGroupSize();

        // Interaction statistics
        long totalInteractions = interactionRepository.count();
        long interactionsToday = interactionRepository.countByCreatedAtAfter(todayStart);

        // Message statistics
        long totalMessages = messageRepository.count();
        long messagesToday = messageRepository.countByCreatedAtAfter(todayStart);

        // Financial statistics (if implemented)
        BigDecimal totalRevenue = courseRepository.getTotalRevenue();
        BigDecimal revenueThisMonth = courseRepository.getRevenueAfter(monthAgo);
        BigDecimal averageCoursePrice = courseRepository.getAverageCoursePrice();

        return DashboardStatsResponse.builder()
                .totalUsers(totalUsers)
                .totalStudents(totalStudents)
                .totalTrainers(totalTrainers)
                .activeUsersToday(activeUsersToday)
                .newUsersThisWeek(newUsersThisWeek)
                .newUsersThisMonth(newUsersThisMonth)
                .newStudentsThisWeek(newStudentsThisWeek)
                .newTrainersThisWeek(newTrainersThisWeek)
                .totalCourses(totalCourses)
                .publishedCourses(publishedCourses)
                .pendingCourses(pendingCourses)
                .coursesCreatedThisWeek(coursesCreatedThisWeek)
                .totalEnrollments(totalEnrollments)
                .activeEnrollments(activeEnrollments)
                .completedEnrollments(completedEnrollments)
                .enrollmentsThisWeek(enrollmentsThisWeek)
                .totalGroups(totalGroups)
                .activeGroups(activeGroups)
                .averageGroupSize(averageGroupSize)
                .totalInteractions(totalInteractions)
                .interactionsToday(interactionsToday)
                .totalMessages(totalMessages)
                .messagesToday(messagesToday)
                .totalRevenue(totalRevenue)
                .revenueThisMonth(revenueThisMonth)
                .averageCoursePrice(averageCoursePrice)
                .systemStatus("HEALTHY")
                .build();
    }

    /**
     * Get all users (students + trainers)
     */
    public List<UserManagementResponse> getAllUsers() {
        List<UserManagementResponse> allUsers = studentRepository.findAll().stream()
                .map(this::mapStudentToUserResponse)
                .collect(Collectors.toList());

        allUsers.addAll(trainerRepository.findAll().stream()
                .map(this::mapTrainerToUserResponse)
                .collect(Collectors.toList()));

        return allUsers;
    }

    /**
     * Get all students
     */
    public List<UserManagementResponse> getAllStudents() {
        return studentRepository.findAll().stream()
                .map(this::mapStudentToUserResponse)
                .collect(Collectors.toList());
    }

    /**
     * Get all trainers
     */
    public List<UserManagementResponse> getAllTrainers() {
        return trainerRepository.findAll().stream()
                .map(this::mapTrainerToUserResponse)
                .collect(Collectors.toList());
    }

    /**
     * Trainers waiting for an approval decision.
     * Filters by the dedicated approvalStatus field rather than
     * isVerified (which now means email-confirmed, not admin-approved).
     */
    public List<UserManagementResponse> getPendingTrainers() {
        return trainerRepository.findAll().stream()
                .filter(t -> "PENDING".equalsIgnoreCase(t.getApprovalStatus()))
                .map(this::mapTrainerToUserResponse)
                .collect(Collectors.toList());
    }

    /**
     * Activate/Deactivate user
     */
    @Transactional
    public void toggleUserStatus(String userId, String userType) {
        if ("student".equalsIgnoreCase(userType)) {
            studentRepository.findById(userId).ifPresent(student -> {
                student.setIsActive(!student.getIsActive());
                studentRepository.save(student);
            });
        } else if ("trainer".equalsIgnoreCase(userType)) {
            trainerRepository.findById(userId).ifPresent(trainer -> {
                trainer.setIsActive(!trainer.getIsActive());
                trainerRepository.save(trainer);
            });
        }
    }

    /**
     * Approve trainer profile.
     * Flips approvalStatus → APPROVED and emails the trainer so they
     * know they can sign in now. Idempotent — re-approving an already
     * approved trainer is a no-op aside from refreshing the
     * decided-at timestamp.
     */
    @Transactional
    public void approveTrainer(String trainerId) {
        trainerRepository.findById(trainerId).ifPresent(trainer -> {
            trainer.setApprovalStatus("APPROVED");
            trainer.setApprovalDecidedAt(java.time.LocalDateTime.now());
            // Cleared so a previous rejection note doesn't leak into a
            // future second rejection.
            trainer.setApprovalNote(null);
            // isActive stays as the trainer set it (or defaults to true
            // for first-time approvals).
            trainerRepository.save(trainer);
            try {
                emailService.sendTrainerApprovalEmail(trainer.getEmail(), trainer.getName());
            } catch (Exception ignored) { /* email failure shouldn't fail the API call */ }
        });
    }

    /**
     * Reject trainer profile.
     * Flips approvalStatus → REJECTED and emails the trainer. The
     * optional {@code note} gets included in the email so they know
     * what to improve before re-applying.
     */
    // ── V2 course lifecycle: pending → approved / rejected ──────────

    /** Trainer-submitted courses waiting for admin review, newest first. */
    public java.util.List<com.byb.backend.dto.course.CourseResponse> getPendingTrainerCourses() {
        return courseRepository.findByApprovalStatusOrderByCreatedAtDesc("PENDING").stream()
                .map(c -> {
                    Trainer trainer = trainerRepository.findByTrainerId(c.getTrainerId()).orElse(null);
                    String name = trainer != null ? trainer.getName() : "Unknown";
                    return courseService.toResponse(c, name);
                })
                .collect(Collectors.toList());
    }

    /**
     * Approve a pending course + set its price at the same time.
     *
     * Trainers submit courses without a price — pricing is the admin's
     * call so we can't approve without one. Both {@code price} and
     * {@code currency} are required. Currency is normalized to upper-
     * case. Idempotent for already-approved rows if the caller re-
     * submits identical values, but a fresh price on an approved row
     * will still overwrite.
     */
    @Transactional
    public void approveTrainerCourse(String courseId, java.math.BigDecimal price, String currency) {
        if (price == null || price.signum() < 0) {
            throw new IllegalArgumentException("Price is required and must be non-negative.");
        }
        if (currency == null || currency.isBlank()) {
            throw new IllegalArgumentException("Currency is required.");
        }
        String normalized = currency.trim().toUpperCase();
        courseRepository.findByCourseId(courseId).ifPresent(c -> {
            c.setPrice(price);
            c.setCurrency(normalized);
            c.setApprovalStatus("APPROVED");
            c.setApprovalNote(null);
            c.setApprovalDecidedAt(java.time.LocalDateTime.now());
            courseRepository.save(c);
            Trainer trainer = trainerRepository.findByTrainerId(c.getTrainerId()).orElse(null);
            if (trainer != null) {
                try {
                    emailService.sendCourseApprovalEmail(
                            trainer.getEmail(), trainer.getName(), c.getTitle());
                } catch (Exception ignored) { /* email is best-effort */ }
            }
        });
    }

    /** Reject a pending course with an optional reason. */
    @Transactional
    public void rejectTrainerCourse(String courseId, String note) {
        courseRepository.findByCourseId(courseId).ifPresent(c -> {
            c.setApprovalStatus("REJECTED");
            c.setApprovalNote(note);
            c.setApprovalDecidedAt(java.time.LocalDateTime.now());
            courseRepository.save(c);
            Trainer trainer = trainerRepository.findByTrainerId(c.getTrainerId()).orElse(null);
            if (trainer != null) {
                try {
                    emailService.sendCourseRejectionEmail(
                            trainer.getEmail(), trainer.getName(), c.getTitle(), note);
                } catch (Exception ignored) { /* email is best-effort */ }
            }
        });
    }

    @Transactional
    public void rejectTrainer(String trainerId, String note) {
        trainerRepository.findById(trainerId).ifPresent(trainer -> {
            trainer.setApprovalStatus("REJECTED");
            trainer.setApprovalNote(note);
            trainer.setApprovalDecidedAt(java.time.LocalDateTime.now());
            trainer.setIsActive(false);
            trainerRepository.save(trainer);
            try {
                emailService.sendTrainerRejectionEmail(trainer.getEmail(), trainer.getName(), note);
            } catch (Exception ignored) { /* same — log-only */ }
        });
    }

    /**
     * Get all courses for the admin Courses page.
     *
     * Only APPROVED courses belong here — a course still awaiting review
     * (PENDING) or refused (REJECTED) lives on the dedicated Pending
     * Courses page instead, so the admin isn't managing/pricing a course
     * they haven't accepted yet. Legacy rows with a null approvalStatus
     * predate the review workflow and count as approved.
     */
    public List<CourseManagementResponse> getAllCourses() {
        return courseRepository.findAll().stream()
                .filter(c -> c.getApprovalStatus() == null
                        || "APPROVED".equalsIgnoreCase(c.getApprovalStatus()))
                .map(this::mapCourseToResponse)
                .collect(Collectors.toList());
    }

    /**
     * Get pending courses
     */
    public List<CourseManagementResponse> getPendingCourses() {
        return courseRepository.findByIsPublished(false).stream()
                .map(this::mapCourseToResponse)
                .collect(Collectors.toList());
    }

    /**
     * Approve course
     */
    @Transactional
    public void approveCourse(String courseId) {
        courseRepository.findById(courseId).ifPresent(course -> {
            course.setIsPublished(true);
            courseRepository.save(course);
        });
    }

    /**
     * Reject course
     */
    @Transactional
    public void rejectCourse(String courseId) {
        courseRepository.findById(courseId).ifPresent(course -> {
            course.setIsPublished(false);
            course.setIsActive(false);
            courseRepository.save(course);
        });
    }

    /**
     * Delete course (soft delete)
     */
    @Transactional
    public void deleteCourse(String courseId) {
        courseRepository.findById(courseId).ifPresent(course -> {
            course.setIsActive(false);
            courseRepository.save(course);
        });
    }

    /**
     * Update minimum students required for a course
     */
    @Transactional
    public void updateCourseMinStudents(String courseId, int minStudents) {
        courseRepository.findById(courseId).ifPresent(course -> {
            course.setMinStudentsRequired(minStudents);
            courseRepository.save(course);
        });
    }

    /** Set the trainer's daily-training earnings for a course. Null
     *  clears the value; the trainer's earnings screen skips courses
     *  with no rate set. */
    @Transactional
    public void updateTrainerDailyRevenue(String courseId, java.math.BigDecimal amount) {
        courseRepository.findById(courseId).ifPresent(course -> {
            course.setTrainerDailyRevenue(amount);
            courseRepository.save(course);
        });
    }

    // ============================================
    // PROMOTE TO ADMIN
    // ============================================

    /**
     * Promote a student or trainer to admin role.
     * Creates a new Admin record with the user's name/email and a generated temp password.
     * Returns a map containing the temp password so the caller can share it.
     */
    @Transactional
    public Map<String, String> promoteToAdmin(String userId, String userType) {
        String name;
        String email;

        if ("STUDENT".equalsIgnoreCase(userType)) {
            Student s = studentRepository.findById(userId)
                    .orElseThrow(() -> new RuntimeException("Student not found: " + userId));
            name = s.getName();
            email = s.getEmail();
        } else if ("TRAINER".equalsIgnoreCase(userType)) {
            Trainer t = trainerRepository.findById(userId)
                    .orElseThrow(() -> new RuntimeException("Trainer not found: " + userId));
            name = t.getName();
            email = t.getEmail();
        } else {
            throw new RuntimeException("Unknown userType: " + userType);
        }

        if (adminRepository.existsByEmail(email)) {
            throw new RuntimeException("An admin with this email already exists.");
        }

        String tempPassword = "Treyo@" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        Admin admin = new Admin();
        admin.setAdminId("ADM_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        admin.setName(name);
        admin.setEmail(email);
        admin.setPasswordHash(passwordEncoder.encode(tempPassword));
        admin.setIsActive(true);
        admin.setCreatedAt(LocalDateTime.now());
        admin.setUpdatedAt(LocalDateTime.now());

        adminRepository.save(admin);

        return Map.of(
                "message", "User promoted to admin successfully",
                "adminEmail", email,
                "tempPassword", tempPassword
        );
    }

    // ============================================
    // SEND NOTIFICATION
    // ============================================

    /**
     * Send a notification to a specific user, all students, all trainers, or everyone.
     */
    @Transactional
    public void sendAdminNotification(SendNotificationRequest req) {
        String type = req.getRecipientType();

        if ("SPECIFIC".equalsIgnoreCase(type)) {
            // Fail loudly with a usable message instead of letting a null
            // id reach the DB and surface as an opaque NOT NULL violation.
            if (req.getTargetUserId() == null || req.getTargetUserId().isBlank()) {
                throw new IllegalArgumentException(
                        "targetUserId is required when recipientType is SPECIFIC.");
            }
            saveNotification(req.getTargetUserId(),
                    req.getTargetUserType() != null ? req.getTargetUserType().toLowerCase() : "student",
                    req.getTitle(), req.getMessage(), req.getPriority());
            return;
        }

        if ("ALL".equalsIgnoreCase(type) || "STUDENTS".equalsIgnoreCase(type)) {
            studentRepository.findAll().forEach(s ->
                    saveNotification(s.getStudentId(), "student",
                            req.getTitle(), req.getMessage(), req.getPriority()));
        }

        if ("ALL".equalsIgnoreCase(type) || "TRAINERS".equalsIgnoreCase(type)) {
            trainerRepository.findAll().forEach(t ->
                    saveNotification(t.getTrainerId(), "trainer",
                            req.getTitle(), req.getMessage(), req.getPriority()));
        }
    }

    private void saveNotification(String userId, String userType,
                                   String title, String message, String priority) {
        Notification notification = new Notification();
        notification.setNotificationId("NOT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        notification.setUserId(userId);
        notification.setUserType(userType);
        notification.setNotificationType("ADMIN_BROADCAST");
        notification.setTitle(title);
        notification.setMessage(message);
        notification.setPriority(priority != null ? priority : "normal");
        notification.setCreatedAt(LocalDateTime.now());
        notificationRepository.save(notification);
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    private UserManagementResponse mapStudentToUserResponse(Student student) {
        long enrollmentsCount = enrollmentRepository.countByStudentId(student.getStudentId());
        long messagesCount = messageRepository.countBySenderIdOrReceiverId(
                student.getStudentId(), student.getStudentId());
        long interactionsCount = interactionRepository.countByStudentId(student.getStudentId());

        return UserManagementResponse.builder()
                .userId(student.getStudentId())
                .name(student.getName())
                .email(student.getEmail())
                .userType("STUDENT")
                .isActive(student.getIsActive())
                .isVerified(true) // Students are auto-verified
                .registeredAt(student.getCreatedAt())
                .lastLoginAt(null) // TODO: Track last login
                .primaryDomains(student.getPrimaryDomains() != null ?
                        student.getPrimaryDomains() : new String[]{})
                .specificInterests(student.getSpecificInterests() != null ?
                        student.getSpecificInterests() : new String[]{})
                .experienceLevel(student.getExperienceLevel())
                .enrollments(enrollmentsCount)
                .messagesCount(messagesCount)
                .interactionsCount(interactionsCount)
                .build();
    }

    private UserManagementResponse mapTrainerToUserResponse(Trainer trainer) {
        long coursesCreated = courseRepository.countByTrainerId(trainer.getTrainerId());
        long messagesCount = messageRepository.countBySenderIdOrReceiverId(
                trainer.getTrainerId(), trainer.getTrainerId());

        return UserManagementResponse.builder()
                .userId(trainer.getTrainerId())
                .name(trainer.getName())
                .email(trainer.getEmail())
                .userType("TRAINER")
                .isActive(trainer.getIsActive())
                .isVerified(trainer.getIsVerified())
                .registeredAt(trainer.getCreatedAt())
                .lastLoginAt(null) // TODO: Track last login
                .specializations(trainer.getSpecializations() != null ?
                        trainer.getSpecializations() : new String[]{})
                .skills(trainer.getSkills() != null ?
                        trainer.getSkills() : new String[]{})
                .experienceYears(trainer.getExperienceYears())
                .rating(null) // TODO: Calculate trainer rating
                .profileComplete(null) // TODO: Check profile completeness
                .verificationStatus(trainer.getApprovalStatus() == null
                        ? "PENDING"
                        : trainer.getApprovalStatus())
                .approvalDecidedAt(trainer.getApprovalDecidedAt())
                .approvalNote(trainer.getApprovalNote())
                .bio(trainer.getBio())
                .education(trainer.getEducation())
                .professionalExperience(trainer.getProfessionalExperience())
                .phone(trainer.getPhone())
                .address(trainer.getAddress())
                .city(trainer.getCity())
                .state(trainer.getState())
                .postalCode(trainer.getPostalCode())
                .linkedinUrl(trainer.getLinkedinUrl())
                .portfolioUrl(trainer.getPortfolioUrl())
                .githubUrl(trainer.getGithubUrl())
                .cvUrl(trainer.getCvUrl())
                .profilePictureUrl(trainer.getProfilePictureUrl())
                .coursesCreated(coursesCreated)
                .messagesCount(messagesCount)
                .build();
    }

    private CourseManagementResponse mapCourseToResponse(Course course) {
        Trainer trainer = trainerRepository.findById(course.getTrainerId()).orElse(null);
        int currentGroups = groupRepository.countByCourseId(course.getCourseId());
        long actualEnrolled = enrollmentRepository.countByCourseId(course.getCourseId());
        long requestedCount = groupFormationService.countActiveRequests(course.getCourseId());

        return CourseManagementResponse.builder()
                .courseId(course.getCourseId())
                .title(course.getTitle())
                .description(course.getDescription())
                .trainerId(course.getTrainerId())
                .trainerName(trainer != null ? trainer.getName() : "Unknown")
                .domain(course.getDomain())
                .specificTopic(course.getSpecificTopic())
                .level(course.getLevel())
                .durationHours(course.getDurationHours())
                .format(course.getFormat())
                .price(course.getPrice())
                .currency(course.getCurrency())
                .trainerDailyRevenue(course.getTrainerDailyRevenue())
                .isPublished(course.getIsPublished())
                .isActive(course.getIsActive())
                .approvalStatus(course.getIsPublished() ? "APPROVED" : "PENDING")
                .averageRating(course.getAverageRating() != null ? course.getAverageRating().doubleValue() : 0.0)
                .totalRatings(course.getTotalRatings())
                .totalEnrolled((int) actualEnrolled)
                .totalCompleted(course.getTotalCompleted())
                .minStudentsRequired(course.getMinStudentsRequired())
                .maxStudentsPerGroup(course.getMaxStudentsPerGroup())
                .currentGroups(currentGroups)
                .requestedCount((int) requestedCount)
                .createdAt(course.getCreatedAt())
                .publishedAt(null) // TODO: Add publishedAt field to Course
                .lastModifiedAt(course.getUpdatedAt())
                .build();
    }
}