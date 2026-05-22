package com.byb.backend.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.OperatingSystemMXBean;
import java.time.Duration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Admin-only system health endpoints.
 *
 * The admin dashboard hits these to render the "System Health" page —
 * model version, cache stats, CPU / memory for both the ML service and
 * this Spring Boot backend. We don't expose the ML service directly to
 * the internet (it has no auth); the admin dashboard goes through the
 * JWT-protected backend, which then proxies to ML over the private
 * network.
 */
@RestController
@RequestMapping("/api/admin/system")
@RequiredArgsConstructor
@Tag(name = "Admin System Health", description = "Operational metrics for admin monitoring")
@SecurityRequirement(name = "bearerAuth")
public class AdminSystemHealthController {

    private final WebClient.Builder webClientBuilder;

    @Value("${ml.service.url}")
    private String mlServiceUrl;

    /**
     * Proxy the ML service's /health response. We translate any error
     * (ML service down, slow, malformed) into a `status: unreachable`
     * payload so the dashboard can render a clear failure state instead
     * of a generic 500.
     */
    @GetMapping("/ml-health")
    @Operation(summary = "ML service /health snapshot (model, cache, CPU/memory, uptime)")
    public ResponseEntity<Map<String, Object>> mlHealth() {
        try {
            WebClient webClient = webClientBuilder.build();
            // Short timeout — this endpoint gets polled every few seconds
            // from the dashboard. A hanging ML service must not freeze the
            // backend thread.
            @SuppressWarnings("unchecked")
            Map<String, Object> ml = webClient.get()
                    .uri(mlServiceUrl + "/health")
                    .retrieve()
                    .bodyToMono(Map.class)
                    .timeout(Duration.ofSeconds(3))
                    .block();

            if (ml == null) {
                return ResponseEntity.ok(unreachable("Empty response from ML service"));
            }
            return ResponseEntity.ok(ml);
        } catch (Exception e) {
            // Don't 500 — the dashboard wants a structured "is the ML
            // service alive?" answer either way.
            return ResponseEntity.ok(unreachable(e.getMessage()));
        }
    }

    /**
     * Self-metrics for the Spring Boot backend itself. Uses the JDK's
     * built-in JMX MXBeans so we don't need to pull in micrometer or
     * Spring Boot Actuator. Cheap to call — safe to poll.
     */
    @GetMapping("/backend-health")
    @Operation(summary = "Backend JVM health snapshot (heap, threads, CPU)")
    public ResponseEntity<Map<String, Object>> backendHealth() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "ok");

        Runtime runtime = Runtime.getRuntime();
        MemoryMXBean memBean = ManagementFactory.getMemoryMXBean();
        OperatingSystemMXBean osBean = ManagementFactory.getOperatingSystemMXBean();

        // Heap (managed by the JVM — what Java code actually uses).
        long heapUsed = memBean.getHeapMemoryUsage().getUsed();
        long heapMax = memBean.getHeapMemoryUsage().getMax();
        // Non-heap = JVM metaspace + code cache. Smaller but still useful.
        long nonHeapUsed = memBean.getNonHeapMemoryUsage().getUsed();

        Map<String, Object> jvm = new LinkedHashMap<>();
        jvm.put("heap_used_mb", round(heapUsed / 1024.0 / 1024.0));
        jvm.put("heap_max_mb", heapMax < 0 ? null : round(heapMax / 1024.0 / 1024.0));
        jvm.put("heap_percent",
                heapMax > 0 ? round((heapUsed * 100.0) / heapMax) : null);
        jvm.put("non_heap_used_mb", round(nonHeapUsed / 1024.0 / 1024.0));
        jvm.put("thread_count", ManagementFactory.getThreadMXBean().getThreadCount());
        // JVM uptime in seconds — same shape as ML /health for consistency.
        jvm.put("uptime_seconds", ManagementFactory.getRuntimeMXBean().getUptime() / 1000);
        jvm.put("processors", runtime.availableProcessors());
        jvm.put("jvm_version", System.getProperty("java.version"));

        // System load average (1-min). Returns -1 on Windows — guard against
        // surfacing that as a real number.
        double load = osBean.getSystemLoadAverage();
        jvm.put("system_load_1m", load < 0 ? null : round(load));

        out.put("jvm", jvm);
        return ResponseEntity.ok(out);
    }

    // ── helpers ──────────────────────────────────────────────────────

    private static Map<String, Object> unreachable(String reason) {
        Map<String, Object> err = new HashMap<>();
        err.put("status", "unreachable");
        err.put("model_loaded", false);
        err.put("error", reason);
        return err;
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
