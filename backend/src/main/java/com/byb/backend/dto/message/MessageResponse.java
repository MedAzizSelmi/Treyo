package com.byb.backend.dto.message;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Message response DTO
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MessageResponse {
    private String messageId;
    private String senderId;
    private String senderType;
    private String senderName;
    // Profile photo of the sender, looked up from students/trainers/admins
    // by senderId + senderType. May be null (no uploaded picture yet) —
    // the client falls back to an initial-letter avatar in that case.
    private String senderPhotoUrl;
    private String receiverId;
    private String receiverType;
    private String conversationId;
    // The group a group message belongs to; null for a direct message.
    // Both chat screens match live frames on this field and drop any
    // frame without it — it was missing, so every message pushed over
    // the socket was discarded on arrival.
    private String groupId;
    private String content;
    private String messageType;
    private String attachmentUrl;
    private Boolean isRead;
    private LocalDateTime readAt;
    private LocalDateTime sentAt;
}