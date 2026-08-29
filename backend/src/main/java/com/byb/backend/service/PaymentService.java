package com.byb.backend.service;

import com.byb.backend.model.Course;
import com.byb.backend.model.Student;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.StudentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.Map;

/**
 * Server-side payment integration, targeting ClicToPay (SMT / ATB).
 *
 * ── Status ──────────────────────────────────────────────────────────
 * The two methods that talk to the gateway are NOT implemented. SMT does
 * not release its integration specification until the merchant contract
 * is approved, and guessing at a payment API's request format, signature
 * scheme and status vocabulary produces code that looks plausible and
 * fails in ways that are expensive to debug against real cards. They
 * throw {@link PaymentProviderUnavailable} until the spec arrives.
 *
 * Everything around them is real and provider-agnostic: price resolution,
 * the free-course short-circuit, orderId encoding, and the verification
 * contract the rest of the application relies on.
 *
 * This replaced a working Konnect integration, which was only ever used
 * for prototyping. That implementation is in git history (before the
 * "ClicToPay" migration commit) and is the reference for the flow shape.
 *
 * ── The flow, once implemented ──────────────────────────────────────
 *   1. Mobile calls POST /api/payments/enrollment-payment → we ask the
 *      gateway to create a payment and return { payUrl, paymentRef }.
 *   2. Mobile opens payUrl. The user pays on the gateway's hosted page,
 *      including the 3-D Secure challenge (the contract mandates 3DS for
 *      national and international cards alike, so the return happens
 *      after an interstitial bank page, not straight from the card form).
 *   3. The gateway redirects to /payment/success or /payment/failure,
 *      which bounce back into the app via its custom scheme.
 *   4. Mobile calls POST /api/enrollments/confirm with the paymentRef.
 *   5. The backend re-verifies with the gateway BEFORE writing the row.
 *
 * ── The rule that must survive any rewrite ──────────────────────────
 * Never trust a redirect or a webhook body. Both are attacker-reachable:
 * the redirect passes through the user's browser, and the webhook URL is
 * public by necessity. Confirmation always re-fetches state from the
 * gateway server-to-server. Everything else here is negotiable; this is
 * what stops a forged callback creating a paid enrollment for free.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PaymentService {

    private final StudentRepository studentRepository;
    private final CourseRepository courseRepository;
    /** Retained for the gateway calls below, which are not yet written. */
    @SuppressWarnings("unused")
    private final WebClient.Builder webClientBuilder;

    // Every property below defaults to empty. A deployment without
    // payment credentials must still start — the alternative is a
    // service that refuses to boot because a feature nobody is using yet
    // has not been configured.
    //
    // Affiliate and terminal numbers come from ATB on the signed
    // contract ("Numéro Affilié" / "Numéro Terminal" on the Fiche
    // Technique); they are not self-service values.

    @Value("${clicktopay.api.base-url:}")
    private String baseUrl;

    @Value("${clicktopay.api.affiliate-id:}")
    private String affiliateId;

    @Value("${clicktopay.api.terminal-id:}")
    private String terminalId;

    @Value("${clicktopay.api.secret:}")
    private String secret;

    /**
     * Public HTTPS base the gateway redirects the user back to, e.g.
     * https://treyo.leanconsulting.com.tn. The success and failure paths
     * are appended to it. This is declared to SMT on the Fiche Technique
     * and must match what is registered there.
     */
    @Value("${clicktopay.return-url-base:}")
    private String returnUrlBase;

    /** True once ATB has issued credentials and they are configured. */
    public boolean isConfigured() {
        return notBlank(baseUrl) && notBlank(affiliateId)
                && notBlank(terminalId) && notBlank(secret);
    }

    /**
     * Thrown when a payment is requested before the gateway is usable.
     * Distinct from a gateway *error* so the controller can answer 503
     * ("not available yet") rather than 502 ("provider misbehaved").
     */
    public static class PaymentProviderUnavailable extends RuntimeException {
        public PaymentProviderUnavailable(String message) {
            super(message);
        }
    }

    /**
     * Begin payment for an enrollment.
     *
     * @param groupId the group offer, carried in `orderId` so a webhook
     *                can route back to the right enrollment
     * @return { payUrl, paymentRef, amount, currency, free }
     */
    public Map<String, Object> createEnrollmentPayment(String studentId, String courseId, String groupId) {
        Student student = studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new IllegalArgumentException("Student not found: " + studentId));
        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new IllegalArgumentException("Course not found: " + courseId));

        // Tunisian gateways bill in MILLIMES (1 TND = 1000). Course.price
        // is stored in major TND units, e.g. 49.99.
        BigDecimal priceMajor = course.getPrice() == null ? BigDecimal.ZERO : course.getPrice();
        long amountMillimes = priceMajor.setScale(3, RoundingMode.HALF_UP)
                .movePointRight(3)
                .longValueExact();

        // Free courses never reach the gateway. The client sees
        // `free: true` and goes straight to the confirm endpoint. This
        // path works today and is independent of the integration below.
        if (amountMillimes <= 0) {
            Map<String, Object> free = new HashMap<>();
            free.put("payUrl", null);
            free.put("paymentRef", null);
            free.put("amount", 0L);
            free.put("currency", "TND");
            free.put("free", true);
            return free;
        }

        String orderId = composeOrderId(studentId, courseId, groupId);

        if (!isConfigured()) {
            log.warn("Payment requested for order {} but ClicToPay is not configured", orderId);
            throw new PaymentProviderUnavailable(
                    "Online payment is not available yet. Paid enrollment opens once "
                            + "the bank has activated the merchant account.");
        }

        // ══ INTEGRATION POINT 1 — create the payment ══════════════════
        // Send amount (millimes), currency TND, orderId, the affiliate
        // and terminal numbers, the success/failure return URLs built
        // from returnUrlBase, and whatever signature SMT specifies.
        // Expect back a hosted-page URL and a gateway reference; return
        // them as payUrl / paymentRef so the mobile client is unchanged.
        //
        // Student name/email/phone are available on `student` if the
        // gateway wants cardholder details prefilled.
        throw new PaymentProviderUnavailable(
                "ClicToPay payment initiation is not implemented — awaiting SMT's "
                        + "integration specification. Course: " + course.getCourseId());
    }

    /**
     * Current state of a payment at the gateway, or null if unknown.
     *
     * Called by {@link EnrollmentService} before an enrollment row is
     * written, and by the webhook handler. Returning null must be safe:
     * callers treat it as "not paid".
     */
    public Map<String, Object> retrievePayment(String paymentRef) {
        if (!isConfigured()) {
            // Not an exception: callers ask "is this paid?", and with no
            // gateway the honest answer is "no", not a 500.
            return null;
        }

        // ══ INTEGRATION POINT 2 — verify the payment ══════════════════
        // GET the payment by reference and return a map containing at
        // least "status" and "orderId". Map the gateway's own status
        // vocabulary onto "completed" for a successful capture, so
        // isPaidFor() and the webhook handler stay provider-agnostic.
        log.warn("retrievePayment({}) called but ClicToPay lookup is not implemented", paymentRef);
        return null;
    }

    /**
     * True iff the gateway confirms this payment completed AND its
     * orderId matches the student and course being enrolled.
     *
     * The orderId check is not redundant. Without it a valid reference
     * for a cheap course could be replayed to unlock an expensive one —
     * the payment is genuine, just not for this thing.
     */
    public boolean isPaidFor(String paymentRef, String expectedStudentId, String expectedCourseId) {
        Map<String, Object> payment = retrievePayment(paymentRef);
        if (payment == null) return false;
        if (!"completed".equals(String.valueOf(payment.get("status")))) return false;
        String orderId = String.valueOf(payment.get("orderId"));
        if (orderId.equals("null")) return false;
        return orderId.startsWith(expectedStudentId + ":" + expectedCourseId);
    }

    /**
     * Parse an orderId back into its parts, for routing a gateway event
     * to the right enrollment. Returns null when it is unparseable.
     */
    public OrderId parseOrderId(String orderId) {
        if (orderId == null) return null;
        String[] parts = orderId.split(":", 3);
        if (parts.length < 2) return null;
        return new OrderId(parts[0], parts[1], parts.length > 2 ? parts[2] : null);
    }

    public record OrderId(String studentId, String courseId, String groupId) {}

    // ─── helpers ────────────────────────────────────────────────────

    /**
     * Encode (studentId, courseId, groupId) into the orderId the gateway
     * echoes back on every lookup. Colon-separated rather than JSON
     * because gateway dashboards render orderId as plain text, and this
     * form stays readable when an admin is investigating a payment.
     */
    private String composeOrderId(String studentId, String courseId, String groupId) {
        StringBuilder sb = new StringBuilder(studentId).append(':').append(courseId);
        if (groupId != null && !groupId.isBlank()) {
            sb.append(':').append(groupId);
        }
        return sb.toString();
    }

    private boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
