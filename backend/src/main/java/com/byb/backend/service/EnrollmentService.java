package com.byb.backend.service;

import com.byb.backend.model.Enrollment;
import com.byb.backend.model.Group;
import com.byb.backend.repository.EnrollmentRepository;
import com.byb.backend.repository.GroupRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class EnrollmentService {

    private final EnrollmentRepository enrollmentRepository;
    private final GroupRepository groupRepository;
    private final NotificationService notificationService;

    @Transactional
    public Enrollment confirmEnrollment(String studentId, String courseId, String groupId) {
        // Check if already enrolled
        var existing = enrollmentRepository.findByStudentIdAndCourseId(studentId, courseId);
        if (existing.isPresent()) {
            throw new RuntimeException("Already enrolled in this course");
        }

        // Create enrollment
        Enrollment enrollment = new Enrollment();
        enrollment.setEnrollmentId("ENR_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        enrollment.setStudentId(studentId);
        enrollment.setCourseId(courseId);
        enrollment.setGroupId(groupId);
        enrollment.setEnrollmentStatus("confirmed");
        enrollment.setPaymentStatus("unpaid"); // Will be handled later
        enrollment.setEnrolledAt(LocalDateTime.now());
        enrollment.setProgressPercentage(BigDecimal.ZERO);

        enrollment = enrollmentRepository.save(enrollment);

        // Update group size
        if (groupId != null) {
            Group group = groupRepository.findByGroupId(groupId)
                    .orElseThrow(() -> new RuntimeException("Group not found"));

            group.setCurrentSize(group.getCurrentSize() + 1);
            groupRepository.save(group);
        }

        return enrollment;
    }

    public List<Enrollment> getStudentEnrollments(String studentId) {
        return enrollmentRepository.findByStudentId(studentId);
    }

    public List<Enrollment> getActiveEnrollments(String studentId) {
        return enrollmentRepository.findActiveEnrollmentsByStudent(studentId);
    }

    @Transactional
    public Enrollment startEnrollment(String enrollmentId) {
        Enrollment enrollment = enrollmentRepository.findByEnrollmentId(enrollmentId)
                .orElseThrow(() -> new RuntimeException("Enrollment not found"));

        enrollment.setEnrollmentStatus("active");
        enrollment.setStartedAt(LocalDateTime.now());

        return enrollmentRepository.save(enrollment);
    }

    @Transactional
    public Enrollment completeEnrollment(String enrollmentId) {
        Enrollment enrollment = enrollmentRepository.findByEnrollmentId(enrollmentId)
                .orElseThrow(() -> new RuntimeException("Enrollment not found"));

        enrollment.setEnrollmentStatus("completed");
        enrollment.setCompletedAt(LocalDateTime.now());
        enrollment.setProgressPercentage(BigDecimal.valueOf(100));

        return enrollmentRepository.save(enrollment);
    }
}