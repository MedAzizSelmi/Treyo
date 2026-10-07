package com.byb.backend.service;

import com.byb.backend.model.DeviceToken;
import com.byb.backend.repository.DeviceTokenRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Fires push notifications to Expo's push service.
 *
 * Why Expo's HTTP endpoint instead of FCM/APNs directly?
 *   - No native keys to deploy to prod servers
 *   - Same payload format for iOS + Android + web
 *   - Expo handles platform-specific delivery for us
 *
 * For production push, you still need to set up FCM (Android) and
 * APNs (iOS) credentials in the Expo project — see expo docs at
 * https://docs.expo.dev/push-notifications/sending-notifications/
 * But the *code* path here doesn't change between dev and prod.
 *
 * All sends are async ({@code @Async}) so the caller (e.g. a chat
 * message POST) never blocks on a 200ms round-trip to Expo. Failures
 * are logged but never thrown — pushing is a best-effort side effect.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PushNotificationService {

    private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

    private final DeviceTokenRepository deviceTokenRepository;
    private final ObjectMapper objectMapper;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    /**
     * Send the same notification to every device the user has registered.
     * Most users will only have one token, but this handles the
     * phone-+-tablet case correctly.
     */
    @Async
    public void sendToUser(String userId, String title, String body, Map<String, Object> data) {
        if (userId == null) return;
        List<DeviceToken> tokens = deviceTokenRepository.findByUserId(userId);
        if (tokens.isEmpty()) {
            // Worth saying out loud: "no devices" and "push was refused"
            // look identical from the outside, and the notification still
            // appears in the in-app list either way.
            log.info("No device tokens for user {} — nothing to push", userId);
            return;
        }

        List<Map<String, Object>> messages = new ArrayList<>();
        for (DeviceToken t : tokens) {
            Map<String, Object> m = new HashMap<>();
            m.put("to", t.getToken());
            m.put("title", title);
            m.put("body", body);
            m.put("sound", "default");
            // Higher priority on Android so the system shows the
            // heads-up notification banner instead of dropping it
            // into the shade silently.
            m.put("priority", "high");
            if (data != null) m.put("data", data);
            messages.add(m);
        }
        send(messages);
    }

    /** Bulk send to every userId in the list (e.g. all members of a group chat). */
    @Async
    public void sendToUsers(List<String> userIds, String title, String body, Map<String, Object> data) {
        if (userIds == null || userIds.isEmpty()) return;
        for (String uid : userIds) {
            sendToUser(uid, title, body, data);
        }
    }

    private void send(List<Map<String, Object>> messages) {
        try {
            String json = objectMapper.writeValueAsString(messages);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(EXPO_PUSH_URL))
                    .header("Accept", "application/json")
                    .header("Accept-Encoding", "gzip, deflate")
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(10))
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 400) {
                log.warn("Expo push failed: {} {}", res.statusCode(), res.body());
                return;
            }
            inspectTickets(res.body(), messages);
        } catch (Exception e) {
            log.warn("Push send error: {}", e.getMessage());
        }
    }

    /**
     * Read what Expo actually said about each message.
     *
     * Expo answers 200 even when it could not deliver anything: the
     * verdict is per-message, inside the body, as
     * {@code {"data":[{"status":"error","message":…,"details":{"error":…}}]}}.
     * Checking only the HTTP status therefore reports success for a push
     * that silently went nowhere — including the common case of an
     * Android build with no FCM credentials, where every message fails
     * and nothing at all is logged.
     *
     * A token Expo reports as DeviceNotRegistered is removed: the app was
     * uninstalled, or its data cleared, and the row would otherwise sit
     * there failing on every send until that user signed in again.
     */
    @SuppressWarnings("unchecked")
    private void inspectTickets(String body, List<Map<String, Object>> sent) {
        try {
            Map<String, Object> parsed = objectMapper.readValue(body, Map.class);
            Object dataNode = parsed.get("data");
            if (!(dataNode instanceof List<?> tickets)) {
                log.warn("Unexpected Expo push response: {}", body);
                return;
            }
            for (int i = 0; i < tickets.size(); i++) {
                if (!(tickets.get(i) instanceof Map<?, ?> ticket)) continue;
                if (!"error".equals(ticket.get("status"))) continue;

                String token = i < sent.size() ? String.valueOf(sent.get(i).get("to")) : "?";
                Object details = ticket.get("details");
                String code = details instanceof Map<?, ?> d
                        ? String.valueOf(d.get("error")) : "unknown";

                log.warn("Expo push rejected for {}: {} ({})",
                        maskToken(token), ticket.get("message"), code);

                if ("DeviceNotRegistered".equals(code)) {
                    try {
                        deviceTokenRepository.deleteByToken(token);
                        log.info("Dropped stale device token {}", maskToken(token));
                    } catch (Exception e) {
                        log.warn("Could not drop stale token: {}", e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Could not read Expo push response: {} — body was {}", e.getMessage(), body);
        }
    }

    /** Enough of the token to tell devices apart in a log, no more. */
    private String maskToken(String token) {
        if (token == null || token.length() < 12) return "…";
        return "…" + token.substring(token.length() - 8);
    }
}
