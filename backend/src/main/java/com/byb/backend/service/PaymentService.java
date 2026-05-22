package com.byb.backend.service;

import com.byb.backend.model.Course;
import com.byb.backend.model.Student;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.StudentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Server-side integration with Konnect (Tunisian payment gateway).
 *
 * Replaces our earlier Stripe integration. Konnect is REST-only (no Java
 * SDK), TND-native, and uses a redirect flow rather than a payment sheet:
 *
 *   1. POST /payments/init-payment — we send amount + customer info,
 *      Konnect returns { paymentRef, payUrl }.
 *   2. The mobile app opens payUrl in a browser/WebView (via
 *      expo-web-browser). The user pays on Konnect's hosted page.
 *   3. Konnect redirects back to our app's custom scheme (treyomobile://).
 *   4. The app calls POST /api/enrollments/confirm with the paymentRef.
 *   5. The backend calls GET /payments/{paymentRef} to verify
 *      payment.status == "completed" BEFORE creating the Enrollment row.
 *
 * Konnect also supports an outbound webhook ("silent webhook"). We
 * expose that endpoint too, but the confirm-then-verify flow above is
 * the source of truth — webhooks are advisory only. That way payment
 * works even without a publicly reachable backend (e.g. local dev).
 */
@Service
@RequiredArgsConstructor
public class PaymentService {

    private final StudentRepository studentRepository;
    private final CourseRepository courseRepository;
    private final WebClient.Builder webClientBuilder;

    @Value("${konnect.api.key}")
    private String konnectApiKey;

    @Value("${konnect.api.wallet-id}")
    private String konnectWalletId;

    @Value("${konnect.api.base-url}")
    private String konnectBaseUrl;

    @Value("${konnect.api.return-url}")
    private String konnectReturnUrl;

    @Value("${konnect.api.webhook-url:}")
    private String konnectWebhookUrl;

    // Lazy WebClient — built once and reused. Konnect's API is responsive
    // (sub-second) so a 10-second timeout is plenty even on cold networks.
    private WebClient webClient;

    private WebClient client() {
        if (webClient == null) {
            webClient = webClientBuilder
                    .baseUrl(konnectBaseUrl)
                    .defaultHeader("x-api-key", konnectApiKey)
                    .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                    .build();
        }
        return webClient;
    }

