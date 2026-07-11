package com.byb.backend.service;

import com.byb.backend.dto.notification.NotificationResponse;
import com.byb.backend.model.Notification;
import com.byb.backend.repository.NotificationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    // Pushed asynchronously alongside the in-DB notification so the user
    // gets a heads-up banner even if the app isn't open. The DB row is
    // still the source of truth — push is a side channel.
    private final PushNotificationService pushNotificationService;
    // Used to serialise i18n params into Notification.actionData so the
    // mobile client can re-render the title/message in the user's
    // language. See the notification translation flow in
    // treyo-mobile/app/(student-tabs)/notifications.tsx.
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Serialise the i18n param map to a JSON string for actionData.
     *  Returns null on any error so we don't fail the notification
     *  insert just because translations can't be reconstructed. */
    private String paramsJson(Map<String, Object> params) {
        try {
            return objectMapper.writeValueAsString(params);
        } catch (Exception e) {
            return null;
        }
    }

    /** Small helper so every notification path also fires an OS-level
     *  push without duplicating the boilerplate Map.of for `data`. */
    private void firePush(String userId, String type, String title, String message,
                          String entityType, String entityId) {
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("type", type);
        if (entityType != null) data.put("entityType", entityType);
        if (entityId != null) data.put("entityId", entityId);
        pushNotificationService.sendToUser(userId, title, message, data);
    }

    @Transactional
    public void sendGroupFormingNotification(String studentId, String courseId,
                                             String courseTitle, int currentCount, int minRequired) {
        Notification notification = new Notification();
        notification.setNotificationId("NOT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        notification.setUserId(studentId);
        notification.setUserType("student");
        notification.setNotificationType("GROUP_FORMING");
        notification.setTitle("Group Forming for " + courseTitle);
        notification.setMessage(
                String.format("Great news! We have %d/%d students interested in '%s'. " +
                                "Confirm your presence to join the group!",
                        currentCount, minRequired, courseTitle)
        );
        notification.setRelatedEntityType("course");
        notification.setRelatedEntityId(courseId);
        notification.setActionUrl("/courses/" + courseId + "/confirm");
        notification.setPriority("high");
        notification.setActionData(paramsJson(Map.of(
                "course", courseTitle,
                "current", currentCount,
                "min", minRequired
        )));

        notificationRepository.save(notification);
        firePush(notification.getUserId(), notification.getNotificationType(),
                notification.getTitle(), notification.getMessage(),
                notification.getRelatedEntityType(), notification.getRelatedEntityId());
    }

    @Transactional
    public void sendGroupFormingNotificationToTrainer(String trainerId, String courseId,
                                                      String courseTitle, int interestedCount) {
        Notification notification = new Notification();
        notification.setNotificationId("NOT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        notification.setUserId(trainerId);
        notification.setUserType("trainer");
        notification.setNotificationType("GROUP_FORMING");
        notification.setTitle("Students Interested in Your Course");
        notification.setMessage(
                String.format("%d students are interested in '%s'. " +
                                "The group is forming!",
                        interestedCount, courseTitle)
        );
        notification.setRelatedEntityType("course");
        notification.setRelatedEntityId(courseId);
        notification.setPriority("high");
        notification.setActionData(paramsJson(Map.of(
                "course", courseTitle,
                "count", interestedCount
        )));

        notificationRepository.save(notification);
        firePush(notification.getUserId(), notification.getNotificationType(),
                notification.getTitle(), notification.getMessage(),
                notification.getRelatedEntityType(), notification.getRelatedEntityId());
    }

    @Transactional
    public void sendOneToOneOfferNotification(String studentId, String courseId,
                                              String courseTitle, String trainerId) {
        Notification notification = new Notification();
        notification.setNotificationId("NOT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        notification.setUserId(studentId);
        notification.setUserType("student");
        notification.setNotificationType("ONE_TO_ONE_OFFER");
        notification.setTitle("One-to-One Session Available");
        notification.setMessage(
                String.format("The trainer is offering one-to-one sessions for '%s'. " +
                                "Are you interested?",
                        courseTitle)
        );
        notification.setRelatedEntityType("course");
        notification.setRelatedEntityId(courseId);
        notification.setActionUrl("/courses/" + courseId + "/one-to-one");
        notification.setPriority("normal");
        notification.setActionData(paramsJson(Map.of("course", courseTitle)));

        notificationRepository.save(notification);
        firePush(notification.getUserId(), notification.getNotificationType(),
                notification.getTitle(), notification.getMessage(),
                notification.getRelatedEntityType(), notification.getRelatedEntityId());
    }

    @Transactional
    public void sendGroupReadyNotification(String studentId, String groupId, String courseTitle) {
        Notification notification = new Notification();
        notification.setNotificationId("NOT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        notification.setUserId(studentId);
        notification.setUserType("student");
        notification.setNotificationType("GROUP_READY");
        notification.setTitle("Group Ready to Start!");
        notification.setMessage(
                String.format("Your group for '%s' is ready to start. " +
                                "Check the schedule and meeting details.",
                        courseTitle)
        );
        notification.setRelatedEntityType("group");
        notification.setRelatedEntityId(groupId);
        notification.setActionUrl("/groups/" + groupId);
        notification.setPriority("high");
        notification.setActionData(paramsJson(Map.of("course", courseTitle)));

        notificationRepository.save(notification);
        firePush(notification.getUserId(), notification.getNotificationType(),
                notification.getTitle(), notification.getMessage(),
                notification.getRelatedEntityType(), notification.getRelatedEntityId());
    }

    @Transactional
    public void sendNewMessageNotification(String receiverId, String receiverType,
                                           String senderName, String messagePreview) {
        Notification notification = new Notification();
        notification.setNotificationId("NOT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        notification.setUserId(receiverId);
        notification.setUserType(receiverType);
        notification.setNotificationType("NEW_MESSAGE");
        notification.setTitle("New Message from " + senderName);
        notification.setMessage(messagePreview);
        notification.setActionUrl("/messages");
        notification.setPriority("normal");
        notification.setActionData(paramsJson(Map.of("sender", senderName)));

        notificationRepository.save(notification);
        firePush(notification.getUserId(), notification.getNotificationType(),
                notification.getTitle(), notification.getMessage(),
                notification.getRelatedEntityType(), notification.getRelatedEntityId());
    }

    public List<NotificationResponse> getUserNotifications(String userId) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    public List<NotificationResponse> getUnreadNotifications(String userId) {
        return notificationRepository.findUnreadByUserId(userId)
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    public long getUnreadCount(String userId) {
        return notificationRepository.countUnreadByUserId(userId);
    }

    @Transactional
    public void markAsRead(String notificationId) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new RuntimeException("Notification not found"));

        notification.setIsRead(true);
        notification.setReadAt(LocalDateTime.now());
        notificationRepository.save(notification);
    }

    private NotificationResponse mapToResponse(Notification notification) {
        return NotificationResponse.builder()
                .notificationId(notification.getNotificationId())
                .notificationType(notification.getNotificationType())
                .title(notification.getTitle())
                .message(notification.getMessage())
                .relatedEntityType(notification.getRelatedEntityType())
                .relatedEntityId(notification.getRelatedEntityId())
                .actionUrl(notification.getActionUrl())
                .actionData(notification.getActionData())
                .isRead(notification.getIsRead())
                .priority(notification.getPriority())
                .createdAt(notification.getCreatedAt())
                .build();
    }
}