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

        // TODO: Track active users (last login)
        long activeUsersToday = 0;

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
     * Get pending trainer approvals
     */
    public List<UserManagementResponse> getPendingTrainers() {
        return trainerRepository.findByIsVerified(false).stream()
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
     * Approve trainer profile
     */
    @Transactional
    public void approveTrainer(String trainerId) {
        trainerRepository.findById(trainerId).ifPresent(trainer -> {
            trainer.setIsVerified(true);
            trainerRepository.save(trainer);
        });
    }

    /**
     * Reject trainer profile
     */
    @Transactional
    public void rejectTrainer(String trainerId) {
        trainerRepository.findById(trainerId).ifPresent(trainer -> {
            trainer.setIsVerified(false);
            trainer.setIsActive(false);
            trainerRepository.save(trainer);
        });
    }

    /**
     * Get all courses
     */
    public List<CourseManagementResponse> getAllCourses() {
        return courseRepository.findAll().stream()
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
                .verificationStatus(trainer.getIsVerified() ? "APPROVED" : "PENDING")
                .coursesCreated(coursesCreated)
                .messagesCount(messagesCount)
                .build();
    }

    private CourseManagementResponse mapCourseToResponse(Course course) {
        Trainer trainer = trainerRepository.findById(course.getTrainerId()).orElse(null);
        int currentGroups = groupRepository.countByCourseId(course.getCourseId());

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
                .isPublished(course.getIsPublished())
                .isActive(course.getIsActive())
                .approvalStatus(course.getIsPublished() ? "APPROVED" : "PENDING")
                .averageRating(course.getAverageRating() != null ? course.getAverageRating().doubleValue() : 0.0)
                .totalRatings(course.getTotalRatings())
                .totalEnrolled(course.getTotalEnrolled())
                .totalCompleted(course.getTotalCompleted())
                .minStudentsRequired(course.getMinStudentsRequired())
                .maxStudentsPerGroup(course.getMaxStudentsPerGroup())
                .currentGroups(currentGroups)
                .createdAt(course.getCreatedAt())
                .publishedAt(null) // TODO: Add publishedAt field to Course
                .lastModifiedAt(course.getUpdatedAt())
                .build();
    }
}