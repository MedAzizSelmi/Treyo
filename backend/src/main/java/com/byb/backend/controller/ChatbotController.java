package com.byb.backend.controller;

import com.byb.backend.dto.chatbot.ChatRequest;
import com.byb.backend.dto.chatbot.ChatResponse;
import com.byb.backend.dto.chatbot.ChatWithImageRequest;
import com.byb.backend.service.GeminiService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/chatbot")
@RequiredArgsConstructor
@Tag(name = "Chatbot", description = "Treyo AI chatbot endpoint")
@SecurityRequirement(name = "bearerAuth")
public class ChatbotController {

    private final GeminiService geminiService;

    @PostMapping("/chat")
    @Operation(summary = "Send a message to Treyo AI and get a response")
    public ResponseEntity<ChatResponse> chat(@RequestBody ChatRequest request) {
        ChatResponse response = geminiService.chat(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/chat-with-image")
    @Operation(summary = "Send an image with optional text to Treyo AI")
    public ResponseEntity<ChatResponse> chatWithImage(@RequestBody ChatWithImageRequest request) {
        ChatResponse response = geminiService.chatWithImage(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/transcribe")
    @Operation(summary = "Transcribe audio to text using Gemini")
    public ResponseEntity<Map<String, String>> transcribe(@RequestParam("audio") MultipartFile audio) {
        String transcript = geminiService.transcribeAudio(audio);
        return ResponseEntity.ok(Map.of("transcript", transcript));
    }
}
