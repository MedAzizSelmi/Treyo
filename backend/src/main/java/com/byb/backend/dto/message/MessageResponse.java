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
    private String receiverId;
    private String receiverType;
    private String conversationId;
    private String content;
    private String messageType;
    private String attachmentUrl;
    private Boolean isRead;
    private LocalDateTime readAt;
    private LocalDateTime sentAt;
}