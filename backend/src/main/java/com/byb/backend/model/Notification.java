package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

@Entity
@Table(name = "notifications")
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class Notification extends BaseEntity {

    @Id
    @Column(name = "notification_id", length = 50)
    private String notificationId;

    @Column(name = "user_id", length = 50, nullable = false)
    private String userId; // student_id or trainer_id

    @Column(name = "user_type", length = 20)
    private String userType; // student, trainer, admin

    @Column(name = "notification_type", length = 50)
    private String notificationType;
    // GROUP_FORMING, GROUP_READY, ONE_TO_ONE_OFFER, NEW_MESSAGE,
    // COURSE_STARTING, ENROLLMENT_CONFIRMED, PAYMENT_REMINDER

    @Column(nullable = false, length = 500)
    private String title;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String message;

    @Column(name = "related_entity_type", length = 50)
    private String relatedEntityType; // course, group, enrollment, message

    @Column(name = "related_entity_id", length = 50)
    private String relatedEntityId;

    @Column(name = "action_url", length = 500)
    private String actionUrl;

    @Column(name = "action_data", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String actionData; // JSON data for the notification

    @Column(name = "is_read")
    private Boolean isRead = false;

    @Column(name = "read_at")
    private LocalDateTime readAt;

    @Column(name = "priority", length = 20)
    private String priority = "normal"; // low, normal, high, urgent
}