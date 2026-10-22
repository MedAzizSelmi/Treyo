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
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

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

    /**
     * Published by EnrollmentService when a paid enrolment is saved. The
     * receipt goes out once the transaction that saved it has committed —
     * see emailReceipt.
     */
    public record EnrollmentPaid(String enrollmentId) {}

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
     * Email the receipt once the paid enrolment has been committed.
     *
     * After commit, not merely on another thread. It used to be called
     * directly from inside the confirming transaction and run async, so
     * its own lookup raced that transaction — which still had the course
     * counter, a call to the recommendation service and the group to
     * update — and lost: it found no enrolment and returned silently, and
     * no learner ever got a receipt. Waiting for the commit also means a
     * confirmation that rolls back sends nothing.
     *
     * fallbackExecution covers a caller with no transaction, where there
     * is nothing to wait for.
     *
     * Async and swallowing its own failures: a paid enrolment must not be
     * undone because a mail server was briefly unreachable, and the
     * learner can always re-download from payment history.
     */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void emailReceipt(EnrollmentPaid event) {
        String enrollmentId = event.enrollmentId();
        try {
            Enrollment enrollment = enrollmentRepository.findById(enrollmentId).orElse(null);
            if (enrollment == null) {
                log.warn("Receipt not sent: enrolment {} not found", enrollmentId);
                return;
            }

            ReceiptService.ReceiptData data = dataFor(enrollment);
            if (data == null) {
                log.info("No receipt for {}: nothing was paid", enrollmentId);
                return;
            }
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
