package com.byb.backend.service;

import com.byb.backend.dto.notification.NotificationResponse;
import com.byb.backend.model.Notification;
import com.byb.backend.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;

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

        notificationRepository.save(notification);
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

        notificationRepository.save(notification);
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

        notificationRepository.save(notification);
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

        notificationRepository.save(notification);
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

        notificationRepository.save(notification);
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