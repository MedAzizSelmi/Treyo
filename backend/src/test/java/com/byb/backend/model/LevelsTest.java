package com.byb.backend.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Levels are compared word for word by search and by the recommendation
 * engine, so every write is reduced to beginner / intermediate / expert.
 */
class LevelsTest {

    @Test
    void lowerCasesTheKnownWords() {
        assertEquals("beginner", Levels.normalize("Beginner"));
        assertEquals("intermediate", Levels.normalize(" INTERMEDIATE "));
        assertEquals("expert", Levels.normalize("expert"));
    }

    @Test
    void readsAdvancedAsExpert() {
        // What the app's search filter used to send, and some imports hold.
        assertEquals("expert", Levels.normalize("ADVANCED"));
        assertEquals("expert", Levels.normalize("advanced"));
    }

    @Test
    void leavesMissingAndUnknownValuesAlone() {
        assertNull(Levels.normalize(null));
        assertNull(Levels.normalize("  "));
        assertEquals("all levels", Levels.normalize("All levels"));
    }
}
