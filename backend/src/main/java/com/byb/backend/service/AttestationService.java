package com.byb.backend.service;

import com.lowagie.text.Chunk;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Draws an attestation de participation: LeanConsulting's own design, made
 * in Canva, with the learner's name, the course and the period written in.
 *
 * {@code attestation/background.pdf} is that Canva PDF with exactly two
 * things taken out — the sample name and the sentence holding
 * "[Nom de la formation]" and "[Période]" — and nothing else touched: the
 * logo, background, titles, signature and stamp are LeanConsulting's file.
 * Canva sets each text in its own block of the page's form, the name in
 * its script font and the sentence in Droid Serif italic, which nothing
 * else uses, so those two blocks were dropped and the rest kept byte for
 * byte. A new design needs the same done again.
 *
 * The name was set in Anastasia Script, which is licensed for personal use
 * only; it is written here in Pinyon Script (SIL Open Font Licence), chosen
 * by eye as the closest free match. The sentence keeps the original's
 * Droid Serif (Apache licence). A name written in Arabic, which neither
 * draws, is set right to left in Amiri (SIL OFL). Licences are beside the
 * fonts.
 *
 * Positions, sizes and colours are the Canva file's, converted from its
 * form space to page points.
 */
@Service
public class AttestationService {

    private static final float CENTER_X = 421.1f;
    private static final float NAME_BASELINE = 290.5f, NAME_SIZE = 55.9f, NAME_MAX_WIDTH = 600f;
    private static final float ARABIC_NAME_SIZE = 40f;
    private static final float LINE1_BASELINE = 241.7f, LEADING = 22.5f, TEXT_SIZE = 13.28f, TEXT_WIDTH = 500f;
    private static final Color NAME_COLOR = new Color(121, 33, 47), TEXT_COLOR = new Color(73, 73, 77);

