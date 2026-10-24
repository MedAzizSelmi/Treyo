package com.byb.backend.util;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Forgiving text matching for what learners type: case, accents, spacing,
 * punctuation and small typos do not matter.
 *
 * "Power BI", "powerbi", "power-bi" and "Pwer BI" are one search;
 * "excél" finds "Excel". Used to group course suggestions for "me too" and
 * the searches that found nothing on the dashboard. The app's course search
 * (treyo-mobile/utils/textMatch.ts) follows the same rules, so what a
 * learner fails to find there is grouped here the way they would expect.
 */
public final class TextMatch {

    private TextMatch() {}

    /** Lower case, no accents, letters and digits only, single spaces. */
    public static String normalize(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{L}\\p{N}]+", " ")
                .trim();
        return n.replaceAll("\\s+", " ");
    }

    /** The normalised text without spaces: "power bi" and "powerbi" share it. */
    public static String key(String s) {
        return normalize(s).replace(" ", "");
    }

    public static List<String> words(String s) {
        String n = normalize(s);
        return n.isEmpty() ? List.of() : Arrays.asList(n.split(" "));
    }

    /** Typos allowed for a word of this length: none up to 3, one up to 6, then two. */
    public static int tolerance(int length) {
        return length <= 3 ? 0 : length <= 6 ? 1 : 2;
    }

    /** Whether two keys are the same search, allowing for a typo or two. */
    public static boolean sameKey(String a, String b) {
        if (a.equals(b)) return true;
        return distance(a, b, tolerance(Math.min(a.length(), b.length()))) <= tolerance(Math.min(a.length(), b.length()));
    }

    /**
     * Whether the query finds the text: the text contains it once spaces
     * are ignored, or every word of the query starts, or nearly matches, a
     * word of the text.
     */
    public static boolean matches(String query, String text) {
        String qKey = key(query);
        if (qKey.isEmpty()) return false;
        if (key(text).contains(qKey)) return true;
        List<String> textWords = words(text);
        for (String q : words(query)) {
            boolean found = false;
            for (String w : textWords) {
                if (w.startsWith(q) || distance(q, w, tolerance(q.length())) <= tolerance(q.length())) {
                    found = true;
                    break;
                }
            }
            if (!found) return false;
        }
        return true;
    }

    /**
     * Edit distance where swapping two neighbouring letters is one typo, not
     * two ("pyhton"), giving up (returning max + 1) once it exceeds max.
     */
    public static int distance(String a, String b, int max) {
        if (Math.abs(a.length() - b.length()) > max) return max + 1;
        int[] before = new int[b.length() + 1];
        int[] prev = new int[b.length() + 1];
        int[] cur = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) prev[j] = j;
        for (int i = 1; i <= a.length(); i++) {
            cur[0] = i;
            int rowMin = cur[0];
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                int d = Math.min(Math.min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
                if (i > 1 && j > 1 && a.charAt(i - 1) == b.charAt(j - 2) && a.charAt(i - 2) == b.charAt(j - 1)) {
                    d = Math.min(d, before[j - 2] + 1);
                }
                cur[j] = d;
                rowMin = Math.min(rowMin, d);
            }
            if (rowMin > max) return max + 1;
            int[] t = before; before = prev; prev = cur; cur = t;
        }
        return prev[b.length()];
    }
}
