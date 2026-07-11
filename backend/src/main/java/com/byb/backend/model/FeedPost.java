package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * One AI-generated post in the daily learning feed.
 *
 * Generation is centralised — a daily cron in FeedGenerationService
 * calls Gemini, parses the JSON it returns, and inserts a small batch
 * (4 posts: 1 fun fact, 2 domain tips, 1 motivational quote). All
 * students see the same posts, ordered newest-first. Personalisation
 * would happen by filtering on `domain` later.
 */
@Entity
@Table(
        name = "feed_posts",
        indexes = {
                @Index(name = "idx_feed_posts_published", columnList = "published_at"),
                @Index(name = "idx_feed_posts_category", columnList = "category"),
                @Index(name = "idx_feed_posts_domain", columnList = "domain")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class FeedPost extends BaseEntity {

    public enum Category {
        /** "Did you know?" short curiosity. */
        FUN_FACT,
        /** Actionable tip in a specific training domain. */
        DOMAIN_TIP,
        /** Inspirational quote or general learning advice. */
        MOTIVATION,
        /** Industry news or trend summary. */
        NEWS
    }

    @Id
    @Column(name = "post_id", length = 50)
    private String postId;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", length = 30, nullable = false)
    private Category category;

    /** Optional training-domain label for personalisation later
     *  (e.g. "Web Development", "Marketing"). Null for FUN_FACT and
     *  MOTIVATION posts that aren't domain-specific. */
    @Column(name = "domain", length = 80)
    private String domain;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "body", nullable = false, columnDefinition = "TEXT")
    private String body;

    /** Brand accent colour shown behind the card's icon. Stored as a
     *  hex string the mobile client renders directly. Kept on the row
     *  so the UI doesn't need a category→colour switch on every
     *  render. */
    @Column(name = "accent_color", length = 16)
    private String accentColor;

    /** Ionicon name (mobile uses @expo/vector-icons Ionicons). Saves
     *  the client from category→icon mapping. */
    @Column(name = "icon", length = 60)
    private String icon;

    /** Time the post becomes visible to users. Set to "now" by the
     *  cron; admin tools could backdate or schedule future posts. */
    @Column(name = "published_at", nullable = false)
    private LocalDateTime publishedAt;

    /** Denormalised count maintained by the like endpoint — saves
     *  a COUNT(*) on every feed render. */
    @Column(name = "likes_count")
    private Integer likesCount = 0;

    @Column(name = "is_active")
    private Boolean isActive = true;
}
