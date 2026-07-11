package com.byb.backend.controller;

import com.byb.backend.model.SystemSetting;
import com.byb.backend.repository.SystemSettingRepository;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * Admin-tunable settings. Currently just:
 *   - revenue.currency (ISO-4217 code — "USD", "EUR", "TND", ...)
 *
 * GET is intentionally public so the mobile app and public pages can
 * read the display currency without an admin token. Mutation is admin-
 * only.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "System Settings", description = "Admin-tunable global settings")
public class SystemSettingController {

    private static final String REVENUE_CURRENCY_KEY = "revenue.currency";
    private static final String DEFAULT_REVENUE_CURRENCY = "TND";

    private final SystemSettingRepository repo;

    /**
     * Public read of the display currency used for revenue figures.
     * Falls back to the DEFAULT_REVENUE_CURRENCY when never set.
     */
    @GetMapping("/settings/revenue-currency")
    public ResponseEntity<Map<String, String>> getRevenueCurrency() {
        String value = repo.findById(REVENUE_CURRENCY_KEY)
                .map(SystemSetting::getValue)
                .orElse(DEFAULT_REVENUE_CURRENCY);
        Map<String, String> body = new HashMap<>();
        body.put("currency", value);
        return ResponseEntity.ok(body);
    }

    /**
     * Admin sets the revenue currency. Accepts any 3-letter code but
     * normalizes to upper-case; the UI restricts the picker to a
     * curated whitelist.
     */
    @PutMapping("/admin/settings/revenue-currency")
    public ResponseEntity<Map<String, String>> setRevenueCurrency(
            @RequestBody Map<String, String> body
    ) {
        String currency = body == null ? null : body.get("currency");
        if (currency == null || currency.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        String normalized = currency.trim().toUpperCase();
        SystemSetting s = repo.findById(REVENUE_CURRENCY_KEY)
                .orElseGet(() -> {
                    SystemSetting fresh = new SystemSetting();
                    fresh.setKey(REVENUE_CURRENCY_KEY);
                    return fresh;
                });
        s.setValue(normalized);
        repo.save(s);
        Map<String, String> result = new HashMap<>();
        result.put("currency", normalized);
        return ResponseEntity.ok(result);
    }
}
