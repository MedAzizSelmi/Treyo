package com.byb.backend.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;

/**
 * Thin wrapper around Spring's mail sender for transactional emails
 * (verification + password reset). Plain-HTML templates rendered
 * inline — fine for two messages; if we ever ship marketing emails
 * we'd swap to Thymeleaf or a template engine.
 *
 * All sends are @Async so signup / forgot-password don't block on
 * the SMTP round trip. The endpoint returns immediately; failure is
 * logged but never thrown — re-sending is cheap and the alternative
 * is leaving the user with a 500 they don't know how to react to.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${app.mail.from:no-reply@treyo.app}")
    private String fromAddress;

    @Value("${app.mail.from-name:Treyo}")
    private String fromName;

    /** Brand colour used in the email button. Pulled out so the
     *  marketing team can tweak it later without code changes. */
    private static final String BRAND = "#7cce06";

    /**
     * Verification + reset emails carry the token once, inside the
     * button's link. They used to also print it as a copyable code,
     * because {@code app.url} pointed at a site with no page to receive
     * the click — pasting the code into the app was the only route that
     * worked. The pages at /verify-email and /reset-password exist now,
     * so the code block is gone: one action, nothing to copy, and a
     * secret that no longer sits in the body of the message where it can
     * be read over a shoulder or forwarded by accident.
     */
    @Async
    public void sendVerificationEmail(String toEmail, String userName, String verifyLink) {
        String subject = "Verify your Treyo email";
        String html = simpleTemplate(
                "Welcome to Treyo!",
                "Hi " + safe(userName) + ",",
                "Tap the button below to confirm your email address. " +
                        "The link expires in 24 hours.",
                "Verify email",
                verifyLink,
                "If you didn't sign up for Treyo, you can ignore this message."
        );
        send(toEmail, subject, html);
    }

    @Async
    public void sendPasswordResetEmail(String toEmail, String userName, String resetLink) {
        String subject = "Reset your Treyo password";
        String html = simpleTemplate(
                "Reset your password",
                "Hi " + safe(userName) + ",",
                "Tap the button below to choose a new password. " +
                        "The link expires in 15 minutes.",
                "Reset password",
                resetLink,
                "If you didn't request this, you can safely ignore the email — " +
                        "your password won't change."
        );
        send(toEmail, subject, html);
    }

    /**
     * Sent when an admin clicks "Approve" on a pending trainer. The
     * trainer can sign in immediately after — we tell them so they
     * know what to do next.
     */
    @Async
    public void sendTrainerApprovalEmail(String toEmail, String trainerName) {
        String subject = "Your Treyo trainer application is approved";
        String html = simpleTemplate(
                "You're in!",
                "Hi " + safe(trainerName) + ",",
                "Great news — your trainer application has been approved. " +
                        "You can now sign in to Treyo and start receiving courses.",
                "Open Treyo",
                "treyomobile://login",
                "Welcome aboard. The team is excited to have you teaching."
        );
        send(toEmail, subject, html);
    }

    /**
     * Sent when an admin clicks "Reject". Optional `note` is included
     * verbatim if the admin filled it in, so the trainer knows what
     * needs to change before they can re-apply.
     */
    @Async
    public void sendTrainerRejectionEmail(String toEmail, String trainerName, String note) {
        String subject = "Update on your Treyo trainer application";
        String body = "Thanks for taking the time to apply as a Treyo trainer. " +
                "After reviewing your profile we've decided not to move forward at this time.";
        if (note != null && !note.isBlank()) {
            body += "\n\nNote from our team: " + note;
        }
        body += "\n\nIf your situation changes or you'd like to apply again later, you're welcome to.";
        String html = simpleTemplate(
                "About your trainer application",
                "Hi " + safe(trainerName) + ",",
                body,
                null,
                null,
                "Questions? Reply to this email and the team will get back to you."
        );
        send(toEmail, subject, html);
    }

    /**
     * The shell every transactional email uses: headline, greeting,
     * body, an optional call-to-action button (pass null label + href
     * to skip it) and a footer. Inline styles only — Gmail and Outlook
     * strip <style> tags.
     */
    private String simpleTemplate(
            String headline, String greeting, String body,
            String buttonLabel, String buttonHref,
            String footer
    ) {
        String button = "";
        if (buttonLabel != null && buttonHref != null) {
            button = "<tr><td align=\"center\" style=\"padding:8px 0 24px;\">" +
                    "<a href=\"" + safe(buttonHref) + "\" style=\"display:inline-block;background:" + BRAND + ";color:#000;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;\">" +
                    safe(buttonLabel) + "</a></td></tr>";
        }
        return "<!DOCTYPE html><html><body style=\"margin:0;padding:0;background:#f7f8fa;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;\">" +
                "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#f7f8fa;padding:32px 16px;\"><tr><td align=\"center\">" +
                "<table role=\"presentation\" width=\"100%\" style=\"max-width:520px;background:#ffffff;border-radius:14px;padding:32px;\" cellspacing=\"0\" cellpadding=\"0\">" +
                "<tr><td style=\"font-size:22px;font-weight:700;color:#1a1a2e;padding-bottom:12px;\">" + safe(headline) + "</td></tr>" +
                "<tr><td style=\"font-size:14px;color:#444;padding-bottom:8px;\">" + safe(greeting) + "</td></tr>" +
                "<tr><td style=\"font-size:14px;color:#444;line-height:21px;padding-bottom:20px;white-space:pre-wrap;\">" + safe(body) + "</td></tr>" +
                button +
                "<tr><td style=\"font-size:12px;color:#888;line-height:18px;padding-top:16px;border-top:1px solid #eee;\">" + safe(footer) + "</td></tr>" +
                "<tr><td style=\"font-size:11px;color:#aaa;padding-top:16px;\">Treyo · Smart match, swift growth</td></tr>" +
                "</table></td></tr></table></body></html>";
    }

    /** Notify a trainer that a course they submitted was approved.
     *  Course goes live immediately for students. */
    @Async
    public void sendCourseApprovalEmail(String toEmail, String trainerName, String courseTitle) {
        String subject = "Your course is live";
        String html = simpleTemplate(
                "Course approved",
                "Hi " + safe(trainerName) + ",",
                "Great news — your course \"" + safe(courseTitle) + "\" has been approved " +
                        "and is now visible to students. Interested students can start " +
                        "requesting to join right away.",
                "Open Treyo",
                "treyomobile://login",
                "Thanks for the quality submission."
        );
        send(toEmail, subject, html);
    }

    /** Notify a trainer that a course was rejected, with the admin's
     *  optional reason included verbatim. */
    @Async
    public void sendCourseRejectionEmail(String toEmail, String trainerName, String courseTitle, String note) {
        String subject = "Update on your course submission";
        String body = "Thanks for submitting \"" + courseTitle + "\". After reviewing it " +
                "we've asked for changes before it can go live.";
        if (note != null && !note.isBlank()) {
            body += "\n\nNote from the review team: " + note;
        }
        body += "\n\nYou can edit the course from the Treyo app and re-submit — the reviewer will take another look.";
        String html = simpleTemplate(
                "Course needs changes",
                "Hi " + safe(trainerName) + ",",
                body,
                null,
                null,
                "Questions? Reply to this email."
        );
        send(toEmail, subject, html);
    }

    /**
     * Confirm a payment, with the receipt attached.
     *
     * Until this existed a learner who paid got nothing they could keep:
     * the gateway's result page vanishes, and the only record was a row
     * inside the app. The attachment is also the "correspondance client"
     * side of the evidence ClicToPay expect to be retained for 18 months
     * against a chargeback.
     *
     * The PDF is passed in rather than built here — rendering belongs to
     * ReceiptService, and this method stays about delivery.
     */
    public void sendPaymentReceiptEmail(String toEmail, String learnerName,
                                        String courseTitle, String amountLabel,
                                        byte[] receiptPdf, String receiptFilename) {
        String subject = "Your Treyo receipt — " + (courseTitle == null ? "enrolment" : courseTitle);
        String html = simpleTemplate(
                "Payment received",
                "Hi " + (learnerName == null || learnerName.isBlank() ? "there" : learnerName) + ",",
                "Thanks — your payment of <strong>" + safe(amountLabel) + "</strong> for <strong>"
                        + safe(courseTitle) + "</strong> went through, and your place is confirmed."
                        + "<br><br>Your receipt is attached as a PDF.",
                null,
                null,
                "Keep this email: the attached receipt is your proof of payment."
        );
        send(toEmail, subject, html, receiptPdf, receiptFilename);
    }

    private void send(String toEmail, String subject, String html) {
        send(toEmail, subject, html, null, null);
    }

    private void send(String toEmail, String subject, String html,
                      byte[] attachment, String attachmentName) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            // Multipart only when there is something to attach. A
            // multipart message with a single part is still valid, but
            // some clients render it with a phantom empty attachment,
            // so the plain messages stay exactly as they were.
            boolean multipart = attachment != null && attachment.length > 0;
            MimeMessageHelper helper = new MimeMessageHelper(
                    message,
                    multipart ? MimeMessageHelper.MULTIPART_MODE_MIXED
                              : MimeMessageHelper.MULTIPART_MODE_NO,
                    StandardCharsets.UTF_8.name());
            if (multipart) {
                helper.addAttachment(
                        attachmentName == null ? "receipt.pdf" : attachmentName,
                        new org.springframework.core.io.ByteArrayResource(attachment),
                        "application/pdf");
            }
            helper.setFrom(fromAddress, fromName);
            helper.setTo(toEmail);
            helper.setSubject(subject);
            helper.setText(html, true);
            mailSender.send(message);
            log.info("Sent email to {} — subject: {}", toEmail, subject);
        } catch (MessagingException | java.io.UnsupportedEncodingException e) {
            log.warn("Email send failed for {} — subject: {} — {}", toEmail, subject, e.getMessage());
        } catch (Exception e) {
            // SMTP / network errors. Don't fail the calling endpoint.
            log.warn("Email transport error for {} — {}", toEmail, e.getMessage());
        }
    }

    /** Basic HTML-attribute / body escape. We construct the URLs and
     *  copy ourselves, so this is a defence-in-depth measure rather
     *  than the primary safeguard. */
    private static String safe(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
