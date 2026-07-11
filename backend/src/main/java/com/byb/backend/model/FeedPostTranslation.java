package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * One translation of a FeedPost into a single language.
 *
 * Posts are generated in English; the daily cron then makes one
 * Gemini call per supported language to translate the whole batch
 * at once. Stored per-language so the read path is just a join, no
 * runtime translation. Returns the English text if a translation
 * for the requested language doesn't exist yet.
 *
 * `language` matches the i18n codes used by the mobile app — "fr",
 * "ar", "es". (English is implicit; we don't store en→en.)
 */
@Entity
@Table(
        name = "feed_post_translations",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_feed_translation",
                        columnNames = {"post_id", "language"}
                )
        },
        indexes = {
                @Index(name = "idx_feed_translation_post", columnList = "post_id")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class FeedPostTranslation extends BaseEntity {

    @Id
    @Column(name = "translation_id", length = 50)
    private String translationId;

    @Column(name = "post_id", length = 50, nullable = false)
    private String postId;

    /** "fr", "ar", "es" — lowercase 2-letter codes. */
    @Column(name = "language", length = 8, nullable = false)
    private String language;

    @Column(name = "title", nullable = false, length = 300)
    private String title;

    @Column(name = "body", nullable = false, columnDefinition = "TEXT")
    private String body;
}