    /**
     * Create a Konnect payment for an enrollment.
     *
     * @param studentId who's paying
     * @param courseId  which course
     * @param groupId   the group offer (kept in `orderId` metadata so the
     *                  webhook can route back to the right enrollment)
     * @return ready-to-send-to-client map: { payUrl, paymentRef, amount, currency, free }
     */
    public Map<String, Object> createEnrollmentPayment(String studentId, String courseId, String groupId) {
        Student student = studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new IllegalArgumentException("Student not found: " + studentId));
        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new IllegalArgumentException("Course not found: " + courseId));

        // Konnect expects amounts in MILLIMES (1 TND = 1000 millimes).
        // Course.price is stored in major TND units (e.g. 49.99 TND).
        BigDecimal priceMajor = course.getPrice() == null ? BigDecimal.ZERO : course.getPrice();
        long amountMillimes = priceMajor.setScale(3, RoundingMode.HALF_UP)
                .movePointRight(3)
                .longValueExact();

        // Free course short-circuit — skip Konnect entirely. The client
        // sees `free: true` and jumps straight to the confirm endpoint
        // without going through the payment redirect.
        if (amountMillimes <= 0) {
            Map<String, Object> free = new HashMap<>();
            free.put("payUrl", null);
            free.put("paymentRef", null);
            free.put("amount", 0L);
            free.put("currency", "TND");
            free.put("free", true);
            return free;
        }

        // Build the init-payment body. Field semantics per Konnect docs:
        //   token              "TND" — only Tunisian dinars are supported
        //   type               "immediate" — charge happens straight away
        //                       (vs "partial" for staggered payments)
        //   lifespan           how long (minutes) the payUrl is valid
        //   feesIncluded       false → Konnect's fee is added on top
        //   acceptedPaymentMethods   restrict to card only; can include
        //                            "wallet" / "bank_transfer" later
        //   orderId            our internal pointer back to (student, course, group)
        //                      so the webhook can do server-driven confirmation
        //   successUrl/failUrl what the hosted page redirects to on outcome.
        //                      Both go to the same custom-scheme URL — the
        //                      backend then verifies status, so it doesn't
        //                      matter which one fired.
        String orderId = composeOrderId(studentId, courseId, groupId);

        Map<String, Object> body = new HashMap<>();
        body.put("receiverWalletId", konnectWalletId);
        body.put("token", "TND");
        body.put("amount", amountMillimes);
        body.put("type", "immediate");
        body.put("description", "Enrollment in " + safeShort(course.getTitle(), 200));
        body.put("acceptedPaymentMethods", new String[]{"bank_card", "wallet", "e-DINAR"});
        body.put("lifespan", 10); // minutes — generous; user can retry within that window
        body.put("checkoutForm", false); // we already collected name/email/phone at signup
        body.put("addPaymentFeesToAmount", false);
        body.put("firstName", firstNameOf(student.getName()));
        body.put("lastName", lastNameOf(student.getName()));
        body.put("phoneNumber", student.getPhone() == null ? "" : student.getPhone());
        body.put("email", student.getEmail());
        body.put("orderId", orderId);
        body.put("successUrl", konnectReturnUrl + "?status=success");
        body.put("failUrl", konnectReturnUrl + "?status=failed");
        body.put("theme", "light");
        body.put("silentWebhook", true); // server-to-server only, no user redirect on webhook
        if (konnectWebhookUrl != null && !konnectWebhookUrl.isBlank()) {
            body.put("webhook", konnectWebhookUrl);
        }

        Map<String, Object> response;
        try {
            response = client().post()
                    .uri("/payments/init-payment")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .timeout(Duration.ofSeconds(10))
                    .onErrorMap(WebClientResponseException.class, this::translateKonnectError)
                    .block();
        } catch (RuntimeException e) {
            throw new RuntimeException("Could not initialise payment: " + e.getMessage(), e);
        }

        if (response == null || response.get("payUrl") == null || response.get("paymentRef") == null) {
            throw new RuntimeException("Konnect returned an unexpected response: " + response);
        }

        Map<String, Object> out = new HashMap<>();
        out.put("payUrl", response.get("payUrl"));
        out.put("paymentRef", response.get("paymentRef"));
        out.put("amount", amountMillimes);
        out.put("currency", "TND");
        out.put("free", false);
        return out;
    }

    /**
     * Pull the current state of a Konnect payment. Returns the inner
     * `payment` object (id, status, amount, token, …). Returns null when
     * Konnect doesn't recognise the ID.
     *
     * Status values we care about:
     *   "completed" → user paid successfully
     *   "pending"   → user hasn't finished yet
     *   "failed"    → card declined, expired, etc.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> retrievePayment(String paymentRef) {
        try {
            Map<String, Object> wrapper = client().get()
                    .uri("/payments/{ref}", paymentRef)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .timeout(Duration.ofSeconds(10))
                    .onErrorResume(WebClientResponseException.NotFound.class, e -> Mono.empty())
                    .block();
            if (wrapper == null) return null;
            // Konnect wraps the payload as { payment: {...} }.
            Object inner = wrapper.get("payment");
            return inner instanceof Map ? (Map<String, Object>) inner : null;
        } catch (WebClientResponseException e) {
            throw new RuntimeException("Konnect lookup failed: " + e.getMessage(), e);
        }
    }

    /**
     * Convenience wrapper used by EnrollmentService.confirmEnrollment:
     * returns true iff Konnect confirms the payment as completed AND its
     * orderId metadata matches the (student, course) being enrolled.
     */
    public boolean isPaidFor(String paymentRef, String expectedStudentId, String expectedCourseId) {
        Map<String, Object> payment = retrievePayment(paymentRef);
        if (payment == null) return false;
        if (!"completed".equals(String.valueOf(payment.get("status")))) return false;
        String orderId = String.valueOf(payment.get("orderId"));
        if (orderId == null || orderId.equals("null")) return false;
        return orderId.startsWith(expectedStudentId + ":" + expectedCourseId);
    }

    /**
     * Parse the orderId encoded by composeOrderId back into its three
     * components. Used by the webhook handler to route a Konnect event
     * to the right enrollment.
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
     * Encode (studentId, courseId, groupId) into the orderId field that
     * Konnect echoes back on every payment lookup. Colon-separated so
     * parseOrderId can pull it apart. We don't use JSON because Konnect's
     * dashboard renders the orderId as plain text — colon form is
     * human-readable when an admin is investigating a payment.
     */
    private String composeOrderId(String studentId, String courseId, String groupId) {
        StringBuilder sb = new StringBuilder(studentId).append(':').append(courseId);
        if (groupId != null && !groupId.isBlank()) {
            sb.append(':').append(groupId);
        }
        return sb.toString();
    }

    private String firstNameOf(String fullName) {
        if (fullName == null || fullName.isBlank()) return "Student";
        int sp = fullName.indexOf(' ');
        return sp < 0 ? fullName : fullName.substring(0, sp);
    }

    private String lastNameOf(String fullName) {
        if (fullName == null) return "";
        int sp = fullName.indexOf(' ');
        return sp < 0 ? "" : fullName.substring(sp + 1).trim();
    }

    private String safeShort(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max);
    }

    private RuntimeException translateKonnectError(WebClientResponseException e) {
        // Konnect returns structured errors like { errors: [{ message: "..." }] }.
        // Surface the message if we can find it, otherwise fall back to
        // status code + raw body for debugging.
        String body = e.getResponseBodyAsString();
        return new RuntimeException("Konnect " + e.getStatusCode() + ": " + body);
    }
}
