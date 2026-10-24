package com.byb.backend.util;

import com.byb.backend.util.ExperienceEntries.Entry;
import org.junit.jupiter.api.Test;

import java.time.YearMonth;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Experience entries: checked, ordered, and turned into the text older screens show. */
class ExperienceEntriesTest {

    private static final YearMonth NOW = YearMonth.of(2026, 10);

    @Test
    void entriesAreTrimmedAndTheCurrentOneComesFirst() {
        List<Entry> out = ExperienceEntries.clean(List.of(
                new Entry(" Vermeg ", "Intern", "2022-02", "2022-07"),
                new Entry("BYB", "  Full-stack   developer ", "2024-09", null)), NOW);
        assertEquals("BYB", out.get(0).organization());
        assertEquals("Full-stack developer", out.get(0).position());
        assertNull(out.get(0).to(), "current");
        assertEquals("Full-stack developer — BYB (09/2024 – present)\nIntern — Vermeg (02/2022 – 07/2022)",
                ExperienceEntries.toText(out));
    }

    @Test
    void anEntryNeedsAnOrganisationAPositionAndSensibleDates() {
        assertThrows(IllegalArgumentException.class,
                () -> ExperienceEntries.clean(List.of(new Entry("", "Intern", "2022-02", null)), NOW));
        assertThrows(IllegalArgumentException.class,
                () -> ExperienceEntries.clean(List.of(new Entry("Vermeg", " ", "2022-02", null)), NOW));
        assertThrows(IllegalArgumentException.class,
                () -> ExperienceEntries.clean(List.of(new Entry("Vermeg", "Intern", "2022-13", null)), NOW));
        assertThrows(IllegalArgumentException.class,
                () -> ExperienceEntries.clean(List.of(new Entry("Vermeg", "Intern", "2023-05", "2022-01")), NOW),
                "ends before it starts");
        assertThrows(IllegalArgumentException.class,
                () -> ExperienceEntries.clean(List.of(new Entry("Vermeg", "Intern", "2027-01", null)), NOW),
                "starts in the future");
    }

    @Test
    void yearsCountOverlappingPositionsOnce() {
        List<Entry> e = ExperienceEntries.clean(List.of(
                new Entry("A", "Dev", "2018-01", "2020-12"),   // 3 years
                new Entry("B", "Teacher", "2020-01", "2021-12"), // overlaps a year, adds one
                new Entry("C", "Lead", "2024-10", null)), NOW);  // 2 years to now
        assertEquals(6, ExperienceEntries.years(e, NOW));
    }

    @Test
    void storedJsonReadsBackAndBadJsonReadsAsNothing() {
        List<Entry> e = ExperienceEntries.clean(List.of(new Entry("Vermeg", "Intern", "2022-02", "2022-07")), NOW);
        assertEquals(e, ExperienceEntries.fromJson(ExperienceEntries.toJson(e)));
        assertTrue(ExperienceEntries.fromJson("not json").isEmpty());
        assertTrue(ExperienceEntries.fromJson(null).isEmpty());
    }
}
