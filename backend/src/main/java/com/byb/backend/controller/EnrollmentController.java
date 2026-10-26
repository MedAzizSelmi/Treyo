package com.byb.backend.controller;

import com.byb.backend.model.Course;
import com.byb.backend.model.Enrollment;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.EnrollmentRepository;
import com.byb.backend.repository.StudentRepository;
import com.byb.backend.repository.TrainerRepository;
import com.byb.backend.security.AuthenticatedUser;
import com.byb.backend.security.CallerGuard;
import com.byb.backend.service.EnrollmentService;
import com.byb.backend.service.FileAccessService;
import com.byb.backend.service.GroupReportService;
import com.byb.backend.service.ReceiptDeliveryService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/enrollments")
@RequiredArgsConstructor
@Tag(name = "Enrollments", description = "Student enrollment management")
@SecurityRequirement(name = "bearerAuth")
public class EnrollmentController {

    private final EnrollmentService enrollmentService;
    private final ReceiptDeliveryService receiptDeliveryService;
    private final FileAccessService fileAccessService;
    private final EnrollmentRepository enrollmentRepository;
    private final StudentRepository studentRepository;
    private final CourseRepository courseRepository;
    private final TrainerRepository trainerRepository;
    private final ObjectMapper objectMapper;
    private final CallerGuard callerGuard;
    private final GroupReportService groupReportService;

