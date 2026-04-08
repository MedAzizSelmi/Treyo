package com.byb.backend.dto.message;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Request to send a message
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SendMessageRequest {
    private String senderId;
    private String receiverId;
    private String content;
    private String messageType = "text"; // text, image, file
    private String attachmentUrl;
}