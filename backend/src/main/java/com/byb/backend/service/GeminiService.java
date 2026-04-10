package com.byb.backend.service;

import com.byb.backend.dto.chatbot.ChatRequest;
import com.byb.backend.dto.chatbot.ChatResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Base64;
import java.util.List;

@Service
@RequiredArgsConstructor
public class GeminiService {

    @Value("${gemini.api.key}")
    private String geminiApiKey;

    @Value("${gemini.api.model:gemini-2.0-flash}")
    private String geminiModel;

    private static final String GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

    private static final String SYSTEM_PROMPT = """
            You are Treyo AI, a friendly and knowledgeable assistant built into the Treyo app — a platform that connects students with professional trainers.

            Your role is to help students with:
            - Finding and enrolling in training sessions or courses
            - Understanding their profile, bio, skills, and resume
            - Navigating the app (Home, Profile, Sessions, Messages, Chatbot)
            - Answering questions about training domains, education, and career development
            - Motivating and guiding learners on their journey

            Guidelines:
            - Be concise, warm, and encouraging
            - Use simple, clear language
            - If asked about something outside the app's scope, politely redirect
            - Address the user by their first name when you know it
            - Keep responses under 150 words unless a detailed explanation is truly needed
            """;

    private final ObjectMapper objectMapper = new ObjectMapper();

    public ChatResponse chat(ChatRequest request) {
        try {
            WebClient client = WebClient.builder()
                    .baseUrl(GEMINI_BASE_URL)
                    .build();

            // Build the contents array: system prompt first, then history, then new message
            ArrayNode contents = objectMapper.createArrayNode();

            // System prompt as first user turn
            ObjectNode systemTurn = objectMapper.createObjectNode();
            systemTurn.put("role", "user");
            ArrayNode systemParts = objectMapper.createArrayNode();
            ObjectNode systemPart = objectMapper.createObjectNode();
            systemPart.put("text", SYSTEM_PROMPT);
            systemParts.add(systemPart);
            systemTurn.set("parts", systemParts);
            contents.add(systemTurn);

            // System acknowledgement
            ObjectNode sysAck = objectMapper.createObjectNode();
            sysAck.put("role", "model");
            ArrayNode sysAckParts = objectMapper.createArrayNode();
            ObjectNode sysAckPart = objectMapper.createObjectNode();
            sysAckPart.put("text", "Understood! I'm Treyo AI, ready to assist students.");
            sysAckParts.add(sysAckPart);
            sysAck.set("parts", sysAckParts);
            contents.add(sysAck);

            // Chat history
            if (request.getHistory() != null) {
                for (ChatRequest.ChatMessage msg : request.getHistory()) {
                    ObjectNode turn = objectMapper.createObjectNode();
                    turn.put("role", msg.getRole());
                    ArrayNode parts = objectMapper.createArrayNode();
                    ObjectNode part = objectMapper.createObjectNode();
                    part.put("text", msg.getText());
                    parts.add(part);
                    turn.set("parts", parts);
                    contents.add(turn);
                }
            }

            // New user message
            ObjectNode userTurn = objectMapper.createObjectNode();
            userTurn.put("role", "user");
            ArrayNode userParts = objectMapper.createArrayNode();
            ObjectNode userPart = objectMapper.createObjectNode();
            userPart.put("text", request.getMessage());
            userParts.add(userPart);
            userTurn.set("parts", userParts);
            contents.add(userTurn);

            // Build request body
            ObjectNode body = objectMapper.createObjectNode();
            body.set("contents", contents);

            // Generation config
            ObjectNode genConfig = objectMapper.createObjectNode();
            genConfig.put("maxOutputTokens", 512);
            genConfig.put("temperature", 0.7);
            body.set("generationConfig", genConfig);

            String url = "/v1beta/models/" + geminiModel + ":generateContent?key=" + geminiApiKey;

            String responseBody = client.post()
                    .uri(url)
                    .header("Content-Type", "application/json")
                    .bodyValue(body.toString())
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            // Parse response
            JsonNode root = objectMapper.readTree(responseBody);
            String reply = root
                    .path("candidates").get(0)
                    .path("content")
                    .path("parts").get(0)
                    .path("text")
                    .asText();

            return new ChatResponse(reply, true, null);

        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : "Unknown error";
            if (msg.contains("429")) {
                return new ChatResponse(null, false, "AI quota exceeded. Please try again in a moment.");
            }
            return new ChatResponse(null, false, "AI service error: " + msg);
        }
    }

    public String transcribeAudio(MultipartFile audio) {
        try {
            WebClient client = WebClient.builder().baseUrl(GEMINI_BASE_URL).build();

            byte[] audioBytes = audio.getBytes();
            String base64Audio = Base64.getEncoder().encodeToString(audioBytes);
            String mimeType = audio.getContentType() != null ? audio.getContentType() : "audio/m4a";

            // Build request body with inline audio data
            ObjectNode body = objectMapper.createObjectNode();
            ArrayNode contents = objectMapper.createArrayNode();
            ObjectNode turn = objectMapper.createObjectNode();
            turn.put("role", "user");
            ArrayNode parts = objectMapper.createArrayNode();

            ObjectNode audioPart = objectMapper.createObjectNode();
            ObjectNode inlineData = objectMapper.createObjectNode();
            inlineData.put("mimeType", mimeType);
            inlineData.put("data", base64Audio);
            audioPart.set("inlineData", inlineData);
            parts.add(audioPart);

            ObjectNode textPart = objectMapper.createObjectNode();
            textPart.put("text", "Transcribe this audio exactly. Return ONLY the spoken words, nothing else.");
            parts.add(textPart);

            turn.set("parts", parts);
            contents.add(turn);
            body.set("contents", contents);

            String url = "/v1beta/models/" + geminiModel + ":generateContent?key=" + geminiApiKey;

            String responseBody = client.post()
                    .uri(url)
                    .header("Content-Type", "application/json")
                    .bodyValue(body.toString())
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            JsonNode root = objectMapper.readTree(responseBody);
            return root.path("candidates").get(0)
                    .path("content").path("parts").get(0)
                    .path("text").asText("").trim();

        } catch (Exception e) {
            return "";
        }
    }
}
