package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "messages")
@Data
@NoArgsConstructor
public class Message {  // DON'T extend BaseEntity - it causes issues

    @Id
    @Column(name = "message_id", length = 50)
    private String messageId;

    @Column(name = "sender_id", length = 50, nullable = false)
    private String senderId;

    @Column(name = "sender_type", length = 20, nullable = false)
    private String senderType;

    @Column(name = "receiver_id", length = 50, nullable = false)
    private String receiverId;

    @Column(name = "receiver_type", length = 20, nullable = false)
    private String receiverType;

    @Column(name = "conversation_id", length = 50)
    private String conversationId;

    @Column(name = "message_text", columnDefinition = "TEXT", nullable = false)
    private String content;

    @Column(name = "message_type", length = 20)
    private String messageType = "text";

    @Column(name = "attachment_url", length = 500)
    private String attachmentUrl;

    @Column(name = "is_read")
    private Boolean isRead = false;

    @Column(name = "read_at")
    private LocalDateTime readAt;

    @Column(name = "is_deleted")
    private Boolean isDeleted = false;

    // Timestamp fields (not inherited)
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // JPA lifecycle callback - automatically sets timestamps
    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        System.out.println("✅ @PrePersist called - created_at set to: " + this.createdAt);
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
        System.out.println("✅ @PreUpdate called - updated_at set to: " + this.updatedAt);
    }
}