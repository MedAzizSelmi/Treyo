package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * One Expo push token belonging to a user (student / trainer / admin).
 *
 * A single user can have multiple rows here — e.g. they install the app
 * on a phone and a tablet. Tokens are unique across users: if the same
 * physical device is logged into a different account, the new user's
 * registration call rewrites the row's userId so we don't push to
 * the wrong user.
 */
@Entity
@Table(
        name = "device_tokens",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_device_tokens_token", columnNames = "token")
        },
        indexes = {
                @Index(name = "idx_device_tokens_user", columnList = "user_id")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class DeviceToken extends BaseEntity {

    @Id
    @Column(name = "device_token_id", length = 50)
    private String deviceTokenId;

    @Column(name = "user_id", length = 50, nullable = false)
    private String userId;

    /** "student", "trainer", or "admin". Used so the push service can
     *  shape the payload (e.g. deep-link to the right tab). */
    @Column(name = "user_type", length = 20)
    private String userType;

    /** Expo push token — looks like "ExponentPushToken[xxxxxxxxxx]" */
    @Column(name = "token", length = 200, nullable = false)
    private String token;

    /** "ios", "android", "web" — optional, used only for diagnostics. */
    @Column(name = "platform", length = 20)
    private String platform;
}
