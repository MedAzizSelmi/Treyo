package com.byb.backend.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Where the payment gateway sends the user's browser after a payment.
 *
 * These two URLs are declared to SMT on the Fiche Technique as "URL de
 * retour par défaut si le paiement est accepté / refusé". Changing a path
 * here means re-filing that form with the bank, so treat them as a
 * published contract rather than internal routes.
 *
 * ── Why a web page and not a deep link ──────────────────────────────
 * The natural target for a mobile app is its custom scheme
 * (treyomobile://). The Fiche Technique wants an http(s) URL, and
 * gateways generally reject custom schemes because their hosted page
 * has to be able to navigate there from a normal browser. So these are
 * ordinary HTTPS pages whose only job is to bounce into the app.
 *
 * ── Why they say nothing about whether the payment succeeded ────────
 * A redirect passes through the user's browser and is therefore under
 * the user's control — /payment/success can be opened by anyone, at any
 * time, by typing it. Nothing here writes to the database or grants
 * anything. The app treats the return purely as "the user came back" and
 * then asks the backend, which asks the gateway. Confirmation happens in
 * EnrollmentService and the webhook, both of which re-verify
 * server-to-server.
 *
 * They must answer 200 to a plain GET even before payments work — SMT
 * may probe them when validating the merchant application, and a 404
 * risks bouncing it.
 */
@RestController
@Slf4j
@Tag(name = "Payments", description = "Gateway return pages")
public class PaymentReturnController {

    /** Custom scheme the mobile app registers for payment returns. */
    private static final String APP_SCHEME = "treyomobile://payment-return";

    @GetMapping(value = "/payment/success", produces = MediaType.TEXT_HTML_VALUE)
    @Operation(summary = "Gateway return page — payment accepted")
    public ResponseEntity<String> success(
            @RequestParam(required = false) String orderId,
            @RequestParam(required = false) String paymentRef) {
        log.info("Payment return (success) orderId={} paymentRef={}", orderId, paymentRef);
        return page("success", paymentRef,
                "Paiement confirmé",
                "Retour à l'application…");
    }

    @GetMapping(value = "/payment/failure", produces = MediaType.TEXT_HTML_VALUE)
    @Operation(summary = "Gateway return page — payment refused or failed")
    public ResponseEntity<String> failure(
            @RequestParam(required = false) String orderId,
            @RequestParam(required = false) String paymentRef) {
        log.info("Payment return (failure) orderId={} paymentRef={}", orderId, paymentRef);
        return page("failed", paymentRef,
                "Paiement non abouti",
                "Retour à l'application…");
    }

    /**
     * A self-contained page that hands control back to the app.
     *
     * Three ways out, in order: an immediate script navigation, a meta
     * refresh for browsers that block it, and a visible link if both are
     * ignored or the app is not installed. Without the third, a user on a
     * desktop browser sees a blank page and no way forward.
     */
    private ResponseEntity<String> page(String status, String paymentRef,
                                        String heading, String subtext) {
        String target = APP_SCHEME + "?status=" + enc(status)
                + (paymentRef == null ? "" : "&paymentRef=" + enc(paymentRef));

        String html = """
                <!doctype html>
                <html lang="fr">
                <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <meta http-equiv="refresh" content="0;url=%s">
                <title>%s</title>
                <style>
                  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
                       display:flex;min-height:100vh;margin:0;align-items:center;
                       justify-content:center;background:#f6f7f9;color:#111}
                  .card{text-align:center;padding:2rem 1.5rem;max-width:22rem}
                  h1{font-size:1.25rem;margin:0 0 .5rem}
                  p{color:#555;margin:0 0 1.5rem}
                  a{display:inline-block;padding:.7rem 1.4rem;border-radius:.5rem;
                    background:#111;color:#fff;text-decoration:none;font-weight:600}
                  @media (prefers-color-scheme:dark){
                    body{background:#111;color:#f6f7f9}
                    p{color:#aaa} a{background:#f6f7f9;color:#111}
                  }
                </style>
                </head>
                <body>
                  <div class="card">
                    <h1>%s</h1>
                    <p>%s</p>
                    <a href="%s">Ouvrir Treyo</a>
                  </div>
                  <script>location.replace(%s);</script>
                </body>
                </html>
                """.formatted(
                        escapeAttr(target), escapeText(heading),
                        escapeText(heading), escapeText(subtext),
                        escapeAttr(target), jsString(target));

        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .body(html);
    }

    // Values reaching these pages come from the gateway's redirect, which
    // means they arrive via the user's browser and are attacker-supplied.
    // They are echoed into a URL that lands in an href and a script, so
    // each context gets its own escaping.

    private static String enc(String s) {
        return java.net.URLEncoder.encode(s, java.nio.charset.StandardCharsets.UTF_8);
    }

    private static String escapeText(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String escapeAttr(String s) {
        return escapeText(s).replace("\"", "&quot;").replace("'", "&#39;");
    }

    /** JSON-quoted, so the value cannot terminate the script literal. */
    private static String jsString(String s) {
        return "\"" + s.replace("\\", "\\\\")
                       .replace("\"", "\\\"")
                       .replace("<", "\\u003c")
                       .replace(">", "\\u003e") + "\"";
    }
}
