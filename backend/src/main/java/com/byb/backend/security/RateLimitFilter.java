package com.byb.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Throttles the unauthenticated endpoints that are worth brute-forcing.
 *
 * These endpoints are attractive for two different reasons: login lets an
 * attacker guess passwords, and the password-reset / resend-verification
 * endpoints send an email on every call, so they can be abused to flood a
 * third party's inbox from our SMTP reputation.
 *
 * The counter is a fixed window per (client IP, endpoint group), held in
 * memory. That is intentionally modest: it stops scripted abuse without
 * adding a Redis dependency. It does NOT survive a restart and does not
 * coordinate across instances, so if the platform is ever scaled to more
 * than one backend node this should move to a shared store.
 */
@Component
@Order(1) // ahead of JwtAuthenticationFilter — cheap rejection first
@Slf4j
public class RateLimitFilter extends OncePerRequestFilter {

    /** Endpoints where a wrong guess is cheap for the attacker. */
    private static final String LOGIN_PATH = "/api/auth/login";

    /** Endpoints that cause an email to be sent. */
    private static final String[] EMAIL_PATHS = {
            "/api/auth/forgot-password",
            "/api/auth/resend-verification",
            "/api/auth/register"
    };

    @Value("${app.ratelimit.enabled:true}")
    private boolean enabled;

    @Value("${app.ratelimit.login-attempts:10}")
    private int loginAttempts;

    @Value("${app.ratelimit.email-attempts:5}")
    private int emailAttempts;

    @Value("${app.ratelimit.window-minutes:15}")
    private int windowMinutes;

    private final Map<String, Window> counters = new ConcurrentHashMap<>();

    private static final class Window {
        final Instant start;
        final AtomicInteger count = new AtomicInteger();
        Window(Instant start) { this.start = start; }
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        if (!enabled || !"POST".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        String path = request.getRequestURI();
        Integer limit = limitFor(path);
        if (limit == null) {
            filterChain.doFilter(request, response);
            return;
        }

        String key = clientIp(request) + "|" + bucketFor(path);
        if (exceeded(key, limit)) {
            log.warn("Rate limit hit for {} on {}", clientIp(request), path);
            response.setStatus(429); // Too Many Requests
            response.setContentType("application/json");
            response.setHeader("Retry-After", String.valueOf(windowMinutes * 60));
            response.getWriter().write(
                    "{\"error\":\"Too many attempts. Please wait a few minutes and try again.\"}");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private Integer limitFor(String path) {
        if (path.startsWith(LOGIN_PATH)) return loginAttempts;
        for (String p : EMAIL_PATHS) {
            if (path.startsWith(p)) return emailAttempts;
        }
        return null;
    }

    private String bucketFor(String path) {
        return path.startsWith(LOGIN_PATH) ? "login" : "email";
    }

    private boolean exceeded(String key, int limit) {
        Instant now = Instant.now();
        Window w = counters.compute(key, (k, existing) -> {
            if (existing == null
                    || Duration.between(existing.start, now).toMinutes() >= windowMinutes) {
                return new Window(now);
            }
            return existing;
        });
        // Opportunistic cleanup so the map cannot grow without bound.
        if (counters.size() > 10_000) {
            counters.entrySet().removeIf(e ->
                    Duration.between(e.getValue().start, now).toMinutes() >= windowMinutes);
        }
        return w.count.incrementAndGet() > limit;
    }

    /**
     * Client address, honouring X-Forwarded-For because the service sits
     * behind a reverse proxy in production. Only the first hop is used;
     * the header is attacker-controlled, so this is a throttling aid, not
     * an identity claim.
     */
    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma > 0 ? forwarded.substring(0, comma) : forwarded).trim();
        }
        return request.getRemoteAddr();
    }
}
