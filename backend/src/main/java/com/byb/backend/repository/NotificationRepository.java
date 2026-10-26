package com.byb.backend.repository;

import com.byb.backend.model.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, String> {

    List<Notification> findByUserId(String userId);

    @Query("SELECT n FROM Notification n WHERE n.userId = :userId ORDER BY n.createdAt DESC")
    List<Notification> findByUserIdOrderByCreatedAtDesc(String userId);

    @Query("SELECT n FROM Notification n WHERE n.userId = :userId AND n.isRead = false ORDER BY n.createdAt DESC")
    List<Notification> findUnreadByUserId(String userId);

    @Query("SELECT COUNT(n) FROM Notification n WHERE n.userId = :userId AND n.isRead = false")
    long countUnreadByUserId(String userId);

    // GroupAutomationService uses notifications as its record of what it
    // has already sent for a group (invitations, reminders, alerts), so a
    // job that runs every 15 minutes sends each one once.
    boolean existsByUserIdAndNotificationTypeAndRelatedEntityId(
            String userId, String notificationType, String relatedEntityId);

    boolean existsByNotificationTypeAndRelatedEntityId(String notificationType, String relatedEntityId);

    List<Notification> findByNotificationTypeAndRelatedEntityId(String notificationType, String relatedEntityId);

    List<Notification> findByNotificationType(String notificationType);
}