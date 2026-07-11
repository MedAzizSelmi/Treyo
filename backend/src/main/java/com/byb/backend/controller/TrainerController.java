package com.byb.backend.controller;

import com.byb.backend.dto.trainer.*;
import com.byb.backend.model.Course;
import com.byb.backend.model.Group;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.GroupRepository;
import com.byb.backend.repository.TrainerRepository;
import com.byb.backend.service.TrainerService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/trainers")
@RequiredArgsConstructor
@Tag(name = "Trainer", description = "Trainer management endpoints")
@SecurityRequirement(name = "bearerAuth")
public class TrainerController {

    private final TrainerService trainerService;
    private final TrainerRepository trainerRepository;
    private final CourseRepository courseRepository;
    private final GroupRepository groupRepository;
    private final ObjectMapper objectMapper;

    @GetMapping("/{trainerId}")
    @Operation(summary = "Get a trainer's public profile by ID")
    public ResponseEntity<Map<String, Object>> getTrainerById(@PathVariable String trainerId) {
        return trainerRepository.findById(trainerId).map(t -> {
            Map<String, Object> map = new java.util.LinkedHashMap<>();
            map.put("trainerId", t.getTrainerId());
            map.put("name", t.getName());
            map.put("profilePictureUrl", t.getProfilePictureUrl());
            map.put("specializations", t.getSpecializations());
            map.put("skills", t.getSkills());
            map.put("experienceYears", t.getExperienceYears());
            map.put("bio", t.getBio());
            map.put("isVerified", t.getIsVerified());
            map.put("averageRating", t.getAverageRating());
            map.put("linkedinUrl", t.getLinkedinUrl());
            map.put("portfolioUrl", t.getPortfolioUrl());
            long coursesCount = courseRepository.countByTrainerId(t.getTrainerId());
            map.put("coursesCount", coursesCount);
            return ResponseEntity.ok(map);
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping
    @Operation(summary = "Get all active trainers")
    public ResponseEntity<List<Map<String, Object>>> getAllTrainers() {
        List<Trainer> trainers = trainerRepository.findByIsActiveTrue();
        List<Map<String, Object>> result = trainers.stream().map(t -> {
            Map<String, Object> map = new java.util.LinkedHashMap<>();
            map.put("trainerId", t.getTrainerId());
            map.put("name", t.getName());
            map.put("email", t.getEmail());
            map.put("profilePictureUrl", t.getProfilePictureUrl());
            map.put("specializations", t.getSpecializations());
            map.put("skills", t.getSkills());
            map.put("experienceYears", t.getExperienceYears());
            map.put("bio", t.getBio());
            map.put("isVerified", t.getIsVerified());
            long coursesCount = courseRepository.countByTrainerId(t.getTrainerId());
            map.put("coursesCount", coursesCount);
            return map;
        }).collect(java.util.stream.Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/me")
    @Operation(summary = "Get current trainer profile (derives identity from JWT)")
    public ResponseEntity<TrainerProfileResponse> getMyProfile(Authentication authentication) {
        // JWT subject is the trainer's email; service resolves the row from it.
        // This avoids the 400-on-missing-trainerId-param the old signature caused.
        String email = authentication.getName();
        TrainerProfileResponse profile = trainerService.getProfileByEmail(email);
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me/profile/page1")
    @Operation(summary = "Update trainer profile - Page 1 (Contact Info)")
    public ResponseEntity<TrainerProfileResponse> updateProfilePage1(
            @RequestParam String trainerId,
            @Valid @RequestBody TrainerProfilePage1Request request) {
        TrainerProfileResponse profile = trainerService.updateProfilePage1(trainerId, request);
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me/profile/page2")
    @Operation(summary = "Update trainer profile - Page 2 (Professional Info)")
    public ResponseEntity<TrainerProfileResponse> updateProfilePage2(
            @RequestParam String trainerId,
            @Valid @RequestBody TrainerProfilePage2Request request) {
        TrainerProfileResponse profile = trainerService.updateProfilePage2(trainerId, request);
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me/profile/page3")
    @Operation(summary = "Update trainer profile - Page 3 (Bio & Photo)")
    public ResponseEntity<TrainerProfileResponse> updateProfilePage3(
            @RequestParam String trainerId,
            @Valid @RequestBody TrainerProfilePage3Request request) {
        TrainerProfileResponse profile = trainerService.updateProfilePage3(trainerId, request);
        return ResponseEntity.ok(profile);
    }

    /**
     * Trainer-controlled availability switch + capacity setting.
     *
     * Body shape (both fields optional, partial updates supported):
     *   { "isActive": true|false, "maxConcurrentGroups": 5 }
     *
     * Effects when isActive flips to false:
     *   - Admin can't form new groups for this trainer's courses
     *     (AdminGroupFormationService.formGroup rejects).
     *   - ML recommendation engine filters out all of the trainer's
     *     courses (recommendation_engine.py SQL join).
     *
     * Effects of changing maxConcurrentGroups:
     *   - Same ML filter — courses drop out once the trainer's count
     *     of active groups hits the new cap; come back as groups
     *     complete (CourseLifecycleService flips group isActive=false).
     */
    @PutMapping("/me/availability")
    @Operation(summary = "Trainer's own active/inactive toggle + concurrent-groups cap")
    public ResponseEntity<TrainerProfileResponse> updateAvailability(
            @RequestParam String trainerId,
            @RequestBody java.util.Map<String, Object> body) {
        TrainerProfileResponse profile = trainerService.updateAvailability(trainerId, body);
        return ResponseEntity.ok(profile);
    }

    /**
     * Earnings breakdown for a given year+month.
     *
     * Iterates every group the trainer runs, parses the JSON meeting
     * schedule, and collects each session that falls in the requested
     * month. Same-day multiple sessions on the same course dedupe to a
     * single day of pay — the admin sets a per-day rate, not per-session.
     * Response:
     *   {
     *     year, month, currency,
     *     total: <sum>,
     *     days: [ { date, courseId, courseTitle, amount }, ... ]
     *   }
     * If any course involved has no trainerDailyRevenue set, its sessions
     * are skipped. Currency assumes courses share a currency — takes the
     * first non-null one it sees.
     */
    @GetMapping("/{trainerId}/earnings")
    public ResponseEntity<Map<String, Object>> getEarnings(
            @PathVariable String trainerId,
            @RequestParam int year,
            @RequestParam int month
    ) {
        java.util.Set<String> seen = new java.util.HashSet<>();
        java.util.List<Map<String, Object>> days = new java.util.ArrayList<>();
        java.math.BigDecimal total = java.math.BigDecimal.ZERO;
        String currency = null;

        for (Group g : groupRepository.findByTrainerId(trainerId)) {
            String scheduleJson = g.getMeetingSchedule();
            if (scheduleJson == null || scheduleJson.isBlank()) continue;

            Map<String, Object> parsed;
            try {
                parsed = objectMapper.readValue(scheduleJson, new TypeReference<Map<String, Object>>() {});
            } catch (Exception e) { continue; }

            @SuppressWarnings("unchecked")
            java.util.List<Map<String, Object>> sessions =
                    (java.util.List<Map<String, Object>>) parsed.get("sessions");
            if (sessions == null || sessions.isEmpty()) continue;

            Course course = courseRepository.findByCourseId(g.getCourseId()).orElse(null);
            if (course == null || course.getTrainerDailyRevenue() == null) continue;
            if (currency == null && course.getCurrency() != null) currency = course.getCurrency();

            for (Map<String, Object> s : sessions) {
                Object dateRaw = s.get("date");
                if (dateRaw == null) continue;
                String date = String.valueOf(dateRaw);
                // Expect ISO YYYY-MM-DD
                java.time.LocalDate d;
                try { d = java.time.LocalDate.parse(date); }
                catch (Exception e) { continue; }
                if (d.getYear() != year || d.getMonthValue() != month) continue;

                String key = date + "|" + course.getCourseId();
                if (!seen.add(key)) continue;

                java.math.BigDecimal amount = course.getTrainerDailyRevenue();
                total = total.add(amount);

                Map<String, Object> entry = new java.util.LinkedHashMap<>();
                entry.put("date", date);
                entry.put("courseId", course.getCourseId());
                entry.put("courseTitle", course.getTitle());
                entry.put("amount", amount);
                days.add(entry);
            }
        }

        days.sort((a, b) -> String.valueOf(b.get("date")).compareTo(String.valueOf(a.get("date"))));

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("year", year);
        result.put("month", month);
        result.put("currency", currency == null ? "TND" : currency);
        result.put("total", total);
        result.put("days", days);
        return ResponseEntity.ok(result);
    }

    /**
     * Read the trainer's preferred display currency (ISO-4217). Used
     * by the mobile settings screen to render the current selection
     * and by the course-create form to pre-fill the default currency.
     */
    @GetMapping("/{trainerId}/currency")
    public ResponseEntity<Map<String, String>> getCurrency(@PathVariable String trainerId) {
        return trainerRepository.findById(trainerId).map(t -> {
            String value = t.getPreferredCurrency();
            if (value == null || value.isBlank()) value = "TND";
            return ResponseEntity.ok(Map.of("currency", value));
        }).orElse(ResponseEntity.notFound().build());
    }

    /**
     * Trainer sets their preferred currency. Accepts any code but
     * normalizes to upper-case; the mobile picker restricts to a
     * curated whitelist.
     */
    @PutMapping("/{trainerId}/currency")
    public ResponseEntity<Map<String, String>> setCurrency(
            @PathVariable String trainerId,
            @RequestBody Map<String, String> body
    ) {
        String currency = body == null ? null : body.get("currency");
        if (currency == null || currency.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return trainerRepository.findById(trainerId).map(t -> {
            String normalized = currency.trim().toUpperCase();
            t.setPreferredCurrency(normalized);
            trainerRepository.save(t);
            return ResponseEntity.ok(Map.of("currency", normalized));
        }).orElse(ResponseEntity.notFound().build());
    }
}