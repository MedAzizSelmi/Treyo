package com.byb.backend.service;

import com.byb.backend.model.Course;
import com.byb.backend.model.Enrollment;
import com.byb.backend.model.Group;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.EnrollmentRepository;
import com.byb.backend.repository.GroupRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class EnrollmentService {

    private final EnrollmentRepository enrollmentRepository;
    private final GroupRepository groupRepository;
    private final NotificationService notificationService;
    private final CourseRepository courseRepository;
    private final PaymentService paymentService;
    private final MLRecommendationService mlRecommendationService;

    /**
     * Confirm an enrollment after the student has paid for it.
     *
     * @param studentId   who's enrolling
     * @param courseId    which course
     * @param groupId     the group offer being accepted (optional)
     * @param paymentRef  the gateway reference returned by
     *                    POST /api/payments/enrollment-payment, after the
     *                    user completed the hosted payment page. Required
     *                    UNLESS the course is free (price <= 0).
     *
     * Verifies the payment against the gateway (status = completed AND
     * orderId references this same student+course) before writing
     * anything to the DB. Never trusts the client's claim of having paid.
     */
    @Transactional
    public Enrollment confirmEnrollment(String studentId, String courseId, String groupId,
                                        String paymentRef) {
        // Check if already enrolled. Webhook + client confirm can race so
        // this lookup needs to be inside the transaction.
        var existing = enrollmentRepository.findByStudentIdAndCourseId(studentId, courseId);
        if (existing.isPresent()) {
            throw new RuntimeException("Already enrolled in this course");
        }

        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new RuntimeException("Course not found: " + courseId));

        BigDecimal price = course.getPrice() == null ? BigDecimal.ZERO : course.getPrice();
        boolean isPaidCourse = price.compareTo(BigDecimal.ZERO) > 0;

        // ─── Payment verification ────────────────────────────────────
        // For free courses (price = 0) the gateway is skipped entirely.
        // For paid courses we MUST see a "completed" payment whose orderId
        // points back to this exact (student, course). Re-pulling from the
        // gateway on every confirm means the client can't fake
        // confirmation by sending any random paymentRef.
        BigDecimal amountPaid = BigDecimal.ZERO;
        LocalDateTime paidAt = null;
        if (isPaidCourse) {
            if (paymentRef == null || paymentRef.isBlank()) {
                throw new RuntimeException("Payment required: paymentRef is missing");
            }
            Map<String, Object> payment = paymentService.retrievePayment(paymentRef);
            if (payment == null) {
                throw new RuntimeException("Payment not found at the gateway: " + paymentRef);
            }
            String status = String.valueOf(payment.get("status"));
            if (!"completed".equals(status)) {
                throw new RuntimeException("Payment not completed (status=" + status + ")");
            }
            // Defence against ref reuse: the payment's own order number
            // must reference the same student + course we're enrolling.
            String orderNumber = String.valueOf(payment.get("orderId"));
            if (!paymentService.matches(orderNumber, studentId, courseId)) {
                throw new RuntimeException(
                        "Payment does not match this enrollment (orderNumber=" + orderNumber + ")");
            }
            // Trust the gateway's reported amount over the listed course
            // price — covers the edge case where the price changed between
            // initiation and confirmation. ClicToPay reports in millimes
            // (1 TND = 1000).
            Object amtObj = payment.get("amount");
            if (amtObj instanceof Number amt) {
                amountPaid = BigDecimal.valueOf(amt.longValue())
                        .movePointLeft(3)
                        .setScale(3, RoundingMode.HALF_UP);
            }
            paidAt = LocalDateTime.now();
        }

        // Create enrollment
        Enrollment enrollment = new Enrollment();
        enrollment.setEnrollmentId("ENR_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        enrollment.setStudentId(studentId);
        enrollment.setCourseId(courseId);
        enrollment.setGroupId(groupId);
        enrollment.setEnrollmentStatus("confirmed");
        enrollment.setPaymentStatus(isPaidCourse ? "paid" : "unpaid");
        enrollment.setAmountPaid(amountPaid);
        enrollment.setPaymentRef(paymentRef);
        enrollment.setPaidAt(paidAt);
        enrollment.setEnrolledAt(LocalDateTime.now());
        enrollment.setProgressPercentage(BigDecimal.ZERO);

        enrollment = enrollmentRepository.save(enrollment);

        // Keep the course's enrollment counter current. Nothing maintained
        // it before, so it stayed at 0 forever — which silently disabled
        // the popularity signal in the recommendation engine (it reads
        // total_enrolled as num_enrolled) and left the trainer's "students"
        // figure at zero. Safe to increment unconditionally here: the
        // duplicate check above guarantees one increment per enrollment.
        course.setTotalEnrolled((course.getTotalEnrolled() == null ? 0 : course.getTotalEnrolled()) + 1);
        courseRepository.save(course);

        // Record the enrollment as an interaction. Interest, views and
        // saves were tracked, but the strongest signal of all — actually
        // committing to a course — never reached the engine, so it was
        // missing from the collaborative matrix and from the positives the
        // offline evaluation learns from. Best-effort: a recommendation
        // service that is down must not fail a paid enrollment.
        mlRecommendationService.trackInteraction(studentId, courseId, "enrolled");

        // Update group size
        if (groupId != null) {
            Group group = groupRepository.findByGroupId(groupId)
                    .orElseThrow(() -> new RuntimeException("Group not found"));

            group.setCurrentSize(group.getCurrentSize() + 1);
            groupRepository.save(group);
        }

        return enrollment;
    }

    /**
     * Backwards-compat overload — old callers (queue-based requests that
     * predate paid enrollments) hit this without a payment ref. Only
     * succeeds for free courses; paid courses now MUST go through the
     * four-arg version with a verified Konnect paymentRef.
     */
    @Transactional
    public Enrollment confirmEnrollment(String studentId, String courseId, String groupId) {
        return confirmEnrollment(studentId, courseId, groupId, null);
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

        // Completion is the other strong positive the engine never saw.
        mlRecommendationService.trackInteraction(
                enrollment.getStudentId(), enrollment.getCourseId(), "completed");

        return enrollmentRepository.save(enrollment);
    }
}