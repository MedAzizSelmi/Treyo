package com.byb.backend.controller;

import com.byb.backend.service.EnrollmentService;
import com.byb.backend.service.PaymentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * ClicToPay payment endpoints, paired with EnrollmentController.confirmEnrollment
 * which requires a verified payment reference before an enrollment row
 * is flipped to "confirmed".
 *
 * Flow recap (mirrored in the PaymentService docstring):
 *   1. Mobile calls POST /api/payments/enrollment-payment → payUrl + paymentRef.
 *   2. Mobile opens payUrl. The user pays, including the 3-D Secure step.
 *   3. The gateway redirects to /payment/success or /payment/failure
 *      (see PaymentReturnController), which bounce into the app.
 *   4. Mobile calls POST /api/enrollments/confirm with the paymentRef.
 *   5. The backend re-verifies with the gateway before writing the row.
 *
 * The webhook below is permitAll because the gateway calls it
 * server-to-server with no JWT. It re-verifies every event before acting,
 * so being publicly reachable is not the same as being trusted.
 */
@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Payments", description = "ClicToPay payment flow for enrollments")
public class PaymentController {

    private final PaymentService paymentService;
    private final EnrollmentService enrollmentService;

    /**
     * Initialise a payment for an enrollment. The mobile app opens the
     * returned `payUrl`; `paymentRef` is what we verify against later.
     */
    @PostMapping("/enrollment-payment")
    @Operation(summary = "Create a ClicToPay payment for an enrollment")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<?> createEnrollmentPayment(
            @RequestParam String studentId,
            @RequestParam String courseId,
            @RequestParam(required = false) String groupId) {
        try {
            Map<String, Object> payment = paymentService.createEnrollmentPayment(studentId, courseId, groupId);
            return ResponseEntity.ok(payment);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (PaymentService.PaymentProviderUnavailable e) {
            // 503, not 502: nothing is broken, the capability does not
            // exist yet. The client can show "coming soon" rather than
            // inviting the user to retry a failure that will not clear.
            return ResponseEntity.status(503).body(Map.of(
                    "error", "Payment unavailable",
                    "message", e.getMessage()
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.status(502).body(Map.of(
                    "error", "Payment provider error",
                    "message", e.getMessage() == null ? "Could not initialise payment" : e.getMessage()
            ));
        }
    }

    /**
     * ClicToPay webhook. Declared to SMT on the Fiche Technique as
     * "URL de notification" — changing this path means re-filing that
     * form, so treat it as a published contract, not an internal route.
     *
     * Accepts the notification, re-verifies the payment server-to-server,
     * and on success creates the Enrollment row if it does not exist.
     *
     * Idempotent: gateways retry on non-2xx, so the same reference
     * arriving twice must not create two enrollments. EnrollmentService
     * treats "already enrolled" as a no-op success.
     *
     * Parameter names are deliberately permissive — the exact field the
     * gateway posts is part of the specification SMT has not released,
     * so both a snake_case and a camelCase form are accepted and the
     * whole body is logged for the first real callback.
     */
    @PostMapping("/clicktopay-webhook")
    @Operation(summary = "Webhook target for ClicToPay payment notifications")
    public ResponseEntity<Map<String, String>> clicktopayWebhook(
            @RequestParam(name = "payment_ref", required = false) String paymentRefSnake,
            @RequestParam(name = "paymentRef", required = false) String paymentRefCamel,
            @RequestParam(name = "orderId", required = false) String orderIdParam,
            @RequestBody(required = false) Map<String, Object> body) {

        // Until the specification lands, capture everything. The first
        // genuine callback from SMT tells us the field names, which is
        // otherwise the hardest part to guess correctly.
        log.info("ClicToPay webhook received: payment_ref={}, paymentRef={}, orderId={}, body={}",
                paymentRefSnake, paymentRefCamel, orderIdParam, body);

        String paymentRef = paymentRefSnake != null ? paymentRefSnake : paymentRefCamel;
        if (paymentRef == null && body != null) {
            Object fromBody = body.getOrDefault("payment_ref", body.get("paymentRef"));
            if (fromBody != null) paymentRef = String.valueOf(fromBody);
        }

        if (paymentRef == null || paymentRef.isBlank()) {
            // 200, not 4xx. A gateway that gets an error status retries,
            // and retrying will not add a reference that was never sent.
            return ResponseEntity.ok(Map.of("status", "ignored", "reason", "no payment reference"));
        }

        // Server-driven verification. The body above is a hint that
        // something happened, never evidence of what.
        Map<String, Object> payment = paymentService.retrievePayment(paymentRef);
        if (payment == null) {
            return ResponseEntity.ok(Map.of("status", "ignored", "reason", "payment not found"));
        }

        String status = String.valueOf(payment.get("status"));
        if (!"completed".equals(status)) {
            return ResponseEntity.ok(Map.of("status", "noted", "gateway_status", status));
        }

        PaymentService.OrderId order = paymentService.parseOrderId(
                String.valueOf(payment.get("orderId")));
        if (order == null) {
            return ResponseEntity.ok(Map.of("status", "ignored", "reason", "unparseable orderId"));
        }

        try {
            enrollmentService.confirmEnrollment(
                    order.studentId(),
                    order.courseId(),
                    order.groupId(),
                    paymentRef);
            return ResponseEntity.ok(Map.of("status", "confirmed"));
        } catch (RuntimeException e) {
            if (e.getMessage() != null && e.getMessage().toLowerCase().contains("already enrolled")) {
                return ResponseEntity.ok(Map.of("status", "already_confirmed"));
            }
            // A real failure — 500 so the gateway retries once we recover.
            return ResponseEntity.status(500).body(Map.of(
                    "status", "error",
                    "message", e.getMessage() == null ? "unknown" : e.getMessage()
            ));
        }
    }
}
