package com.byb.backend.service;

import com.byb.backend.model.Course;
import com.byb.backend.model.Student;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.StudentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Server-side payment integration with ClicToPay (SMT / ATB), REST API
 * "Basic 1.0" — reference CTP-API-BASIC-01.
 *
 * ── The two calls ───────────────────────────────────────────────────
 *   register.do               → registers an order, returns orderId
 *                               (gateway UUID) + formUrl (hosted page)
 *   getOrderStatusExtended.do → the real state of that order
 *
 * Authentication is userName / password as form fields on every call;
 * there is no signature scheme in this version of the API.
 *
 * ── The rule that must survive any rewrite ──────────────────────────
 * Never trust a redirect or a webhook body. Both are attacker-reachable:
 * the redirect passes through the user's browser, and the webhook URL is
 * public by necessity. Confirmation always re-fetches state from the
 * gateway server-to-server and requires orderStatus == 2. The manual
 * states the same rule: "Ne jamais valider une commande sur la seule
 * base de la redirection vers returnUrl."
 *
 * ── Vocabulary, because the two sides use the same words differently ─
 *   ClicToPay orderNumber = OUR reference  → {@link #composeOrderId}
 *   ClicToPay orderId     = THEIR UUID     → stored as Enrollment.paymentRef
 * {@link #retrievePayment} returns the former under the key "orderId",
 * which is what {@link #parseOrderId} and EnrollmentService consume.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PaymentService {

    private final StudentRepository studentRepository;
    private final CourseRepository courseRepository;
    private final WebClient.Builder webClientBuilder;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    /** ISO 4217 numeric code for the Tunisian dinar, per the manual. */
    private static final String CURRENCY_TND = "788";
    /** orderStatus 2 = "Paiement accepté — montant débité avec succès". */
    private static final int ORDER_STATUS_PAID = 2;
    /** Hard cap from the spec: orderNumber is AN..32. */
    private static final int ORDER_NUMBER_MAX = 32;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration TIMEOUT = Duration.ofSeconds(20);

    // Every property below defaults to empty. A deployment without
    // payment credentials must still start — the alternative is a
    // service that refuses to boot because a feature nobody is using yet
    // has not been configured.

    /** Test: https://test.clictopay.com/payment/rest/ — Production: https://ipay.clictopay.com/payment/rest/ */
    @Value("${clicktopay.api.base-url:}")
    private String baseUrl;

    /** "Nom d'utilisateur API" from the Cahier des Recettes. */
    @Value("${clicktopay.api.username:}")
    private String username;

    /** "Mot de passe API" — case sensitive. */
    @Value("${clicktopay.api.password:}")
    private String password;

    /**
     * Public HTTPS base the gateway redirects the user back to, e.g.
     * https://treyo.leanconsulting.com.tn. The success and failure paths
     * are appended to it. Must be reachable from the internet: ClicToPay
     * validates the integration against a deployed environment.
     */
    @Value("${clicktopay.return-url-base:}")
    private String returnUrlBase;

    /** Language of the hosted payment page and of error messages (fr / en / ar). */
    @Value("${clicktopay.api.language:fr}")
    private String language;

    /**
     * Template of the hosted page: DESKTOP (the gateway's default) or
     * MOBILE. MOBILE only works if that template is provisioned for the
     * merchant — when it is not, formUrl resolves to a page that does not
     * exist and the payer gets a 404 from ClicToPay. Leave blank to send
     * nothing and let the gateway decide.
     */
    @Value("${clicktopay.api.page-view:DESKTOP}")
    private String pageView;

    /** True once ATB has issued credentials and they are configured. */
    public boolean isConfigured() {
        return notBlank(baseUrl) && notBlank(username)
                && notBlank(password) && notBlank(returnUrlBase);
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

    /** The gateway answered, but with an error code (see §6.2 of the manual). */
    public static class PaymentGatewayException extends RuntimeException {
        public PaymentGatewayException(String message) {
            super(message);
        }
    }

    /**
     * Begin payment for an enrollment.
     *
     * @param groupId the group offer, carried in the orderNumber so a
     *                gateway event can route back to the right enrollment
     * @return { payUrl, paymentRef, orderNumber, amount, currency, free }
     */
    public Map<String, Object> createEnrollmentPayment(String studentId, String courseId, String groupId) {
        Student student = studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new IllegalArgumentException("Student not found: " + studentId));
        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new IllegalArgumentException("Course not found: " + courseId));

        // ClicToPay bills in MILLIMES (1 TND = 1000) with no decimal
        // separator. Course.price is stored in major TND units, e.g. 49.99.
        BigDecimal priceMajor = course.getPrice() == null ? BigDecimal.ZERO : course.getPrice();
        long amountMillimes = priceMajor.setScale(3, RoundingMode.HALF_UP)
                .movePointRight(3)
                .longValueExact();

        // Free courses never reach the gateway. The client sees
        // `free: true` and goes straight to the confirm endpoint.
        if (amountMillimes <= 0) {
            Map<String, Object> free = new HashMap<>();
            free.put("payUrl", null);
            free.put("paymentRef", null);
            free.put("amount", 0L);
            free.put("currency", "TND");
            free.put("free", true);
            return free;
        }

        String orderNumber = composeOrderId(studentId, courseId, groupId);

        if (!isConfigured()) {
            log.warn("Payment requested for order {} but ClicToPay is not configured", orderNumber);
            throw new PaymentProviderUnavailable(
                    "Online payment is not available yet. Paid enrollment opens once "
                            + "the bank has activated the merchant account.");
        }

        MultiValueMap<String, String> form = credentials();
        form.add("orderNumber", orderNumber);
        form.add("amount", String.valueOf(amountMillimes));
        form.add("currency", CURRENCY_TND);
        form.add("returnUrl", returnUrlBase + "/payment/success");
        form.add("failUrl", returnUrlBase + "/payment/failure");
        form.add("description", truncate(course.getTitle(), 512));
        form.add("language", language);
        if (notBlank(pageView)) {
            form.add("pageView", pageView);
        }

        // Logged without the credentials: the return URLs are the part that
        // goes wrong in practice, and the gateway echoes nothing about them.
        log.info("[ClicToPay] register.do request orderNumber={} amount={} currency={} returnUrl={} failUrl={} pageView={} language={}",
                orderNumber, amountMillimes, CURRENCY_TND,
                form.getFirst("returnUrl"), form.getFirst("failUrl"),
                form.getFirst("pageView"), form.getFirst("language"));

        Map<String, Object> response = post("register.do", form);

        String errorCode = str(response.get("errorCode"));
        if (errorCode != null && !"0".equals(errorCode)) {
            throw new PaymentGatewayException("ClicToPay refused the order (errorCode="
                    + errorCode + "): " + str(response.get("errorMessage")));
        }

        String orderId = str(response.get("orderId"));
        String formUrl = str(response.get("formUrl"));
        if (orderId == null || formUrl == null) {
            throw new PaymentGatewayException(
                    "ClicToPay returned no orderId/formUrl for order " + orderNumber);
        }

        Map<String, Object> out = new HashMap<>();
        out.put("payUrl", formUrl);
        out.put("paymentRef", orderId);
        out.put("orderNumber", orderNumber);
        out.put("amount", amountMillimes);
        out.put("currency", "TND");
        out.put("free", false);
        log.info("Payment initiated for {} / {} — orderNumber={} orderId={}",
                student.getStudentId(), course.getCourseId(), orderNumber, orderId);
        return out;
    }

    /**
     * Current state of a payment at the gateway, or null if unknown.
     *
     * Called by {@link EnrollmentService} before an enrollment row is
     * written, and by the webhook handler. Returning null must be safe:
     * callers treat it as "not paid".
     *
     * @param paymentRef the ClicToPay orderId (UUID) from register.do
     */
    public Map<String, Object> retrievePayment(String paymentRef) {
        if (!isConfigured()) {
            // Not an exception: callers ask "is this paid?", and with no
            // gateway the honest answer is "no", not a 500.
            return null;
        }
        if (paymentRef == null || paymentRef.isBlank()) {
            return null;
        }

        MultiValueMap<String, String> form = credentials();
        form.add("orderId", paymentRef);
        form.add("language", language);

        Map<String, Object> response;
        try {
            response = post("getOrderStatusExtended.do", form);
        } catch (RuntimeException e) {
            // A gateway that cannot be reached must not become a 500 on
            // the confirm path: unknown means "not paid".
            log.error("ClicToPay getOrderStatusExtended.do failed for {}: {}",
                    paymentRef, e.getMessage());
            return null;
        }
        // Only the fields that explain an outcome. The full response was
        // logged verbatim, which put cardAuthInfo — including the
        // cardholder's name — into the application log on every payment
        // check: personal data accumulating in plain text, retained for
        // as long as logs are, and mentioned nowhere in the privacy
        // policy. The whole body is still available at DEBUG for a
        // developer chasing a specific failure.
        log.info("ClicToPay getOrderStatusExtended.do orderId={} orderStatus={} errorCode={} actionCode={}",
                paymentRef, response.get("orderStatus"), response.get("errorCode"),
                response.get("actionCode"));
        log.debug("ClicToPay getOrderStatusExtended.do orderId={} response={}", paymentRef, response);

        String errorCode = str(response.get("errorCode"));
        if (errorCode != null && !"0".equals(errorCode)) {
            log.warn("ClicToPay lookup error for {} (errorCode={}): {}",
                    paymentRef, errorCode, str(response.get("errorMessage")));
            return null;
        }

        Integer orderStatus = intOrNull(response.get("orderStatus"));
        Map<String, Object> out = new HashMap<>();
        // Mapped onto the provider-agnostic vocabulary the rest of the
        // application uses: only orderStatus 2 is a completed payment.
        out.put("status", orderStatus != null && orderStatus == ORDER_STATUS_PAID ? "completed" : "not_completed");
        // Our own reference, which is what the callers match against.
        out.put("orderId", str(response.get("orderNumber")));
        out.put("amount", response.get("amount"));
        out.put("currency", str(response.get("currency")));
        out.put("orderStatus", orderStatus);
        out.put("actionCode", response.get("actionCode"));
        out.put("actionCodeDescription", str(response.get("actionCodeDescription")));
        out.put("gatewayOrderId", paymentRef);
        addCardDisplay(response, out);
        return out;
    }

    /**
     * The two things we may keep about the card: its brand, and its last
     * four digits.
     *
     * ClicToPay's anti-fraud terms are stricter than PCI-DSS here —
     * "ne stockez jamais les données de carte bancaire (numéro, CVV,
     * date d'expiration)" — so the expiry is deliberately not read, even
     * though the gateway returns it and PCI-DSS would allow storing it
     * beside a masked pan. The cardholder name is skipped for the same
     * reason plus one more: it is personal data we have no use for.
     *
     * Everything here is optional. A gateway response without card
     * details is normal (a refused payment never had a card attached),
     * and the screen shows the method as unknown rather than guessing.
     */
    @SuppressWarnings("unchecked")
    private void addCardDisplay(Map<String, Object> response, Map<String, Object> out) {
        Object node = response.get("cardAuthInfo");
        if (!(node instanceof Map<?, ?> cardInfo)) return;

        // The gateway masks the pan itself — something like
        // "411111**1111" — so the last four are all that is taken, and
        // the full value never lands anywhere.
        String maskedPan = str(((Map<String, Object>) cardInfo).get("maskedPan"));
        if (maskedPan != null && maskedPan.length() >= 4) {
            String digits = maskedPan.replaceAll("[^0-9]", "");
            if (digits.length() >= 4) {
                out.put("cardLast4", digits.substring(digits.length() - 4));
            }
        }

        // Named differently across gateway versions; both are the brand.
        String brand = str(((Map<String, Object>) cardInfo).get("paymentSystem"));
        if (brand == null) brand = str(response.get("paymentSystem"));
        if (brand != null && !brand.isBlank()) {
            out.put("cardBrand", brand.toUpperCase());
        }
    }

    /**
     * True iff the gateway confirms this payment completed AND its
     * orderNumber refers to the student and course being enrolled.
     *
     * The identity check is not redundant. Without it a valid reference
     * for a cheap course could be replayed to unlock an expensive one —
     * the payment is genuine, just not for this thing.
     */
    public boolean isPaidFor(String paymentRef, String expectedStudentId, String expectedCourseId) {
        Map<String, Object> payment = retrievePayment(paymentRef);
        if (payment == null) return false;
        if (!"completed".equals(String.valueOf(payment.get("status")))) return false;
        return matches(str(payment.get("orderId")), expectedStudentId, expectedCourseId);
    }

    /** True when an orderNumber refers to exactly this student and course. */
    public boolean matches(String orderNumber, String expectedStudentId, String expectedCourseId) {
        OrderId parsed = parseOrderId(orderNumber);
        return parsed != null
                && parsed.studentId().equals(expectedStudentId)
                && parsed.courseId().equals(expectedCourseId);
    }

    /**
     * Parse an orderNumber back into its parts, for routing a gateway
     * event to the right enrollment. Returns null when it is unparseable.
     */
    public OrderId parseOrderId(String orderNumber) {
        if (orderNumber == null) return null;
        String[] parts = orderNumber.split(":", -1);
        if (parts.length != 4) return null;
        String studentId = expand(parts[0], "STU_");
        String courseId = expand(parts[1], "CRS_");
        String groupId = parts[2].isEmpty() ? null : expand(parts[2], "GRP_");
        if (studentId == null || courseId == null) return null;
        return new OrderId(studentId, courseId, groupId);
    }

    public record OrderId(String studentId, String courseId, String groupId) {}

    // ─── helpers ────────────────────────────────────────────────────

    /**
     * Build the orderNumber the gateway stores and echoes back.
     *
     * Two constraints from the spec drive the format: it is AN..32, and
     * it must be unique per merchant — a repeat is rejected with
     * errorCode 1, which would otherwise break every retry after a
     * refused card. So the identifiers are carried without their fixed
     * prefixes (STU_ / CRS_ / GRP_, re-added on parse) and a short
     * random nonce makes each attempt distinct:
     *
     *   8 + 1 + 8 + 1 + 8 + 1 + 4 = 31 characters, groupId optional.
     */
    private String composeOrderId(String studentId, String courseId, String groupId) {
        String order = shorten(studentId, "STU_") + ":"
                + shorten(courseId, "CRS_") + ":"
                + (groupId == null || groupId.isBlank() ? "" : shorten(groupId, "GRP_")) + ":"
                + nonce();
        if (order.length() > ORDER_NUMBER_MAX) {
            // Unreachable with current id formats; fail loudly rather
            // than let the gateway reject the order with errorCode 5.
            throw new IllegalStateException(
                    "orderNumber exceeds " + ORDER_NUMBER_MAX + " characters: " + order);
        }
        return order;
    }

    /** Drop the fixed prefix so the composite fits in 32 characters. */
    private String shorten(String id, String prefix) {
        return id != null && id.startsWith(prefix) ? id.substring(prefix.length()) : id;
    }

    /** Re-add the prefix stripped by {@link #shorten}. */
    private String expand(String part, String prefix) {
        if (part == null || part.isEmpty()) return null;
        return part.startsWith(prefix) ? part : prefix + part;
    }

    /** 4 base-36 characters — enough to separate retries of one order. */
    private String nonce() {
        StringBuilder sb = new StringBuilder(4);
        String alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        for (int i = 0; i < 4; i++) {
            sb.append(alphabet.charAt(RANDOM.nextInt(alphabet.length())));
        }
        return sb.toString();
    }

    private MultiValueMap<String, String> credentials() {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("userName", username);
        form.add("password", password);
        return form;
    }

    /**
     * One form-encoded POST. The API answers 200 with a JSON body even
     * for business errors, which the callers read from errorCode.
     *
     * The raw body is logged verbatim, not the parsed map: the cahier
     * des recettes requires the untouched JSON of each call, taken from
     * the site's own logs, and explicitly rejects results produced with
     * simulation tools such as Postman.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> post(String path, MultiValueMap<String, String> form) {
        String raw = postRaw(path, form);
        try {
            return objectMapper.readValue(raw, Map.class);
        } catch (Exception e) {
            throw new PaymentGatewayException(
                    "Unreadable response from ClicToPay " + path + ": " + raw);
        }
    }

    /** The untouched response body, logged verbatim. */
    private String postRaw(String path, MultiValueMap<String, String> form) {
        String raw = webClientBuilder.build()
                .post()
                .uri(normalizedBase() + path)
                .body(BodyInserters.fromFormData(form))
                .retrieve()
                .bodyToMono(String.class)
                .block(TIMEOUT);
        log.info("[ClicToPay] {} raw response: {}", path, raw);
        if (raw == null || raw.isBlank()) {
            throw new PaymentGatewayException("Empty response from ClicToPay " + path);
        }
        return raw;
    }

    // ─── Cahier des recettes: cases the normal flow cannot produce ───

    /**
     * CTP-06, CTP-07 and CTP-08 require calls a real enrollment never
     * makes — a request with a missing parameter, a deliberately
     * duplicated orderNumber, and a lookup of an order that does not
     * exist. They are run from here so the evidence comes from the
     * application's own logs: the cahier rejects results produced with
     * simulation tools such as Postman.
     *
     * Refused outside the sandbox: these calls register junk orders and
     * have no business running against a live merchant account.
     */
    public Map<String, Object> runSandboxCase(String caseId) {
        if (!isConfigured()) {
            throw new PaymentProviderUnavailable("ClicToPay is not configured.");
        }
        if (!normalizedBase().contains("test.clictopay.com")) {
            throw new IllegalStateException(
                    "Sandbox diagnostics only run against https://test.clictopay.com — "
                            + "current base-url is " + baseUrl);
        }

        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("case", caseId);

        switch (caseId) {
            case "CTP-06" -> {
                // register.do with no amount at all → expected errorCode 4,
                // "Montant vide", and no orderId.
                MultiValueMap<String, String> form = credentials();
                form.add("orderNumber", "MISSING-AMOUNT-" + nonce());
                form.add("currency", CURRENCY_TND);
                form.add("returnUrl", returnUrlBase + "/payment/success");
                out.put("expected", "errorCode != 0, descriptive message, no orderId");
                out.put("response", postRaw("register.do", form));
            }
            case "CTP-07" -> {
                // The same orderNumber twice. The cahier names the value.
                out.put("expected", "second call: error, or the same orderId — never a silent duplicate");
                out.put("response1", postRaw("register.do", duplicateOrderForm()));
                out.put("response2", postRaw("register.do", duplicateOrderForm()));
            }
            case "CTP-08" -> {
                // A well-formed UUID that was never registered.
                MultiValueMap<String, String> form = credentials();
                form.add("orderId", "00000000-0000-0000-0000-000000000000");
                form.add("language", language);
                out.put("expected", "errorCode != 0, handled cleanly, no crash");
                out.put("response", postRaw("getOrderStatusExtended.do", form));
            }
            default -> throw new IllegalArgumentException(
                    "Unknown case: " + caseId + " (expected CTP-06, CTP-07 or CTP-08)");
        }
        return out;
    }

    /** Both halves of CTP-07 must send exactly the same orderNumber. */
    private MultiValueMap<String, String> duplicateOrderForm() {
        MultiValueMap<String, String> form = credentials();
        form.add("orderNumber", "ORDER-DUP-TEST");
        form.add("amount", "10000");
        form.add("currency", CURRENCY_TND);
        form.add("returnUrl", returnUrlBase + "/payment/success");
        form.add("failUrl", returnUrlBase + "/payment/failure");
        form.add("language", language);
        return form;
    }

    private String normalizedBase() {
        return baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    /** orderStatus comes back as a number, actionCode sometimes as a string. */
    private static Integer intOrNull(Object o) {
        if (o instanceof Number n) return n.intValue();
        if (o == null) return null;
        try {
            return Integer.valueOf(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max);
    }

    private boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
