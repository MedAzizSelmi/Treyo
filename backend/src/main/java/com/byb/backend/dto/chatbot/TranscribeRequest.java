package com.byb.backend.dto.chatbot;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TranscribeRequest {
    private String audioBase64;
    private String mimeType;
}
