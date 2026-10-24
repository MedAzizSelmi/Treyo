package com.byb.backend.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Professional experience as entries — organisation, position, from, to —
 * rather than a paragraph to write.
 *
 * Since October 2026 the onboarding CV screens build experience one entry at
 * a time (or from Affinda's work history), so learners without a CV write
 * almost nothing. The entries are stored as JSON
 * ({@code experience_entries}); {@code professional_experience} keeps a
 * readable text made from them, so everything that already shows that text
 * — the dashboard, older app screens — keeps working.
 */
public final class ExperienceEntries {

    private ExperienceEntries() {}

    /** One position held. {@code to} is null while it is current. Months are "YYYY-MM". */
    public record Entry(String organization, String position, String from, String to) {}

    public static final int MAX_ENTRIES = 20;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter SHOWN = DateTimeFormatter.ofPattern("MM/yyyy");

    /**
     * Trimmed, checked and sorted most recent first. Throws
     * IllegalArgumentException (a 400) with a reason the app can show.
     */
    public static List<Entry> clean(List<Entry> entries, YearMonth now) {
        if (entries == null) return null;
        if (entries.size() > MAX_ENTRIES) throw new IllegalArgumentException("At most " + MAX_ENTRIES + " experiences.");
        List<Entry> out = new ArrayList<>();
        for (Entry e : entries) {
            if (e == null) continue;
            String org = text(e.organization());
            String pos = text(e.position());
            if (org == null) throw new IllegalArgumentException("Each experience needs an organisation.");
            if (pos == null) throw new IllegalArgumentException("Each experience needs a position.");
            YearMonth from = month(e.from(), "start");
            YearMonth to = e.to() == null || e.to().isBlank() ? null : month(e.to(), "end");
            if (from.isAfter(now)) throw new IllegalArgumentException("An experience cannot start in the future.");
            if (to != null && to.isBefore(from)) throw new IllegalArgumentException("An experience cannot end before it starts.");
            if (to != null && to.isAfter(now)) to = null;
            out.add(new Entry(org, pos, from.toString(), to == null ? null : to.toString()));
        }
        out.sort(Comparator.comparing((Entry e) -> e.to() == null ? "9999-99" : e.to()).reversed()
                .thenComparing(Entry::from, Comparator.reverseOrder()));
        return out;
    }

    public static String toJson(List<Entry> entries) {
        try {
            return JSON.writeValueAsString(entries);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** The stored JSON as entries; empty when there is none or it cannot be read. */
    public static List<Entry> fromJson(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return JSON.readValue(json, new TypeReference<List<Entry>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    /** "Developer — Vermeg (03/2021 – present)", one entry per line. */
    public static String toText(List<Entry> entries) {
        if (entries == null || entries.isEmpty()) return null;
        StringBuilder sb = new StringBuilder();
        for (Entry e : entries) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(e.position()).append(" — ").append(e.organization())
                    .append(" (").append(YearMonth.parse(e.from()).format(SHOWN)).append(" – ")
                    .append(e.to() == null ? "present" : YearMonth.parse(e.to()).format(SHOWN)).append(')');
        }
        return sb.toString();
    }

    /** Whole years worked, overlapping positions counted once. */
    public static int years(List<Entry> entries, YearMonth now) {
        if (entries == null || entries.isEmpty()) return 0;
        List<YearMonth[]> spans = new ArrayList<>();
        for (Entry e : entries) {
            spans.add(new YearMonth[]{YearMonth.parse(e.from()), e.to() == null ? now : YearMonth.parse(e.to())});
        }
        spans.sort(Comparator.comparing(s -> s[0]));
        long months = 0;
        YearMonth start = null, end = null;
        for (YearMonth[] s : spans) {
            if (end == null || s[0].isAfter(end)) {
                if (end != null) months += start.until(end, java.time.temporal.ChronoUnit.MONTHS) + 1;
                start = s[0];
                end = s[1];
            } else if (s[1].isAfter(end)) {
                end = s[1];
            }
        }
        months += start.until(end, java.time.temporal.ChronoUnit.MONTHS) + 1;
        return (int) (months / 12);
    }

    private static YearMonth month(String v, String which) {
        try {
            YearMonth m = YearMonth.parse(v == null ? "" : v.trim());
            if (m.getYear() < 1950) throw new IllegalArgumentException();
            return m;
        } catch (Exception e) {
            throw new IllegalArgumentException("Each experience needs a valid " + which + " month.");
        }
    }

    private static String text(String v) {
        if (v == null) return null;
        String t = v.trim().replaceAll("\\s+", " ");
        if (t.isEmpty()) return null;
        return t.length() > 100 ? t.substring(0, 100) : t;
    }
}
