package com.byb.backend.service;

import com.byb.backend.model.Admin;
import com.byb.backend.model.Course;
import com.byb.backend.model.Notification;
import com.byb.backend.model.Student;
import com.byb.backend.model.Trainer;
import com.byb.backend.model.TrainerReport;
import com.byb.backend.repository.AdminRepository;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.NotificationRepository;
import com.byb.backend.repository.StudentRepository;
import com.byb.backend.repository.TrainerReportRepository;
import com.byb.backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Student-raised reports against trainers, and the admin moderation
 * queue that consumes them.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TrainerReportService {

    /** Categories the mobile picker offers. Anything else is rejected. */
    private static final Set<String> VALID_REASONS = Set.of(
            "INAPPROPRIATE_BEHAVIOUR", "MISLEADING_CONTENT", "NO_SHOW",
            "HARASSMENT", "SPAM", "OTHER"
    );

    private static final Set<String> VALID_STATUSES = Set.of("OPEN", "REVIEWED", "DISMISSED");

    private final TrainerReportRepository reportRepository;
    private final TrainerRepository trainerRepository;
    private final StudentRepository studentRepository;
    private final CourseRepository courseRepository;
    private final AdminRepository adminRepository;
    private final NotificationRepository notificationRepository;

    /**
     * Student submits a report. Validates the target exists and the
     * reason is one we recognise, and blocks a second OPEN report from
     * the same student about the same trainer so the queue can't be
     * flooded from one screen.
     */
    @Transactional
    public TrainerReport submit(String studentId, String trainerId, String reason,
                                String details, String courseId) {
        if (studentId == null || studentId.isBlank()) {
            throw new IllegalArgumentException("studentId is required.");
        }
        if (trainerId == null || trainerId.isBlank()) {
            throw new IllegalArgumentException("trainerId is required.");
        }
        String normalizedReason = reason == null ? "" : reason.trim().toUpperCase();
        if (!VALID_REASONS.contains(normalizedReason)) {
            throw new IllegalArgumentException("Unknown report reason: " + reason);
        }
        if (!trainerRepository.existsById(trainerId)) {
            throw new IllegalArgumentException("Trainer not found: " + trainerId);
        }
        if (reportRepository.countOpenByStudentAndTrainer(studentId, trainerId) > 0) {
            throw new IllegalStateException(
                    "You already have a report about this trainer awaiting review.");
        }

        TrainerReport report = new TrainerReport();
        report.setReportId("RPT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        report.setStudentId(studentId);
        report.setTrainerId(trainerId);
        report.setReason(normalizedReason);
        report.setDetails(details == null || details.isBlank() ? null : details.trim());
        report.setCourseId(courseId == null || courseId.isBlank() ? null : courseId);
        report.setStatus("OPEN");
        reportRepository.save(report);

        notifyAdmins(report);
        return report;
    }

    /**
     * Drop a notification into every admin's in-app centre. Best-effort:
     * a failure here must never roll back the report itself, which is
     * the thing the student actually cares about.
     */
    private void notifyAdmins(TrainerReport report) {
        try {
            String trainerName = trainerRepository.findById(report.getTrainerId())
                    .map(Trainer::getName).orElse("a trainer");
            List<Admin> admins = adminRepository.findAll();
            for (Admin admin : admins) {
                Notification n = new Notification();
                n.setNotificationId("NOT_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
                n.setUserId(admin.getAdminId());
                n.setUserType("admin");
                n.setNotificationType("TRAINER_REPORTED");
                n.setTitle("New trainer report");
                n.setMessage("A student reported " + trainerName + " (" + humanReason(report.getReason()) + ").");
                n.setPriority("high");
                n.setCreatedAt(LocalDateTime.now());
                notificationRepository.save(n);
            }
        } catch (Exception e) {
            log.warn("Could not notify admins about report {}: {}", report.getReportId(), e.getMessage());
        }
    }

    /** Admin queue, newest first, enriched with reporter/trainer names. */
    public List<Map<String, Object>> getAllForAdmin(String status) {
        List<TrainerReport> reports = (status == null || status.isBlank() || "ALL".equalsIgnoreCase(status))
                ? reportRepository.findAllByOrderByCreatedAtDesc()
                : reportRepository.findByStatusOrderByCreatedAtDesc(status.trim().toUpperCase());

        return reports.stream().map(this::enrich).collect(Collectors.toList());
    }

    private Map<String, Object> enrich(TrainerReport r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("reportId", r.getReportId());
        m.put("reason", r.getReason());
        m.put("reasonLabel", humanReason(r.getReason()));
        m.put("details", r.getDetails());
        m.put("status", r.getStatus());
        m.put("adminNote", r.getAdminNote());
        m.put("createdAt", r.getCreatedAt());
        m.put("resolvedAt", r.getResolvedAt());

        m.put("trainerId", r.getTrainerId());
        Trainer t = trainerRepository.findById(r.getTrainerId()).orElse(null);
        m.put("trainerName", t != null ? t.getName() : "Unknown trainer");
        m.put("trainerEmail", t != null ? t.getEmail() : null);

        m.put("studentId", r.getStudentId());
        Student s = studentRepository.findById(r.getStudentId()).orElse(null);
        m.put("studentName", s != null ? s.getName() : "Unknown student");
        m.put("studentEmail", s != null ? s.getEmail() : null);

        m.put("courseId", r.getCourseId());
        if (r.getCourseId() != null) {
            m.put("courseTitle", courseRepository.findByCourseId(r.getCourseId())
                    .map(Course::getTitle).orElse(null));
        } else {
            m.put("courseTitle", null);
        }

        // How many other reports this trainer has accumulated — lets the
        // admin spot a repeat offender without leaving the row.
        m.put("trainerReportCount", reportRepository.findByTrainerIdOrderByCreatedAtDesc(r.getTrainerId()).size());
        return m;
    }

    /** Admin moves a report to REVIEWED or DISMISSED, with an optional note. */
    @Transactional
    public void updateStatus(String reportId, String status, String adminNote) {
        String normalized = status == null ? "" : status.trim().toUpperCase();
        if (!VALID_STATUSES.contains(normalized)) {
            throw new IllegalArgumentException("Unknown report status: " + status);
        }
        TrainerReport r = reportRepository.findById(reportId)
                .orElseThrow(() -> new IllegalArgumentException("Report not found: " + reportId));

        r.setStatus(normalized);
        r.setAdminNote(adminNote == null || adminNote.isBlank() ? null : adminNote.trim());
        r.setResolvedAt("OPEN".equals(normalized) ? null : LocalDateTime.now());
        reportRepository.save(r);
    }

    public long countOpen() {
        return reportRepository.countByStatus("OPEN");
    }

    private String humanReason(String reason) {
        if (reason == null) return "Other";
        return switch (reason) {
            case "INAPPROPRIATE_BEHAVIOUR" -> "Inappropriate behaviour";
            case "MISLEADING_CONTENT" -> "Misleading content";
            case "NO_SHOW" -> "Did not show up";
            case "HARASSMENT" -> "Harassment";
            case "SPAM" -> "Spam";
            default -> "Other";
        };
    }
}
