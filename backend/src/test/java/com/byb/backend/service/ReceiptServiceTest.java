package com.byb.backend.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Layout code fails at render time, not compile time — a bad column
 * count or a null in the wrong place throws only when the document is
 * built. These render a real PDF so that happens here rather than on
 * the first payment of the day.
 */
class ReceiptServiceTest {

    private ReceiptService service(boolean vatEnabled, String rate) {
        ReceiptService s = new ReceiptService();
        ReflectionTestUtils.setField(s, "companyName", "LeanConsulting");
        ReflectionTestUtils.setField(s, "companyAddress", "Soukra, Tunis");
        ReflectionTestUtils.setField(s, "companyEmail", "direction@leanconsulting.com.tn");
        ReflectionTestUtils.setField(s, "companyPhone", "+216 20 348 898");
        ReflectionTestUtils.setField(s, "companyRne", "1234567A");
        ReflectionTestUtils.setField(s, "vatEnabled", vatEnabled);
        ReflectionTestUtils.setField(s, "vatRate", new BigDecimal(rate));
        return s;
    }

    private ReceiptService.ReceiptData full() {
        return new ReceiptService.ReceiptData(
                "Salma Ben Ali", "salma@example.com",
                "Développement Web Full-Stack", "Med Aziz Selmi",
                new BigDecimal("119.000"), "TND",
                LocalDateTime.of(2026, 10, 8, 14, 30),
                "TREYO-STU123-CRS456-AB12",
                "VISA", "4242");
    }

    /** A PDF starts with %PDF- and ends with the EOF marker. */
    private void assertLooksLikePdf(byte[] pdf) {
        assertNotNull(pdf);
        assertTrue(pdf.length > 800, "suspiciously small: " + pdf.length + " bytes");
        assertEquals("%PDF-", new String(pdf, 0, 5));
        String tail = new String(pdf, Math.max(0, pdf.length - 1024), Math.min(1024, pdf.length));
        assertTrue(tail.contains("%%EOF"), "no EOF marker — document was not closed");
    }

    @Test
    @DisplayName("renders a complete receipt")
    void rendersComplete() {
        assertLooksLikePdf(service(true, "19").render(full()));
    }

    @Test
    @DisplayName("renders with VAT switched off")
    void rendersWithoutVat() {
        assertLooksLikePdf(service(false, "19").render(full()));
    }

    @Test
    @DisplayName("renders when the gateway returned no card details")
    void rendersWithoutCard() {
        ReceiptService.ReceiptData d = new ReceiptService.ReceiptData(
                "Salma Ben Ali", "salma@example.com",
                "Développement Web", "Med Aziz Selmi",
                new BigDecimal("50.000"), "TND",
                LocalDateTime.now(), "TREYO-X-Y-Z", null, null);
        assertLooksLikePdf(service(true, "19").render(d));
    }

    @Test
    @DisplayName("survives nulls in every optional field")
    void survivesNulls() {
        // Old enrolments predate the card columns, and a trainer or
        // course can be missing a name. None of that should stop a
        // learner getting proof they paid.
        ReceiptService.ReceiptData d = new ReceiptService.ReceiptData(
                null, null, null, null,
                null, null, null, null, null, null);
        assertLooksLikePdf(service(true, "19").render(d));
    }

    @Test
    @DisplayName("company details are optional")
    void rendersWithoutCompanyDetails() {
        ReceiptService s = new ReceiptService();
        ReflectionTestUtils.setField(s, "companyName", "LeanConsulting");
        ReflectionTestUtils.setField(s, "companyAddress", "");
        ReflectionTestUtils.setField(s, "companyEmail", "");
        ReflectionTestUtils.setField(s, "companyPhone", "");
        ReflectionTestUtils.setField(s, "companyRne", "");
        ReflectionTestUtils.setField(s, "vatEnabled", true);
        ReflectionTestUtils.setField(s, "vatRate", new BigDecimal("19"));
        assertLooksLikePdf(s.render(full()));
    }
}