    private static final DateTimeFormatter FRENCH_MONTH_YEAR = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.FRENCH);

    private final Map<String, byte[]> resources = new ConcurrentHashMap<>();

    /**
     * The attestation, as a one-page PDF.
     *
     * @param learnerName as on the learner's profile
     * @param courseTitle the course's title
     * @param from        the group's first session
     * @param to          the group's last session
     */
    public byte[] render(String learnerName, String courseTitle, LocalDate from, LocalDate to) {
        try {
            PdfReader reader = new PdfReader(resource("attestation/background.pdf"));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            PdfStamper stamper = new PdfStamper(reader, out);
            PdfContentByte cb = stamper.getOverContent(1);

            String name = learnerName == null || learnerName.isBlank() ? "" : learnerName.trim();
            if (isArabic(name)) writeArabicName(cb, name);
            else writeName(cb, name);
            writeSentence(cb, courseTitle == null ? "" : courseTitle.trim(), period(from, to));

            stamper.close();
            reader.close();
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("Could not draw the attestation: " + e.getMessage(), e);
        }
    }

    /** A filename a learner can recognise: "Attestation - Python pour débutants.pdf", made safe. */
    public String filenameFor(String courseTitle) {
        String plain = Normalizer.normalize(courseTitle == null ? "" : courseTitle, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replaceAll("[^A-Za-z0-9 ._-]", "")
                .trim();
        if (plain.length() > 60) plain = plain.substring(0, 60).trim();
        return "Attestation - " + (plain.isEmpty() ? "Treyo" : plain) + ".pdf";
    }

    /**
     * "du 3 novembre 2026 au 28 novembre 2026", with "1er" for the first of
     * a month as French writes it; "le 3 novembre 2026" for a single day.
     */
    static String period(LocalDate from, LocalDate to) {
        if (from == null && to == null) return "";
        if (from == null) from = to;
        if (to == null || to.isBefore(from)) to = from;
        if (from.equals(to)) return "le " + frenchDate(from);
        return "du " + frenchDate(from) + " au " + frenchDate(to);
    }

    static String frenchDate(LocalDate d) {
        String day = d.getDayOfMonth() == 1 ? "1er" : String.valueOf(d.getDayOfMonth());
        return day + " " + FRENCH_MONTH_YEAR.format(d);
    }

    // ── drawing ─────────────────────────────────────────────────────────

    private void writeName(PdfContentByte cb, String name) throws IOException {
        BaseFont script = font("attestation/fonts/PinyonScript-Regular.ttf");
        float size = NAME_SIZE;
        float width = script.getWidthPoint(name, size);
        if (width > NAME_MAX_WIDTH) size = size * NAME_MAX_WIDTH / width;
        cb.beginText();
        cb.setFontAndSize(script, size);
        cb.setColorFill(NAME_COLOR);
        cb.showTextAligned(Element.ALIGN_CENTER, name, CENTER_X, NAME_BASELINE, 0);
        cb.endText();
    }

    /** Right to left and shaped, which showTextAligned does not do; ColumnText does. */
    private void writeArabicName(PdfContentByte cb, String name) throws Exception {
        BaseFont amiri = font("attestation/fonts/Amiri-Regular.ttf");
        float size = ARABIC_NAME_SIZE;
        float width = amiri.getWidthPoint(name, size);
        if (width > NAME_MAX_WIDTH) size = size * NAME_MAX_WIDTH / width;
        ColumnText ct = new ColumnText(cb);
        ct.setRunDirection(PdfWriter.RUN_DIRECTION_RTL);
        ct.setArabicOptions(ColumnText.AR_COMPOSEDTASHKEEL);
        ct.setSimpleColumn(new Phrase(name, new Font(amiri, size, Font.NORMAL, NAME_COLOR)),
                CENTER_X - NAME_MAX_WIDTH / 2, NAME_BASELINE - size,
                CENTER_X + NAME_MAX_WIDTH / 2, NAME_BASELINE + size * 1.2f,
                size * 1.2f, Element.ALIGN_CENTER);
        ct.go();
    }

    /**
     * Centred, wrapping as the Canva text box did; "Treyo" in bold italic as
     * in the original. Three lines fit above the signature; a title too long
     * for them makes the text smaller rather than losing its end.
     */
    private void writeSentence(PdfContentByte cb, String course, String period) throws Exception {
        BaseFont italic = font("attestation/fonts/DroidSerif-Italic.ttf");
        BaseFont boldItalic = font("attestation/fonts/DroidSerif-BoldItalic.ttf");
        for (float size : new float[]{TEXT_SIZE, 12f, 11f, 10f, 9f}) {
            float leading = LEADING * size / TEXT_SIZE;
            Phrase p = sentence(course, period, new Font(italic, size, Font.NORMAL, TEXT_COLOR),
                    new Font(boldItalic, size, Font.NORMAL, TEXT_COLOR));
            ColumnText trial = column(cb, p, leading);
            boolean fits = !ColumnText.hasMoreText(trial.go(true));
            if (fits || size == 9f) {
                column(cb, sentence(course, period, new Font(italic, size, Font.NORMAL, TEXT_COLOR),
                        new Font(boldItalic, size, Font.NORMAL, TEXT_COLOR)), leading).go();
                return;
            }
        }
    }

    private static Phrase sentence(String course, String period, Font italic, Font boldItalic) {
        Phrase p = new Phrase();
        p.add(new Chunk("Pour sa participation à la formation " + course + " sur la plateforme ", italic));
        p.add(new Chunk("Treyo", boldItalic));
        String end = period.isEmpty() ? "."
                : (period.startsWith("le ") ? ", " : ", durant la période ") + period + ".";
        p.add(new Chunk(end, italic));
        return p;
    }

    private static ColumnText column(PdfContentByte cb, Phrase p, float leading) {
        ColumnText ct = new ColumnText(cb);
        ct.setSimpleColumn(p, CENTER_X - TEXT_WIDTH / 2, LINE1_BASELINE - 2 * LEADING - 6,
                CENTER_X + TEXT_WIDTH / 2, LINE1_BASELINE + leading, leading, Element.ALIGN_CENTER);
        return ct;
    }

    // ── resources ───────────────────────────────────────────────────────

    private BaseFont font(String path) throws IOException {
        return BaseFont.createFont(path.substring(path.lastIndexOf('/') + 1), BaseFont.IDENTITY_H,
                BaseFont.EMBEDDED, false, resource(path), null);
    }

    private byte[] resource(String path) {
        return resources.computeIfAbsent(path, p -> {
            try (InputStream in = new ClassPathResource(p).getInputStream()) {
                return in.readAllBytes();
            } catch (IOException e) {
                throw new IllegalStateException("Missing attestation resource " + p, e);
            }
        });
    }

    private static boolean isArabic(String s) {
        for (int i = 0; i < s.length(); i++) {
            Character.UnicodeBlock b = Character.UnicodeBlock.of(s.charAt(i));
            if (b == Character.UnicodeBlock.ARABIC || b == Character.UnicodeBlock.ARABIC_PRESENTATION_FORMS_A
                    || b == Character.UnicodeBlock.ARABIC_PRESENTATION_FORMS_B) return true;
        }
        return false;
    }
}
