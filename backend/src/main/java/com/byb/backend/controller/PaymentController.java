package com.byb.backend.controller;

import com.byb.backend.service.EnrollmentService;
import com.byb.backend.service.PaymentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Konnect payment endpoints. Paired with EnrollmentController.confirmEnrollment
 * which now requires a successful Konnect payment ref before flipping
 * an enrollment row to "confirmed".
 *
 * Flow recap (single source of truth, mirrored in PaymentService docstring):
 *   1. Mobile calls POST /api/payments/enrollment-payment → we create
 *      a Konnect payment, get back payUrl + paymentRef.
 *   2. Mobile opens payUrl in a browser/WebView. User pays.
 *   3. Konnect redirects back to the app's custom scheme.
 *   4. Mobile calls POST /api/enrollments/confirm with the paymentRef.
 *   5. Backend re-verifies status with Konnect's API before writing the row.
 *
 * Optional: Konnect's webhook can land at /api/payments/konnect-webhook
 * for server-driven confirmation when the backend is publicly reachable.
 * It's permitAll because Konnect won't have a JWT.
 */
@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
@Tag(name = "Payments", description = "Konnect payment flow for enrollments")
public class PaymentController {

    private final PaymentService paymentService;
    private final EnrollmentService enrollmentService;

    /**
     * Initialise a Konnect payment for an enrollment. The mobile app
     * opens the returned `payUrl` and the user pays on Konnect's hosted
     * page. The `paymentRef` is what we'll use later to verify.
     */
    @PostMapping("/enrollment-payment")
    @Operation(summary = "Create a Konnect payment for an enrollment")
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
        } catch (RuntimeException e) {
            // Konnect-side failure — bubble the message so the client can
            // show something useful instead of a generic 500.
            return ResponseEntity.status(502).body(Map.of(
                    "error", "Payment provider error",
                    "message", e.getMessage() == null ? "Could not initialise payment" : e.getMessage()
            ));
        }
    }

    /**
     * Konnect webhook. Konnect calls this with `payment_ref` when a
     * payment's state changes (typically "completed" or "failed"). We
     * verify the status server-to-server (never trust the webhook body
     * alone) and, on success, create the Enrollment row if it doesn't
     * exist yet.
     *
     * Idempotent — Konnect retries on non-2xx, so calling twice with the
     * same paymentRef must NOT create two enrollments. EnrollmentService
     * handles the "already enrolled" case as a no-op success.
     *
     * Lives at /api/payments/konnect-webhook and is permitAll in
     * SecurityConfig (Konnect won't have a JWT).
     */
    @PostMapping("/konnect-webhook")
    @Operation(summary = "Webhook target for Konnect payment state changes")
    public ResponseEntity<Map<String, String>> konnectWebhook(
            @RequestParam(name = "payment_ref", required = false) String paymentRef) {
        if (paymentRef == null || paymentRef.isBlank()) {
            return ResponseEntity.ok(Map.of("status", "ignored", "reason", "no payment_ref"));
        }

        // Server-driven verification. Never trust webhook contents alone —
        // re-fetch state from Konnect's API and act on that.
        Map<String, Object> payment = paymentService.retrievePayment(paymentRef);
        if (payment == null) {
            return ResponseEntity.ok(Map.of("status", "ignored", "reason", "payment not found"));
        }

        String status = String.valueOf(payment.get("status"));
        if (!"completed".equals(status)) {
            // Pending / failed — just acknowledge so Konnect stops retrying.
            return ResponseEntity.ok(Map.of("status", "noted", "konnect_status", status));
        }

        // Route to the right enrollment via the orderId we stamped at
        // init-payment time.
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
            // "Already enrolled" reaches here on webhook retries — that's
            // expected and OK; just acknowledge.
            if (e.getMessage() != null && e.getMessage().toLowerCase().contains("already enrolled")) {
                return ResponseEntity.ok(Map.of("status", "already_confirmed"));
            }
            // Anything else is an actual failure — return 500 so Konnect
            // retries later when the backend recovers.
            return ResponseEntity.status(500).body(Map.of(
                    "status", "error",
                    "message", e.getMessage() == null ? "unknown" : e.getMessage()
            ));
        }
    }
}
