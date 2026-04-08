package com.byb.backend.repository;

import com.byb.backend.model.Message;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface MessageRepository extends JpaRepository<Message, String> {

    List<Message> findByConversationId(String conversationId);

    long countByCreatedAtAfter(LocalDateTime date);

    @Query("SELECT COUNT(m) FROM Message m WHERE m.senderId = :userId OR m.receiverId = :userId")
    long countBySenderIdOrReceiverId(@Param("userId") String userId1, @Param("userId") String userId2);

    @Query("SELECT m FROM Message m WHERE m.conversationId = :conversationId ORDER BY m.createdAt ASC")
    List<Message> findByConversationIdOrderByCreatedAtAsc(String conversationId);

    @Query("SELECT m FROM Message m WHERE " +
            "(m.senderId = :userId1 AND m.receiverId = :userId2) OR " +
            "(m.senderId = :userId2 AND m.receiverId = :userId1) " +
            "ORDER BY m.createdAt DESC")
    List<Message> findConversationBetween(String userId1, String userId2);

    @Query("SELECT COUNT(m) FROM Message m WHERE m.receiverId = :userId AND m.isRead = false")
    long countUnreadMessages(String userId);

    // NEW QUERIES FOR MESSAGING SYSTEM

    /**
     * Find all messages in a conversation with pagination
     */
    @Query("SELECT m FROM Message m WHERE m.conversationId = :conversationId " +
            "AND m.isDeleted = false ORDER BY m.createdAt DESC")
    List<Message> findConversationBetweenLimited(
            @Param("conversationId") String conversationId,
            Pageable pageable
    );

    /**
     * Find all messages where user is sender or receiver
     */
    @Query("SELECT m FROM Message m WHERE (m.senderId = :userId OR m.receiverId = :userId) " +
            "AND m.isDeleted = false ORDER BY m.createdAt DESC")
    List<Message> findAllByUser(@Param("userId") String userId);

    /**
     * Find unread messages in a conversation
     */
    @Query("SELECT m FROM Message m WHERE m.conversationId = :conversationId " +
            "AND m.receiverId = :userId AND m.isRead = false AND m.isDeleted = false")
    List<Message> findUnreadInConversation(
            @Param("conversationId") String conversationId,
            @Param("userId") String userId
    );
}