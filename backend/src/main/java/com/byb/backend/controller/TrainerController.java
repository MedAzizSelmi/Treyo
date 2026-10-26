package com.byb.backend.controller;

import com.byb.backend.dto.trainer.*;
import com.byb.backend.model.Course;
import com.byb.backend.model.Group;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.GroupRepository;
import com.byb.backend.repository.TrainerRepository;
import com.byb.backend.security.CallerGuard;
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
    private final CallerGuard callerGuard;

    @GetMapping("/{trainerId}")
    @Operation(summary = "Get a trainer's public profile by ID")
    public ResponseEntity<Map<String, Object>> getTrainerById(@PathVariable String trainerId) {
        return trainerRepository.findById(trainerId)
                // An applicant's page opens only once approved — except to
                // administrators, and to the trainer themselves.
                .filter(t -> "APPROVED".equalsIgnoreCase(t.getApprovalStatus())
                        || callerGuard.isAdmin() || t.getTrainerId().equals(callerGuard.current().getUserId()))
                .map(t -> {
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
            // Courses a learner can open, as the trainer's page lists — not
            // every course ever created, drafts and rejected ones included.
            long coursesCount = com.byb.backend.service.CourseService.openCourseCount(courseRepository, t.getTrainerId());
            map.put("coursesCount", coursesCount);
            return ResponseEntity.ok(map);
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping
    @Operation(summary = "Get all active trainers")
    public ResponseEntity<List<Map<String, Object>>> getAllTrainers() {
        // Public, even without signing in. Approved trainers only: pending and
        // rejected applicants were listed to learners, and in Top Trainers.
        List<Trainer> trainers = trainerRepository.findByIsActiveTrue().stream()
                .filter(t -> "APPROVED".equalsIgnoreCase(t.getApprovalStatus()))
                .toList();
        List<Map<String, Object>> result = trainers.stream().map(t -> {
            Map<String, Object> map = new java.util.LinkedHashMap<>();
            map.put("trainerId", t.getTrainerId());
            map.put("name", t.getName());
            // No email: this list is open to anyone, and no screen used it —
            // it only made every trainer's address easy to collect.
            map.put("profilePictureUrl", t.getProfilePictureUrl());
            map.put("specializations", t.getSpecializations());
            map.put("skills", t.getSkills());
            map.put("experienceYears", t.getExperienceYears());
            map.put("bio", t.getBio());
            map.put("isVerified", t.getIsVerified());
            // Courses a learner can open, as the trainer's page lists — not
            // every course ever created, drafts and rejected ones included.
            long coursesCount = com.byb.backend.service.CourseService.openCourseCount(courseRepository, t.getTrainerId());
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
            @RequestParam(required = false) String trainerId,
            @Valid @RequestBody TrainerProfilePage1Request request) {
        // The path says /me but the id came from the query string,
        // so any account could edit any trainer. The token decides.
        trainerId = callerGuard.self(trainerId);
        TrainerProfileResponse profile = trainerService.updateProfilePage1(trainerId, request);
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me/profile/page2")
    @Operation(summary = "Update trainer profile - Page 2 (Professional Info)")
    public ResponseEntity<TrainerProfileResponse> updateProfilePage2(
            @RequestParam(required = false) String trainerId,
            @Valid @RequestBody TrainerProfilePage2Request request) {
        trainerId = callerGuard.self(trainerId);
        TrainerProfileResponse profile = trainerService.updateProfilePage2(trainerId, request);
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me/profile/page3")
    @Operation(summary = "Update trainer profile - Page 3 (Bio & Photo)")
    public ResponseEntity<TrainerProfileResponse> updateProfilePage3(
            @RequestParam(required = false) String trainerId,
            @Valid @RequestBody TrainerProfilePage3Request request) {
        trainerId = callerGuard.self(trainerId);
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
            @RequestParam(required = false) String trainerId,
            @RequestBody java.util.Map<String, Object> body) {
        trainerId = callerGuard.self(trainerId);
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
     * Only sessions that have already started count: a schedule laid out
     * for the rest of the month is not money earned yet. They used to all
     * count, so a rate set mid-month paid the trainer for classes not yet
     * given.
     *
     * A course with no trainerDailyRevenue cannot be paid, and its
     * sessions used to be skipped without a word — a trainer who had
     * taught came out at 0 with nothing saying why. They are now counted
     * in unratedSessions so the app can say the rate is missing. Currency
     * assumes courses share a currency — takes the first non-null one.
     */
    @GetMapping("/{trainerId}/earnings")
    public ResponseEntity<Map<String, Object>> getEarnings(
            @PathVariable String trainerId,
            @RequestParam int year,
            @RequestParam int month
    ) {
        // Earnings are the trainer's own business, and an administrator's.
        callerGuard.selfOrAdmin(trainerId);
        java.util.Set<String> seen = new java.util.HashSet<>();
        java.util.List<Map<String, Object>> days = new java.util.ArrayList<>();
        java.math.BigDecimal total = java.math.BigDecimal.ZERO;
        String currency = null;
        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        java.util.Set<String> unrated = new java.util.HashSet<>();

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
            if (course == null) continue;
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

                // Not held yet: not earned yet.
                java.time.LocalTime startTime;
                try {
                    String tm = String.valueOf(s.get("time"));
                    startTime = java.time.LocalTime.parse(tm.length() == 5 ? tm + ":00" : tm);
                } catch (Exception e) { startTime = java.time.LocalTime.MIDNIGHT; }
                if (d.atTime(startTime).isAfter(now)) continue;

                String key = date + "|" + course.getCourseId();
                if (course.getTrainerDailyRevenue() == null) {
                    unrated.add(key);
                    continue;
                }
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
        // Days taught on a course the admin has not given a rate to.
        result.put("unratedSessions", unrated.size());
        return ResponseEntity.ok(result);
    }

    // The trainer's "preferred currency" endpoints were removed in October
    // 2026 with the app screen that used them. The setting no longer set
    // anything — the admin prices courses, and earnings are shown in the
    // courses' own currency — so all it did was relabel one figure on the
    // trainer's home screen without converting it. Trainer.preferredCurrency
    // is left in the table, unused.
}