package com.byb.backend.service;

import com.byb.backend.model.Course;
import com.byb.backend.model.Enrollment;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.EnrollmentRepository;
import com.byb.backend.repository.StudentRepository;
import com.byb.backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Assembles a receipt from an enrolment and gets it to the learner.
 *
 * Separate from both ReceiptService, which only knows how to draw a PDF
 * from data handed to it, and EnrollmentService, which should not grow
 * four more repositories to look up names for a document. This is the
 * piece that joins them.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ReceiptDeliveryService {

    private final EnrollmentRepository enrollmentRepository;
    private final CourseRepository courseRepository;
    private final StudentRepository studentRepository;
    private final TrainerRepository trainerRepository;
    private final ReceiptService receiptService;
    private final EmailService emailService;

    /**
     * Build the receipt for an enrolment, or null when there is nothing
     * to receipt — a free course, or an enrolment that was never paid.
     */
    public byte[] render(Enrollment enrollment) {
        ReceiptService.ReceiptData data = dataFor(enrollment);
        return data == null ? null : receiptService.render(data);
    }

    /** A filename a learner can find again in their downloads folder. */
    public String filenameFor(Enrollment enrollment) {
        String ref = enrollment.getPaymentRef();
        return "Treyo-receipt-" + (ref == null || ref.isBlank()
                ? enrollment.getEnrollmentId() : ref) + ".pdf";
    }

    /**
     * Email the receipt. Async and swallowing its own failures: a paid
     * enrolment must not be undone because a mail server was briefly
     * unreachable, and the learner can always re-download from payment
     * history.
     */
    @Async
    public void emailReceipt(String enrollmentId) {
        try {
            Enrollment enrollment = enrollmentRepository.findById(enrollmentId).orElse(null);
            if (enrollment == null) return;

            ReceiptService.ReceiptData data = dataFor(enrollment);
            if (data == null) return;
            if (data.learnerEmail() == null || data.learnerEmail().isBlank()) {
                log.info("No address on file for {} — receipt not emailed", enrollmentId);
                return;
            }

            byte[] pdf = receiptService.render(data);
            emailService.sendPaymentReceiptEmail(
                    data.learnerEmail(), data.learnerName(), data.courseTitle(),
                    amountLabel(data), pdf, filenameFor(enrollment));
        } catch (Exception e) {
            log.warn("Receipt not sent for {}: {}", enrollmentId, e.getMessage());
        }
    }

    // ── internals ───────────────────────────────────────────────────

    /** Null when the enrolment is not a payment worth receipting. */
    private ReceiptService.ReceiptData dataFor(Enrollment e) {
        if (e == null) return null;
        BigDecimal paid = e.getAmountPaid();
        if (paid == null || paid.signum() <= 0) return null;

        Course course = e.getCourseId() == null ? null
                : courseRepository.findById(e.getCourseId()).orElse(null);
        String trainerName = course == null || course.getTrainerId() == null ? null
                : trainerRepository.findByTrainerId(course.getTrainerId())
                        .map(t -> t.getName()).orElse(null);
        var student = e.getStudentId() == null ? null
                : studentRepository.findByStudentId(e.getStudentId()).orElse(null);

        return new ReceiptService.ReceiptData(
                student == null ? null : student.getName(),
                student == null ? null : student.getEmail(),
                course == null ? null : course.getTitle(),
                trainerName,
                paid,
                course == null ? null : course.getCurrency(),
                e.getPaidAt() == null ? e.getEnrolledAt() : e.getPaidAt(),
                e.getPaymentRef(),
                e.getCardBrand(),
                e.getCardLast4());
    }

    private String amountLabel(ReceiptService.ReceiptData d) {
        BigDecimal v = d.amountPaid().setScale(3, RoundingMode.HALF_UP);
        String currency = d.currency() == null || d.currency().isBlank() ? "TND" : d.currency();
        return v.toPlainString() + " " + currency;
    }
}
