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

    // ── The automated group flow (GroupAutomationService) ──────────────
    //
    // Every notification carries the group as its related entity: the
    // automation reads them back to know what it has already sent, and the
    // app opens the right screen from them. actionData holds the values
    // the app needs to translate the title and message.

    private void sendForGroup(String userId, String userType, String type, String title, String message,
                              String groupId, String priority, Map<String, Object> params) {
        Notification n = new Notification();
        n.setNotificationId("NOT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        n.setUserId(userId);
        n.setUserType(userType);
        n.setNotificationType(type);
        n.setTitle(title);
        n.setMessage(message);
        n.setRelatedEntityType("group");
        n.setRelatedEntityId(groupId);
        n.setPriority(priority);
        n.setActionData(paramsJson(params));
        notificationRepository.save(n);
        firePush(userId, type, title, message, "group", groupId);
    }

    /** Trainer: a group opened for your course — schedule its sessions. */
    @Transactional
    public void sendScheduleRequest(String trainerId, String groupId, String courseTitle, boolean reminder) {
        sendForGroup(trainerId, "trainer", reminder ? "GROUP_SCHEDULE_REMINDER" : "GROUP_SCHEDULE_REQUEST",
                (reminder ? "Reminder: schedule " : "Schedule the sessions for ") + courseTitle,
                "Enough learners asked for '" + courseTitle + "'. Plan the group's sessions so they can be invited to join.",
                groupId, "high", Map.of("course", courseTitle));
    }

    /** Trainer: the administrator approved your schedule; learners are invited. */
    @Transactional
    public void sendScheduleApproved(String trainerId, String groupId, String courseTitle) {
        sendForGroup(trainerId, "trainer", "GROUP_SCHEDULE_APPROVED",
                "Schedule approved for " + courseTitle,
                "Your sessions for '" + courseTitle + "' were approved and learners are being invited to join.",
                groupId, "normal", Map.of("course", courseTitle));
    }

    /** Learner: a group is open — here are its dates, pay to join. */
    @Transactional
    public void sendPaymentOpen(String studentId, String groupId, String courseId, String courseTitle,
                                String firstSession, int sessionCount) {
        sendForGroup(studentId, "student", "GROUP_PAYMENT_OPEN",
                "Your group for " + courseTitle + " is open",
                "The sessions for '" + courseTitle + "' are scheduled, starting " + firstSession
                        + ". Check the dates and pay to secure your place.",
                groupId, "high", Map.of(
                        "course", courseTitle, "courseId", courseId, "groupId", groupId,
                        "firstSession", firstSession, "sessions", sessionCount));
    }

    /** Learner: two days before, the place is still unpaid. */
    @Transactional
    public void sendPaymentReminder(String studentId, String groupId, String courseId, String courseTitle,
                                    String firstSession) {
        sendForGroup(studentId, "student", "GROUP_PAYMENT_REMINDER",
                "Last days to join " + courseTitle,
                "The group for '" + courseTitle + "' starts " + firstSession
                        + ". Pay now to keep your place: the group goes ahead without unpaid places the day before.",
                groupId, "high", Map.of(
                        "course", courseTitle, "courseId", courseId, "groupId", groupId, "firstSession", firstSession));
    }

    /** Learner or trainer: nobody paid, so the group did not go ahead. */
    @Transactional
    public void sendGroupClosed(String userId, String userType, String groupId, String courseTitle) {
        boolean learner = "student".equals(userType);
        sendForGroup(userId, userType, "GROUP_CLOSED",
                "The group for " + courseTitle + " did not go ahead",
                "Nobody joined the group for '" + courseTitle + "' before its first session, so it will not run."
                        + (learner ? " Nothing was charged. If you are still interested, request the course again." : ""),
                groupId, "normal", Map.of("course", courseTitle));
    }

    /** Learner: the group started without them; their request has ended. */
    @Transactional
    public void sendGroupMissed(String studentId, String groupId, String courseTitle) {
        sendForGroup(studentId, "student", "GROUP_MISSED",
                "The group for " + courseTitle + " has started",
                "The group for '" + courseTitle + "' started without your place, as it was not paid. "
                        + "If you are still interested, request the course again for the next group.",
                groupId, "normal", Map.of("course", courseTitle));
    }

    // ── Course suggestions (CourseSuggestionService) ───────────────────

    private void sendAbout(String userId, String userType, String type, String title, String message,
                           String entityType, String entityId, String priority, Map<String, Object> params) {
        Notification n = new Notification();
        n.setNotificationId("NOT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        n.setUserId(userId);
        n.setUserType(userType);
        n.setNotificationType(type);
        n.setTitle(title);
        n.setMessage(message);
        n.setRelatedEntityType(entityType);
        n.setRelatedEntityId(entityId);
        n.setPriority(priority);
        n.setActionData(paramsJson(params));
        notificationRepository.save(n);
        firePush(userId, type, title, message, entityType, entityId);
    }

    /** Learner: the course they asked for exists, and their request for it is registered. */
    @Transactional
    public void sendSuggestionPublished(String studentId, String courseId, String courseTitle, String topic) {
        sendAbout(studentId, "student", "COURSE_SUGGESTION_PUBLISHED",
                courseTitle + " is now available",
                "You asked for a course on '" + topic + "'. '" + courseTitle + "' is now available, and your "
                        + "request for it is registered: you will be invited with the dates when a group opens.",
                "course", courseId, "high", Map.of("course", courseTitle, "courseId", courseId, "topic", topic));
    }

    /** Learner: the course they asked for will not be offered. */
    @Transactional
    public void sendSuggestionDeclined(String studentId, String suggestionId, String topic) {
        sendAbout(studentId, "student", "COURSE_SUGGESTION_DECLINED",
                "About your request: " + topic,
                "Thank you for suggesting '" + topic + "'. We could not find a trainer for it for now, so it "
                        + "will not be offered at the moment. You are welcome to suggest other courses.",
                "course_suggestion", suggestionId, "normal", Map.of("topic", topic));
    }

    /** Administrator: a learner suggested a course. In-app only; the dashboard lists them. */
    @Transactional
    public void sendSuggestionToAdmin(String adminId, String suggestionId, String topic) {
        sendAbout(adminId, "admin", "COURSE_SUGGESTION_NEW",
                "New course suggestion: " + topic,
                "A learner asked for a course on '" + topic + "'. Review it on the Course suggestions page.",
                "course_suggestion", suggestionId, "normal", Map.of("topic", topic));
    }

    /** Trainer: the group's sessions are over — send the end-of-course report. */
    @Transactional
    public void sendReportRequest(String trainerId, String groupId, String courseTitle, boolean reminder) {
        sendForGroup(trainerId, "trainer", reminder ? "GROUP_REPORT_REMINDER" : "GROUP_REPORT_REQUEST",
                (reminder ? "Reminder: report on " : "Your report on ") + courseTitle,
                "The sessions for '" + courseTitle + "' are over. Send your end-of-course report: "
                        + "learners who completed receive their attestation once it is in.",
                groupId, "high", Map.of("course", courseTitle));
    }

    /** Learner: the trainer marked them as having completed the course; the attestation is ready. */
    @Transactional
    public void sendCourseCompleted(String studentId, String groupId, String enrollmentId, String courseTitle) {
        sendForGroup(studentId, "student", "COURSE_COMPLETED",
                "Congratulations on completing " + courseTitle + "!",
                "You completed '" + courseTitle + "'. Your attestation de participation is ready to download, "
                        + "and we have emailed it to you.",
                groupId, "high", Map.of("course", courseTitle, "enrollmentId", enrollmentId));
    }

    /** Administrator: something in a group needs a person. Also recorded so it is sent once. */
    @Transactional
    public void sendAdminGroupAlert(String adminId, String type, String groupId, String title, String message,
                                    String courseTitle) {
        sendForGroup(adminId, "admin", type, title, message, groupId, "high", Map.of("course", courseTitle));
    }

    // The GROUP_FORMING senders went with the manual "notify interested"
    // step in October 2026. The app still shows GROUP_FORMING
    // notifications already sent.

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

    /**
     * Mark a notification read, if it belongs to {@code userId}.
     *
     * @return false when there is no such notification or it is someone
     *         else's — the caller cannot tell which, by design
     */
    @Transactional
    public boolean markAsReadFor(String notificationId, String userId) {
        Notification notification = notificationRepository.findById(notificationId).orElse(null);
        if (notification == null || userId == null || !userId.equals(notification.getUserId())) {
            return false;
        }

        notification.setIsRead(true);
        notification.setReadAt(LocalDateTime.now());
        notificationRepository.save(notification);
        return true;
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