    @GetMapping("/course/{courseId}")
    @Operation(summary = "Get all enrollments for a course (trainer view)")
    public ResponseEntity<List<Map<String, Object>>> getCourseEnrollments(@PathVariable String courseId) {
        // A course's roster is the trainer's and the administrators' to
        // see — not other learners', and not other trainers'.
        Course course = courseRepository.findByCourseId(courseId).orElse(null);
        if (course == null) return ResponseEntity.notFound().build();
        callerGuard.requireOwnerOrAdmin(course.getTrainerId());
        List<Enrollment> enrollments = enrollmentRepository.findByCourseId(courseId);
        List<Map<String, Object>> result = enrollments.stream().map(e -> {
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("enrollmentId", e.getEnrollmentId());
            m.put("studentId", e.getStudentId());
            m.put("courseId", e.getCourseId());
            m.put("groupId", e.getGroupId());
            m.put("enrollmentStatus", e.getEnrollmentStatus());
            m.put("progressPercentage", e.getProgressPercentage());
            m.put("sessionsAttended", e.getSessionsAttended());
            m.put("enrolledAt", e.getEnrolledAt());
            // Enrich with student name
            studentRepository.findByStudentId(e.getStudentId()).ifPresent(s -> {
                m.put("studentName", s.getName());
                m.put("studentProfilePicture", s.getProfilePictureUrl());
            });
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @PostMapping("/confirm")
    @Operation(summary = "Student confirms enrollment (requires successful Konnect payment for paid courses)")
    public ResponseEntity<Enrollment> confirmEnrollment(
            @RequestParam(required = false) String studentId,
            @RequestParam String courseId,
            @RequestParam(required = false) String groupId,
            // For paid courses this MUST be a Konnect paymentRef returned
            // by POST /api/payments/enrollment-payment and completed via
            // the user's redirect flow. Optional for free courses.
            @RequestParam(required = false) String paymentRef) {
        // A learner enrolls themselves. isPaidFor already stops a payment
        // being reused, but nothing stopped enrolling someone else.
        studentId = callerGuard.self(studentId);
        Enrollment enrollment = enrollmentService.confirmEnrollment(
                studentId, courseId, groupId, paymentRef);
        return ResponseEntity.ok(enrollment);
    }

    @GetMapping("/student/{studentId}")
    @Operation(summary = "Get all enrollments for student")
    public ResponseEntity<List<Map<String, Object>>> getStudentEnrollments(@PathVariable String studentId) {
        callerGuard.selfOrAdmin(studentId);
        List<Enrollment> enrollments = enrollmentService.getStudentEnrollments(studentId);
        return ResponseEntity.ok(withCourseDetails(enrollments));
    }

    @GetMapping("/student/{studentId}/active")
    @Operation(summary = "Get active enrollments for student")
    public ResponseEntity<List<Map<String, Object>>> getActiveEnrollments(@PathVariable String studentId) {
        callerGuard.selfOrAdmin(studentId);
        List<Enrollment> enrollments = enrollmentService.getActiveEnrollments(studentId);
        return ResponseEntity.ok(withCourseDetails(enrollments));
    }

    /**
     * An enrollment only stores the course's id, so the learner's screens
     * had nothing to display but a generic "Course". Each enrollment is
     * serialized exactly as before, then given the course title and the
     * trainer's name. Courses and trainers are loaded in one batch each,
     * not once per enrollment.
     */
    private List<Map<String, Object>> withCourseDetails(List<Enrollment> enrollments) {
        Map<String, Course> courses = new java.util.HashMap<>();
        courseRepository.findAllById(enrollments.stream().map(Enrollment::getCourseId)
                        .filter(java.util.Objects::nonNull).collect(Collectors.toSet()))
                .forEach(c -> courses.put(c.getCourseId(), c));
        // HashMap rather than Collectors.toMap, which throws on a null name.
        Map<String, String> trainerNames = new java.util.HashMap<>();
        trainerRepository.findAllById(courses.values().stream().map(Course::getTrainerId)
                        .filter(java.util.Objects::nonNull).collect(Collectors.toSet()))
                .forEach(t -> trainerNames.put(t.getTrainerId(), t.getName()));
        // Which of them the trainer's report marked completed: those have an attestation.
        java.util.Set<String> attested = groupReportService.withAttestation(
                enrollments.stream().map(Enrollment::getEnrollmentId).collect(Collectors.toSet()));

        return enrollments.stream().map(e -> {
            Map<String, Object> m = objectMapper.convertValue(e, new TypeReference<Map<String, Object>>() {});
            m.put("hasAttestation", attested.contains(e.getEnrollmentId()));
            Course course = courses.get(e.getCourseId());
            if (course != null) {
                m.put("courseTitle", course.getTitle());
                m.put("trainerName", trainerNames.get(course.getTrainerId()));
                // The payment history shows what was actually paid
                // (amountPaid, already on the enrollment); the course price
                // is the fallback for rows that predate the gateway, and the
                // currency stops the client inventing one.
                m.put("coursePrice", course.getPrice());
                m.put("courseCurrency", course.getCurrency());
            }
            return m;
        }).collect(Collectors.toList());
    }

    @PutMapping("/{enrollmentId}/start")
    @Operation(summary = "Start an enrollment (mark as active)")
    public ResponseEntity<Enrollment> startEnrollment(@PathVariable String enrollmentId) {
        // No client calls this or /complete — group formation and
        // CourseLifecycleService move enrollments along. Left reachable
        // by any account, they let a learner mark themselves completed,
        // which is what unlocks the review. Administrators only.
        callerGuard.requireAdmin();
        Enrollment enrollment = enrollmentService.startEnrollment(enrollmentId);
        return ResponseEntity.ok(enrollment);
    }

    @PutMapping("/{enrollmentId}/complete")
    @Operation(summary = "Complete an enrollment")
    public ResponseEntity<Enrollment> completeEnrollment(@PathVariable String enrollmentId) {
        callerGuard.requireAdmin();
        Enrollment enrollment = enrollmentService.completeEnrollment(enrollmentId);
        return ResponseEntity.ok(enrollment);
    }

    /**
     * Download the receipt for a paid enrolment.
     *
     * Rendered on demand rather than stored: everything it contains is
     * already in the database, so a file on disk would be a second copy
     * to back up, serve and eventually lose.
     *
     * Readable by the learner it belongs to, and by an administrator —
     * who needs it to answer a dispute.
     */
    @GetMapping("/{enrollmentId}/receipt")
    @Operation(summary = "Download the PDF receipt for a paid enrollment")
    public ResponseEntity<?> downloadReceipt(@PathVariable String enrollmentId) {
        AuthenticatedUser caller = fileAccessService.caller().orElse(null);
        if (caller == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Not signed in"));
        }
        Enrollment enrollment = enrollmentRepository.findById(enrollmentId).orElse(null);
        if (enrollment == null
                || (!caller.isAdmin() && !caller.getUserId().equals(enrollment.getStudentId()))) {
            // Same answer for "not yours" and "does not exist", so the
            // response cannot be used to probe for enrolment ids.
            return ResponseEntity.status(404).body(Map.of("error", "No receipt for that enrollment"));
        }

        byte[] pdf = receiptDeliveryService.render(enrollment);
        if (pdf == null) {
            return ResponseEntity.status(404).body(Map.of(
                    "error", "No receipt",
                    "message", "This enrollment has no payment to receipt."));
        }

        String filename = receiptDeliveryService.filenameFor(enrollment);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

    /**
     * Download the attestation de participation, once the trainer's report
     * marked this learner as having completed the course.
     *
     * Rendered on demand like the receipt. Readable by the learner it
     * belongs to and by an administrator; the same 404 for "not yours" and
     * "none", so it cannot be used to probe for enrolments.
     */
    @GetMapping("/{enrollmentId}/attestation")
    @Operation(summary = "Download the attestation de participation for a completed enrollment")
    public ResponseEntity<?> downloadAttestation(@PathVariable String enrollmentId) {
        AuthenticatedUser caller = fileAccessService.caller().orElse(null);
        if (caller == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Not signed in"));
        }
        Enrollment enrollment = enrollmentRepository.findById(enrollmentId).orElse(null);
        if (enrollment == null
                || (!caller.isAdmin() && !caller.getUserId().equals(enrollment.getStudentId()))) {
            return ResponseEntity.status(404).body(Map.of("error", "No attestation for that enrollment"));
        }
        GroupReportService.Attestation a = groupReportService.attestation(enrollmentId).orElse(null);
        if (a == null) {
            return ResponseEntity.status(404).body(Map.of("error", "No attestation",
                    "message", "The attestation is issued once the trainer's report marks the course completed."));
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, org.springframework.http.ContentDisposition.attachment()
                        .filename(a.filename(), java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .contentType(MediaType.APPLICATION_PDF)
                .body(a.pdf());
    }

}