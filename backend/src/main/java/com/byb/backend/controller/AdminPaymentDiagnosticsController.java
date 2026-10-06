package com.byb.backend.controller;

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
 * The three cahier-des-recettes cases a real enrollment cannot produce:
 * a register.do missing a mandatory parameter (CTP-06), a duplicated
 * orderNumber (CTP-07), and a status lookup for an order that does not
 * exist (CTP-08).
 *
 * It lives under /api/admin/** so SecurityConfig restricts it to the
 * ADMIN role, and PaymentService refuses to run it unless the configured
 * base URL is the ClicToPay sandbox — registering junk orders against a
 * live merchant account is not something an endpoint should make easy.
 *
 * The response carries the gateway's raw JSON, which is what the
 * workbook asks to be pasted into column G; the same text is written to
 * the application log, since the cahier requires the evidence to come
 * from the site's own logs rather than from a simulation tool.
 */
@RestController
@RequestMapping("/api/admin/payments")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Payments", description = "ClicToPay sandbox diagnostics")
@SecurityRequirement(name = "bearerAuth")
public class AdminPaymentDiagnosticsController {

    private final PaymentService paymentService;

    @PostMapping("/sandbox-check")
    @Operation(summary = "Run a cahier-des-recettes case (CTP-06, CTP-07 or CTP-08) against the sandbox")
    public ResponseEntity<?> sandboxCheck(@RequestParam String caseId) {
        try {
            return ResponseEntity.ok(paymentService.runSandboxCase(caseId.trim().toUpperCase()));
        } catch (PaymentService.PaymentProviderUnavailable e) {
            return ResponseEntity.status(503).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (RuntimeException e) {
            log.error("Sandbox case {} failed", caseId, e);
            return ResponseEntity.status(502).body(Map.of(
                    "error", "Gateway call failed",
                    "message", e.getMessage() == null ? "unknown" : e.getMessage()));
        }
    }
}
