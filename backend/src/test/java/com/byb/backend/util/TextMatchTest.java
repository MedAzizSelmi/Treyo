package com.byb.backend.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** What learners type matches however they type it — and only then. */
class TextMatchTest {

    @Test
    void caseAccentsSpacingAndPunctuationDoNotMatter() {
        assertEquals("excel avance", TextMatch.normalize("  Excél — AVANCÉ!! "));
        assertEquals(TextMatch.key("Power BI"), TextMatch.key("power-bi"));
        assertEquals(TextMatch.key("Power BI"), TextMatch.key("powerbi"));
    }

    @Test
    void aQueryFindsTextByWordsInAnyOrderAndAllowsTypos() {
        assertTrue(TextMatch.matches("powerbi", "Power BI for analysts"));
        assertTrue(TextMatch.matches("bi power", "Power BI for analysts"));
        assertTrue(TextMatch.matches("pyhton", "Python for finance"));
        assertTrue(TextMatch.matches("excél", "Excel"));
        assertTrue(TextMatch.matches("mark", "Digital marketing"), "a word being typed matches its start");
        assertFalse(TextMatch.matches("java spring", "JavaScript basics and Python"), "every word must be found");
        assertFalse(TextMatch.matches("python django", "Python for finance"));
        assertFalse(TextMatch.matches("sql", "SAP"), "no typo allowed on very short words");
    }

    @Test
    void sameKeyGroupsSpellingsButNotDifferentThings() {
        assertTrue(TextMatch.sameKey(TextMatch.key("power bi"), TextMatch.key("pwer bi")));
        assertTrue(TextMatch.sameKey(TextMatch.key("photoshop"), TextMatch.key("fotoshop")));
        assertFalse(TextMatch.sameKey(TextMatch.key("java"), TextMatch.key("javascript")));
        assertFalse(TextMatch.sameKey(TextMatch.key("sap"), TextMatch.key("sql")));
    }
}
