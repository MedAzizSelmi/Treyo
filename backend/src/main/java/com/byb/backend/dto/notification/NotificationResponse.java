package com.byb.backend.dto.notification;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationResponse {

    private String notificationId;
    private String notificationType;
    private String title;
    private String message;
    private String relatedEntityType;
    private String relatedEntityId;
    private String actionUrl;
    private String actionData;
    private Boolean isRead;
    private String priority;
    private LocalDateTime createdAt;
}