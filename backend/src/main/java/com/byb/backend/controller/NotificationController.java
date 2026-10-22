package com.byb.backend.controller;

import com.byb.backend.dto.notification.NotificationResponse;
import com.byb.backend.security.CallerGuard;
import com.byb.backend.service.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * A user's notifications. The {userId} in the path must be the caller's
 * own (or the caller an administrator) — it was taken on trust, so any
 * account could read anyone's inbox.
 */
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
@Tag(name = "Notifications", description = "User notifications")
@SecurityRequirement(name = "bearerAuth")
public class NotificationController {

    private final NotificationService notificationService;
    private final CallerGuard callerGuard;

    @GetMapping("/user/{userId}")
    @Operation(summary = "Get all notifications for user")
    public ResponseEntity<List<NotificationResponse>> getUserNotifications(@PathVariable String userId) {
        callerGuard.selfOrAdmin(userId);
        List<NotificationResponse> notifications = notificationService.getUserNotifications(userId);
        return ResponseEntity.ok(notifications);
    }

    @GetMapping("/user/{userId}/unread")
    @Operation(summary = "Get unread notifications")
    public ResponseEntity<List<NotificationResponse>> getUnreadNotifications(@PathVariable String userId) {
        callerGuard.selfOrAdmin(userId);
        List<NotificationResponse> notifications = notificationService.getUnreadNotifications(userId);
        return ResponseEntity.ok(notifications);
    }

    @GetMapping("/user/{userId}/unread/count")
    @Operation(summary = "Get unread notifications count")
    public ResponseEntity<Long> getUnreadCount(@PathVariable String userId) {
        callerGuard.selfOrAdmin(userId);
        long count = notificationService.getUnreadCount(userId);
        return ResponseEntity.ok(count);
    }

    /**
     * Only the recipient marks a notification read — an administrator
     * reading someone's inbox should not clear their badge.
     */
    @PutMapping("/{notificationId}/read")
    @Operation(summary = "Mark notification as read")
    public ResponseEntity<?> markAsRead(@PathVariable String notificationId) {
        String me = callerGuard.current().getUserId();
        if (!notificationService.markAsReadFor(notificationId, me)) {
            // Same answer for "not yours" and "does not exist".
            return ResponseEntity.status(404).body(Map.of("error", "Notification not found"));
        }
        return ResponseEntity.ok().build();
    }
}
