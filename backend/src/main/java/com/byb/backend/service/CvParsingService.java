package com.byb.backend.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.util.MultiValueMap;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.Set;

/**
 * CV parsing through Affinda, called from the server.
 *
 * ── Why this exists ─────────────────────────────────────────────────
 * The mobile app used to call api.affinda.com directly with an
 * EXPO_PUBLIC_ key. Anything with that prefix is compiled into the
 * JavaScript bundle, so in a published build the key can be read out of
 * the app by anyone who downloads it — and spent against the account
 * until it is rotated. Rotating it then means shipping a new build to
 * every installed device.
 *
 * Here the key never leaves the server, one rotation covers every
 * client, and the upload goes through an endpoint that already knows who
 * the caller is.
 *
 * ── Failure is not an error ─────────────────────────────────────────
 * Parsing only pre-fills a form the user can fill by hand. When the key
 * is missing or Affinda refuses, the caller gets an empty result and the
 * onboarding screens stay exactly as they are.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class CvParsingService {

    private final WebClient.Builder webClientBuilder;

    /** Affinda's own cap is larger; this matches the document limit elsewhere. */
    private static final long MAX_BYTES = 20L * 1024 * 1024;
    private static final Duration TIMEOUT = Duration.ofSeconds(45);

    private static final Set<String> ALLOWED_TYPES = Set.of(
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    @Value("${affinda.api.key:}")
    private String apiKey;

    @Value("${affinda.api.base-url:https://api.affinda.com/v2}")
    private String baseUrl;

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /** Thrown when the caller sent something Affinda should never see. */
    public static class InvalidCvException extends RuntimeException {
        public InvalidCvException(String message) {
            super(message);
        }
    }

    /**
     * Parse a CV and return Affinda's {@code data} object — the same
     * shape the mobile screens already map, so the client keeps its
     * field-mapping logic and only changes where it posts the file.
     *
     * @return the parsed document, or an empty map when parsing is
     *         unavailable or produced nothing usable
     */
    public Map<String, Object> parse(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new InvalidCvException("No file was uploaded.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new InvalidCvException("The CV is larger than 20 MB.");
        }
        String contentType = file.getContentType();
        if (contentType != null && !ALLOWED_TYPES.contains(contentType)) {
            throw new InvalidCvException("Only PDF and Word documents can be parsed.");
        }
        if (!isConfigured()) {
            // No key configured: the client falls back to manual entry.
            log.warn("CV parsing requested but affinda.api.key is not configured");
            return Map.of();
        }

        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        try {
            // ByteArrayResource with an explicit filename: without the
            // override Spring sends no filename part and Affinda rejects
            // the upload.
            String filename = file.getOriginalFilename() == null ? "cv.pdf" : file.getOriginalFilename();
            builder.part("file", new ByteArrayResource(file.getBytes()) {
                @Override
                public String getFilename() {
                    return filename;
                }
            });
        } catch (IOException e) {
            throw new InvalidCvException("The uploaded file could not be read.");
        }
        MultiValueMap<String, org.springframework.http.HttpEntity<?>> parts = builder.build();

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = webClientBuilder.build()
                    .post()
                    .uri(normalizedBase() + "/resumes")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(parts))
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block(TIMEOUT);

            if (response == null) return Map.of();
            Object data = response.get("data");
            if (data instanceof Map<?, ?> parsed) {
                @SuppressWarnings("unchecked")
                Map<String, Object> typed = (Map<String, Object>) parsed;
                return typed;
            }
            return Map.of();
        } catch (RuntimeException e) {
            // Same contract as a missing key: the user fills the form.
            log.error("Affinda parse failed: {}", e.getMessage());
            return Map.of();
        }
    }

    private String normalizedBase() {
        return baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }
}
