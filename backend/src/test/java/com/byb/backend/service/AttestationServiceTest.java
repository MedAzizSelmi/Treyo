package com.byb.backend.service;

import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The attestation carries the learner's name, the course and the period
 * in French, on LeanConsulting's own page. Writes the PDFs it makes to
 * target/attestations so they can be looked at.
 */
class AttestationServiceTest {

    private final AttestationService service = new AttestationService();

    private static String text(byte[] pdf) throws Exception {
        PdfReader r = new PdfReader(pdf);
        try {
            return new PdfTextExtractor(r).getTextFromPage(1).replaceAll("\\s+", " ");
        } finally {
            r.close();
        }
    }

    private static void keep(String name, byte[] pdf) throws Exception {
        Path dir = Path.of("target", "attestations");
        Files.createDirectories(dir);
        Files.write(dir.resolve(name), pdf);
    }

    @Test
    void itNamesTheLearnerTheCourseAndThePeriod() throws Exception {
        byte[] pdf = service.render("Mohamed Aziz Selmi", "Python pour l'analyse de données",
                LocalDate.of(2026, 11, 3), LocalDate.of(2026, 11, 28));
        keep("latin.pdf", pdf);
        String text = text(pdf);
        assertTrue(text.contains("Mohamed Aziz Selmi"), text);
        assertTrue(text.contains("Pour sa participation à la formation Python pour l'analyse de données sur la"), text);
        assertTrue(text.contains("durant la période du 3 novembre 2026 au 28 novembre 2026."), text);
        // The template's own text is still in its form, and its placeholders are not.
        String form = templateForm(pdf);
        assertTrue(form.contains("/F13 "), "the titles, set in Droid Serif");
        assertTrue(form.contains("/F14 "), "the director's name, in Droid Serif bold");
        assertFalse(form.contains("/F15 "), "the sample name, in the script font, is gone");
        assertFalse(form.contains("/F16 ") || form.contains("/F17 "), "the placeholder sentence is gone");
    }

    /** The Canva page's content: one form XObject that holds all of it. */
    private static String templateForm(byte[] pdf) throws Exception {
        PdfReader r = new PdfReader(pdf);
        try {
            var res = r.getPageN(1).getAsDict(com.lowagie.text.pdf.PdfName.RESOURCES);
            var xo = res.getAsDict(com.lowagie.text.pdf.PdfName.XOBJECT);
            var form = (com.lowagie.text.pdf.PRStream) PdfReader.getPdfObject(xo.get(new com.lowagie.text.pdf.PdfName("X18")));
            return new String(PdfReader.getStreamBytes(form), java.nio.charset.StandardCharsets.ISO_8859_1);
        } finally {
            r.close();
        }
    }

    @Test
    void theFirstOfTheMonthIsWrittenAsFrenchWritesIt() {
        assertEquals("du 1er décembre 2026 au 15 décembre 2026",
                AttestationService.period(LocalDate.of(2026, 12, 1), LocalDate.of(2026, 12, 15)));
        assertEquals("le 1er décembre 2026",
                AttestationService.period(LocalDate.of(2026, 12, 1), LocalDate.of(2026, 12, 1)));
    }

    @Test
    void aLongTitleIsNotCutShort() throws Exception {
        String title = "Gestion de projet agile avec Scrum et Kanban : de la planification au pilotage "
                + "des équipes distribuées et à la livraison continue";
        byte[] pdf = service.render("Foulen Ben Foulen", title, LocalDate.of(2026, 11, 3), LocalDate.of(2026, 12, 1));
        keep("long-title.pdf", pdf);
        assertTrue(text(pdf).contains("au 1er décembre 2026."), "the end of the sentence is drawn");
    }

    @Test
    void anArabicNameIsDrawn() throws Exception {
        byte[] pdf = service.render("محمد عزيز السالمي", "Excel avancé", LocalDate.of(2026, 11, 3), LocalDate.of(2026, 11, 28));
        keep("arabic.pdf", pdf);
        assertTrue(pdf.length > 1000);
    }

    @Test
    void theFilenameIsSafe() {
        assertEquals("Attestation - Python pour lanalyse de donnees.pdf",
                service.filenameFor("Python pour l'analyse de données"));
    }
}
