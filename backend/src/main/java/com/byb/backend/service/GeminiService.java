package com.byb.backend.service;

import com.byb.backend.dto.chatbot.ChatRequest;
import com.byb.backend.dto.chatbot.ChatResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.Arrays;
import java.util.Base64;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class GeminiService {

    @Value("${gemini.api.key}")
    private String geminiApiKey;

    private static final String GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

    // Models tried in order — first one that works wins
    private static final List<String> FALLBACK_MODELS = Arrays.asList(
            "gemini-2.0-flash-lite",
            "gemini-2.0-flash",
            "gemini-flash-lite-latest",
            "gemini-flash-latest"
    );

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

    // ── Build the contents array shared by chat and transcribe ────────────────
    private ArrayNode buildContents(List<ChatRequest.ChatMessage> history, String newMessage) {
        ArrayNode contents = objectMapper.createArrayNode();

        // System prompt turn
        contents.add(textTurn("user", SYSTEM_PROMPT));
        contents.add(textTurn("model", "Understood! I'm Treyo AI, ready to assist students."));

        // Chat history
        if (history != null) {
            for (ChatRequest.ChatMessage msg : history) {
                contents.add(textTurn(msg.getRole(), msg.getText()));
            }
        }

        // New message
        contents.add(textTurn("user", newMessage));
        return contents;
    }

    private ObjectNode textTurn(String role, String text) {
        ObjectNode turn = objectMapper.createObjectNode();
        turn.put("role", role);
        ArrayNode parts = objectMapper.createArrayNode();
        ObjectNode part = objectMapper.createObjectNode();
        part.put("text", text);
        parts.add(part);
        turn.set("parts", parts);
        return turn;
    }

    // ── Call Gemini with automatic model fallback on 429 ─────────────────────
    private String callGemini(String bodyJson) throws Exception {
        WebClient client = WebClient.builder()
                .baseUrl(GEMINI_BASE_URL)
                .codecs(c -> c.defaultCodecs().maxInMemorySize(10 * 1024 * 1024))
                .build();

        Exception lastError = null;

        for (String model : FALLBACK_MODELS) {
            try {
                log.info("Trying Gemini model: {}", model);
                String url = "/v1beta/models/" + model + ":generateContent?key=" + geminiApiKey;
                String response = client.post()
                        .uri(url)
                        .header("Content-Type", "application/json")
                        .bodyValue(bodyJson)
                        .retrieve()
                        .bodyToMono(String.class)
                        .block();

                // Check for API-level error embedded in the 200 response body
                JsonNode root = objectMapper.readTree(response);
                if (root.has("error")) {
                    int code = root.path("error").path("code").asInt();
                    String message = root.path("error").path("message").asText();
                    log.warn("Gemini model {} returned error {}: {}", model, code, message);
                    if (code == 429) {
                        lastError = new RuntimeException("429: " + message);
                        continue; // try next model
                    }
                    throw new RuntimeException(code + ": " + message);
                }

                log.info("Gemini model {} succeeded", model);
                return response;

            } catch (WebClientResponseException e) {
                log.warn("Gemini model {} HTTP error {}: {}", model, e.getStatusCode().value(), e.getResponseBodyAsString());
                if (e.getStatusCode().value() == 429) {
                    lastError = e;
                    continue; // try next model
                }
                throw e;
            } catch (RuntimeException e) {
                if (e.getMessage() != null && e.getMessage().startsWith("429:")) {
                    lastError = e;
                    continue;
                }
                throw e;
            }
        }

        String exhaustedMsg = "All Gemini models quota-exceeded. Last error: "
                + (lastError != null ? lastError.getMessage() : "unknown");
        log.error(exhaustedMsg);
        throw new RuntimeException(exhaustedMsg);
    }

    // ── Extract text from Gemini response ─────────────────────────────────────
    private String extractText(String responseBody) throws Exception {
        JsonNode root = objectMapper.readTree(responseBody);
        return root.path("candidates").get(0)
                .path("content").path("parts").get(0)
                .path("text").asText();
    }

    // ── Public: chat ──────────────────────────────────────────────────────────
    public ChatResponse chat(ChatRequest request) {
        try {
            ArrayNode contents = buildContents(request.getHistory(), request.getMessage());

            ObjectNode body = objectMapper.createObjectNode();
            body.set("contents", contents);

            ObjectNode genConfig = objectMapper.createObjectNode();
            genConfig.put("maxOutputTokens", 512);
            genConfig.put("temperature", 0.7);
            body.set("generationConfig", genConfig);

            String response = callGemini(body.toString());
            String reply = extractText(response);
            return new ChatResponse(reply, true, null);

        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : "Unknown error";
            log.error("Gemini chat error: {}", msg);
            if (msg.contains("429") || msg.contains("quota")) {
                return new ChatResponse(null, false,
                        "All AI models are currently busy. Please wait a minute and try again.");
            }
            // Return the real error so it shows in the app during development
            return new ChatResponse(null, false, "AI error: " + msg);
        }
    }

    // ── Public: transcribe audio ──────────────────────────────────────────────
    public String transcribeAudio(MultipartFile audio) {
        try {
            byte[] audioBytes = audio.getBytes();
            String base64Audio = Base64.getEncoder().encodeToString(audioBytes);
            String mimeType = audio.getContentType() != null ? audio.getContentType() : "audio/m4a";

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

            String response = callGemini(body.toString());
            return extractText(response).trim();

        } catch (Exception e) {
            return "";
        }
    }
}
