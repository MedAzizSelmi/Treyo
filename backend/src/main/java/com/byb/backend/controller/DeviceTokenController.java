package com.byb.backend.controller;

import com.byb.backend.model.DeviceToken;
import com.byb.backend.repository.DeviceTokenRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Endpoints for the mobile app to register / unregister its Expo push
 * token. Called on every successful login and on logout.
 *
 * Token uniqueness is enforced at the DB level — if a physical device
 * was previously registered to a different user, we rebind it to the
 * current one rather than creating a duplicate. Without that, logging
 * out + back in as someone else would silently push to the previous
 * account.
 */
@RestController
@RequestMapping("/api/devices")
@RequiredArgsConstructor
@Tag(name = "Devices", description = "Expo push token registration")
@SecurityRequirement(name = "bearerAuth")
public class DeviceTokenController {

    private final DeviceTokenRepository deviceTokenRepository;

    /**
     * Body:
     *   {
     *     "userId":   "...",        // required
     *     "userType": "student|trainer|admin",
     *     "token":    "ExponentPushToken[xxxxxxxxxx]",
     *     "platform": "ios|android|web"
     *   }
     */
    @PostMapping("/register")
    @Operation(summary = "Register an Expo push token for the current user")
    @Transactional
    public ResponseEntity<?> register(@RequestBody Map<String, Object> body) {
        String userId = stringOrNull(body.get("userId"));
        String token = stringOrNull(body.get("token"));
        String userType = stringOrNull(body.get("userType"));
        String platform = stringOrNull(body.get("platform"));

        if (userId == null || token == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "userId and token are required"));
        }

        Optional<DeviceToken> existing = deviceTokenRepository.findByToken(token);
        DeviceToken row;
        if (existing.isPresent()) {
            // Rebind the device to the current user (handles the
            // "previously logged in as someone else on this phone" case).
            row = existing.get();
            row.setUserId(userId);
            row.setUserType(userType);
            row.setPlatform(platform);
        } else {
            row = new DeviceToken();
            row.setDeviceTokenId("dt_" + UUID.randomUUID().toString().replace("-", "").substring(0, 18));
            row.setUserId(userId);
            row.setUserType(userType);
            row.setToken(token);
            row.setPlatform(platform);
        }
        deviceTokenRepository.save(row);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @PostMapping("/unregister")
    @Operation(summary = "Drop an Expo push token (called on logout)")
    @Transactional
    public ResponseEntity<?> unregister(@RequestBody Map<String, Object> body) {
        String token = stringOrNull(body.get("token"));
        if (token == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "token is required"));
        }
        deviceTokenRepository.deleteByToken(token);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    private static String stringOrNull(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
