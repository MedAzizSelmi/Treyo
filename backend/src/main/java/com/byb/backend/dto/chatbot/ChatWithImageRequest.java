package com.byb.backend.dto.chatbot;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatWithImageRequest {
    private String imageBase64;
    private String mimeType;
    private String message;
    private List<ChatRequest.ChatMessage> history;
}
