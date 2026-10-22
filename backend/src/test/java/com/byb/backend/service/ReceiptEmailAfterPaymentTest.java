package com.byb.backend.service;

import com.byb.backend.model.Course;
import com.byb.backend.model.Enrollment;
import com.byb.backend.model.Student;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.EnrollmentRepository;
import com.byb.backend.repository.StudentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * A paid enrollment emails its receipt.
 *
 * It did not: the email was started on another thread from inside the
 * confirming transaction, which looked the enrollment up before that
 * transaction had committed, found nothing, and gave up without a word.
 *
 * Runs a real confirmation against the development database — the bug
 * only exists once a transaction really commits, so it cannot be rolled
 * back like the other tests. Everything it changes is put back: the
 * enrollment is deleted and the course's enrolment counter restored.
 * The gateway, the recommendation service and the mail server are mocked,
 * so nothing is charged, tracked or sent.
 */
@SpringBootTest
class ReceiptEmailAfterPaymentTest {

    @Autowired private EnrollmentService enrollmentService;
    @Autowired private CourseRepository courseRepository;
    @Autowired private StudentRepository studentRepository;
    @Autowired private EnrollmentRepository enrollmentRepository;

    @MockBean private PaymentService paymentService;
    @MockBean private EmailService emailService;
    @MockBean private MLRecommendationService mlRecommendationService;

    @Test
    void aPaidEnrollmentEmailsItsReceipt() {
        Course course = courseRepository.findAll().stream()
                .filter(c -> c.getPrice() != null && c.getPrice().compareTo(BigDecimal.ZERO) > 0)
                .findFirst().orElse(null);
        assumeTrue(course != null, "needs a paid course in the development database");

        // A learner with an address who is not already in this course.
        Set<String> enrolled = enrollmentRepository.findAll().stream()
                .filter(e -> course.getCourseId().equals(e.getCourseId()))
                .map(Enrollment::getStudentId)
                .collect(Collectors.toSet());
        Student learner = studentRepository.findAll().stream()
                .filter(s -> s.getEmail() != null && !s.getEmail().isBlank())
                .filter(s -> !enrolled.contains(s.getStudentId()))
                .findFirst().orElse(null);
        assumeTrue(learner != null, "needs a learner not yet enrolled in that course");

        // What ClicToPay reports for a completed payment, in millimes.
        when(paymentService.retrievePayment("TEST_REF")).thenReturn(Map.of(
                "status", "completed",
                "orderId", "TEST_ORDER",
                "amount", 25_000));
        when(paymentService.matches(anyString(), anyString(), anyString())).thenReturn(true);

        Integer countBefore = course.getTotalEnrolled();
        Enrollment created = null;
        try {
            created = enrollmentService.confirmEnrollment(
                    learner.getStudentId(), course.getCourseId(), null, "TEST_REF");

            verify(emailService, timeout(5000)).sendPaymentReceiptEmail(
                    eq(learner.getEmail()), any(), eq(course.getTitle()),
                    eq("25.000 " + (course.getCurrency() == null || course.getCurrency().isBlank()
                            ? "TND" : course.getCurrency())),
                    argThat(pdf -> pdf != null && pdf.length > 0),
                    eq("Treyo-receipt-TEST_REF.pdf"));
        } finally {
            if (created != null) enrollmentRepository.deleteById(created.getEnrollmentId());
            courseRepository.findById(course.getCourseId()).ifPresent(c -> {
                c.setTotalEnrolled(countBefore);
                courseRepository.save(c);
            });
        }
    }
}
