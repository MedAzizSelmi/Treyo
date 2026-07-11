package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * One row per (user, post, type) so a user can both like AND save the
 * same post. Two unique constraints keep us idempotent — calling the
 * like endpoint twice from the same user is a no-op.
 */
@Entity
@Table(
        name = "feed_reactions",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_feed_reaction", columnNames = {"user_id", "post_id", "reaction_type"})
        },
        indexes = {
                @Index(name = "idx_feed_reaction_user", columnList = "user_id"),
                @Index(name = "idx_feed_reaction_post", columnList = "post_id")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class FeedReaction extends BaseEntity {

    public enum Type { LIKE, SAVE }

    @Id
    @Column(name = "reaction_id", length = 50)
    private String reactionId;

    @Column(name = "user_id", length = 50, nullable = false)
    private String userId;

    @Column(name = "post_id", length = 50, nullable = false)
    private String postId;

    @Enumerated(EnumType.STRING)
    @Column(name = "reaction_type", length = 20, nullable = false)
    private Type type;
}
