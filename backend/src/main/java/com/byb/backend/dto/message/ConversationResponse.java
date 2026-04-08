package com.byb.backend.dto.message;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Conversation summary DTO
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConversationResponse {
    private String conversationId;
    private String otherUserId;
    private String otherUserName;
    private String otherUserType; // STUDENT or TRAINER
    private String otherUserPhotoUrl;
    private String lastMessage;
    private LocalDateTime lastMessageTime;
    private Integer unreadCount;
    private Boolean isOnline; // For future presence feature
}