package com.byb.backend.service;

import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * The PDF a learner gets after paying.
 *
 * ── Receipt, not facture ────────────────────────────────────────────
 * LeanConsulting's invoice template is a payment *demand*: it addresses
 * a company, carries an RNE, lists bank details to transfer to, and says
 * in its footer "la possession de la facture ne signifie nullement le
 * paiement". This document is the opposite — the money has already
 * arrived by card, from an individual, through ClicToPay.
 *
 * So it is a reçu de paiement. That choice avoids inventing a
 * gap-free invoice sequence, which is a legal obligation that cannot be
 * retrofitted once numbers have been issued with holes in them, and
 * which nobody should design without an accountant. The payment
 * reference already identifies this document uniquely.
 *
 * ── On VAT ──────────────────────────────────────────────────────────
 * The learner was charged exactly the listed course price, so that
 * figure is the TTC total and the breakdown is derived from it rather
 * than added to it. The rate is configurable and the whole block can be
 * switched off, because whether these sales carry VAT at all is a
 * question for LeanConsulting's accountant, not for this file.
 *
 * The template's timbre fiscal is deliberately absent: it was never
 * charged, and putting a line on a receipt that was not taken would
 * make the total disagree with the card statement.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ReceiptService {

    @Value("${receipt.company.name:LeanConsulting}")
    private String companyName;

    @Value("${receipt.company.address:}")
    private String companyAddress;

    @Value("${receipt.company.email:}")
    private String companyEmail;

    @Value("${receipt.company.phone:}")
    private String companyPhone;

    /** Registre National des Entreprises, printed when configured. */
    @Value("${receipt.company.rne:}")
    private String companyRne;

    /** False where these sales carry no VAT; the block is then omitted. */
    @Value("${receipt.vat.enabled:true}")
    private boolean vatEnabled;

    /** Percent. 19 is the standard Tunisian rate on the template. */
    @Value("${receipt.vat.rate:19}")
    private BigDecimal vatRate;

    private static final Color INK = new Color(0x1a, 0x1a, 0x2e);
    private static final Color MUTED = new Color(0x70, 0x70, 0x80);
    private static final Color ACCENT = new Color(0x25, 0x0e, 0xa9);
    private static final Color RULE = new Color(0xdd, 0xdd, 0xe3);

    private static final DateTimeFormatter DATE =
            DateTimeFormatter.ofPattern("dd/MM/yyyy");

    /** Everything the document needs, so the PDF code holds no lookups. */
    public record ReceiptData(
            String learnerName,
            String learnerEmail,
            String courseTitle,
            String trainerName,
            BigDecimal amountPaid,
            String currency,
            LocalDateTime paidAt,
            String paymentRef,
            String cardBrand,
            String cardLast4
    ) {}

    /**
     * Render the receipt. Returns the bytes rather than writing a file:
     * it is emailed as an attachment and re-rendered on demand for a
     * download, so there is nothing worth keeping on disk — the data it
     * is built from is already in the database.
     */
    public byte[] render(ReceiptData d) {
        Document doc = new Document(PageSize.A4, 48, 48, 48, 56);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            PdfWriter.getInstance(doc, out);
            doc.open();

            header(doc);
            title(doc, d);
            parties(doc, d);
            lineItems(doc, d);
            totals(doc, d);
            paymentDetails(doc, d);
            footer(doc);

            doc.close();
            return out.toByteArray();
        } catch (DocumentException e) {
            // Never fatal to the caller: a missing receipt must not undo
            // an enrolment that has already been paid for.
            log.error("Could not render receipt for {}: {}", d.paymentRef(), e.getMessage());
            throw new IllegalStateException("Receipt could not be generated", e);
        }
    }

    // ── sections ────────────────────────────────────────────────────

    private void header(Document doc) throws DocumentException {
        Paragraph name = new Paragraph(companyName, bold(18, ACCENT));
        name.setSpacingAfter(2f);
        doc.add(name);

        StringBuilder sb = new StringBuilder();
        appendIf(sb, companyAddress);
        appendIf(sb, companyPhone);
        appendIf(sb, companyEmail);
        if (notBlank(companyRne)) appendIf(sb, "RNE : " + companyRne);
        if (sb.length() > 0) {
            Paragraph meta = new Paragraph(sb.toString(), regular(8.5f, MUTED));
            meta.setSpacingAfter(18f);
            doc.add(meta);
        }
        doc.add(rule());
    }

    private void title(Document doc, ReceiptData d) throws DocumentException {
        Paragraph t = new Paragraph("REÇU DE PAIEMENT  /  PAYMENT RECEIPT", bold(13, INK));
        t.setSpacingBefore(14f);
        t.setSpacingAfter(2f);
        doc.add(t);

        String when = d.paidAt() == null ? "" : d.paidAt().format(DATE);
        Paragraph sub = new Paragraph("Date : " + when, regular(9, MUTED));
        sub.setSpacingAfter(16f);
        doc.add(sub);
    }

    private void parties(Document doc, ReceiptData d) throws DocumentException {
        PdfPTable t = new PdfPTable(1);
        t.setWidthPercentage(100);
        t.addCell(plain("À l'attention de / Billed to", regular(8, MUTED)));
        t.addCell(plain(nullSafe(d.learnerName()), bold(10.5f, INK)));
        if (notBlank(d.learnerEmail())) {
            t.addCell(plain(d.learnerEmail(), regular(9, MUTED)));
        }
        t.setSpacingAfter(18f);
        doc.add(t);
    }

    private void lineItems(Document doc, ReceiptData d) throws DocumentException {
        PdfPTable t = new PdfPTable(new float[]{68, 32});
        t.setWidthPercentage(100);

        t.addCell(headCell("Désignation / Description"));
        t.addCell(headCellRight("Montant / Amount"));

        String designation = nullSafe(d.courseTitle());
        if (notBlank(d.trainerName())) {
            designation += "\nFormateur / Trainer : " + d.trainerName();
        }
        t.addCell(bodyCell(designation));
        t.addCell(bodyCellRight(money(d.amountPaid(), d.currency())));

        t.setSpacingAfter(4f);
        doc.add(t);
    }

    private void totals(Document doc, ReceiptData d) throws DocumentException {
        BigDecimal ttc = d.amountPaid() == null ? BigDecimal.ZERO : d.amountPaid();

        PdfPTable t = new PdfPTable(new float[]{68, 32});
        t.setWidthPercentage(100);

        if (vatEnabled && vatRate != null && vatRate.signum() > 0) {
            // Derived from the charged amount, never added to it: the
            // card was debited the listed price, and a receipt whose
            // total disagrees with the bank statement is worse than no
            // receipt.
            BigDecimal divisor = BigDecimal.ONE.add(
                    vatRate.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
            BigDecimal ht = ttc.divide(divisor, 3, RoundingMode.HALF_UP);
            BigDecimal vat = ttc.subtract(ht);

            t.addCell(totalLabel("Total H.TVA"));
            t.addCell(totalValue(money(ht, d.currency())));
            t.addCell(totalLabel("TVA " + vatRate.stripTrailingZeros().toPlainString() + "%"));
            t.addCell(totalValue(money(vat, d.currency())));
        }

        t.addCell(grandLabel("Montant payé / Total paid"));
        t.addCell(grandValue(money(ttc, d.currency())));
        t.setSpacingAfter(18f);
        doc.add(t);
    }

    private void paymentDetails(Document doc, ReceiptData d) throws DocumentException {
        PdfPTable t = new PdfPTable(new float[]{30, 70});
        t.setWidthPercentage(100);

        t.addCell(plain("Référence", regular(8.5f, MUTED)));
        t.addCell(plain(nullSafe(d.paymentRef()), regular(8.5f, INK)));

        t.addCell(plain("Mode de paiement", regular(8.5f, MUTED)));
        t.addCell(plain(method(d), regular(8.5f, INK)));

        t.setSpacingAfter(20f);
        doc.add(t);
    }

    private void footer(Document doc) throws DocumentException {
        doc.add(rule());
        Paragraph p = new Paragraph(
                "Paiement reçu — ce reçu vaut justificatif. / Payment received — this receipt serves as proof.\n"
                        + "Le client déclare avoir reçu le service, conforme à sa demande.",
                regular(8, MUTED));
        p.setSpacingBefore(10f);
        doc.add(p);
    }

    // ── small helpers ───────────────────────────────────────────────

    /**
     * Brand and last four, or a plain "carte bancaire" when the gateway
     * returned neither. Never more than that: ClicToPay's terms forbid
     * keeping the number, the CVV and the expiry, so there is nothing
     * else to print.
     */
    private String method(ReceiptData d) {
        String brand = nullSafe(d.cardBrand());
        String last4 = nullSafe(d.cardLast4());
        if (brand.isEmpty() && last4.isEmpty()) return "Carte bancaire / Card";
        return (brand + (last4.isEmpty() ? "" : " ••••" + last4)).trim();
    }

    private String money(BigDecimal amount, String currency) {
        BigDecimal v = amount == null ? BigDecimal.ZERO : amount.setScale(3, RoundingMode.HALF_UP);
        return v.toPlainString() + " " + (notBlank(currency) ? currency : "TND");
    }

    private Font bold(float size, Color color) {
        return FontFactory.getFont(FontFactory.HELVETICA_BOLD, size, color);
    }

    private Font regular(float size, Color color) {
        return FontFactory.getFont(FontFactory.HELVETICA, size, color);
    }

    private PdfPCell plain(String text, Font font) {
        PdfPCell c = new PdfPCell(new Phrase(text, font));
        c.setBorder(Rectangle.NO_BORDER);
        c.setPaddingBottom(3f);
        return c;
    }

    private PdfPCell headCell(String text) {
        PdfPCell c = new PdfPCell(new Phrase(text, bold(8.5f, MUTED)));
        c.setBorder(Rectangle.BOTTOM);
        c.setBorderColor(RULE);
        c.setPaddingBottom(6f);
        return c;
    }

    private PdfPCell headCellRight(String text) {
        PdfPCell c = headCell(text);
        c.setHorizontalAlignment(Element.ALIGN_RIGHT);
        return c;
    }

    private PdfPCell bodyCell(String text) {
        PdfPCell c = new PdfPCell(new Phrase(text, regular(10, INK)));
        c.setBorder(Rectangle.BOTTOM);
        c.setBorderColor(RULE);
        c.setPaddingTop(8f);
        c.setPaddingBottom(8f);
        return c;
    }

    private PdfPCell bodyCellRight(String text) {
        PdfPCell c = bodyCell(text);
        c.setHorizontalAlignment(Element.ALIGN_RIGHT);
        return c;
    }

    private PdfPCell totalLabel(String text) {
        PdfPCell c = plain(text, regular(9, MUTED));
        c.setHorizontalAlignment(Element.ALIGN_RIGHT);
        c.setPaddingTop(5f);
        return c;
    }

    private PdfPCell totalValue(String text) {
        PdfPCell c = plain(text, regular(9, INK));
        c.setHorizontalAlignment(Element.ALIGN_RIGHT);
        c.setPaddingTop(5f);
        return c;
    }

    private PdfPCell grandLabel(String text) {
        PdfPCell c = plain(text, bold(11, INK));
        c.setHorizontalAlignment(Element.ALIGN_RIGHT);
        c.setPaddingTop(9f);
        return c;
    }

    private PdfPCell grandValue(String text) {
        PdfPCell c = plain(text, bold(11, ACCENT));
        c.setHorizontalAlignment(Element.ALIGN_RIGHT);
        c.setPaddingTop(9f);
        return c;
    }

    private Paragraph rule() {
        Paragraph p = new Paragraph(new Chunk(new com.lowagie.text.pdf.draw.LineSeparator(
                0.6f, 100, RULE, Element.ALIGN_CENTER, 0)));
        return p;
    }

    private void appendIf(StringBuilder sb, String value) {
        if (!notBlank(value)) return;
        if (sb.length() > 0) sb.append("   ·   ");
        sb.append(value);
    }

    private boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private String nullSafe(String s) {
        return s == null ? "" : s;
    }
}
