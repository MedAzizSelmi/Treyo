package com.byb.backend.service;

import com.byb.backend.model.*;
import com.byb.backend.repository.*;
import com.byb.backend.security.AuthenticatedUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The end-of-course report: the trainer of a finished group sends it once,
 * answering for every learner; those marked COMPLETED get an attestation;
 * sessions marked not held are not paid; late reports are chased.
 *
 * A group with three sessions in January 2025 — long over, and far from
 * any real group's dates — and two learners. Rolled back.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@RecordApplicationEvents
class GroupReportTest {

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private GroupReportService reportService;
    @Autowired private CourseRepository courseRepository;
    @Autowired private StudentRepository studentRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private EnrollmentRepository enrollmentRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private AdminRepository adminRepository;
    @Autowired private ApplicationEvents events;

    @MockBean private EmailService emailService;
    @MockBean private PushNotificationService pushNotificationService;
    @MockBean private MLRecommendationService mlRecommendationService;

    private Course course;
    private Group group;
    private Enrollment done, partly;

    private static RequestPostProcessor as(String id, String role) {
        return authentication(new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(id + "@example.test", id, role), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    @BeforeEach
    void setUp() {
        course = courseRepository.findAll().stream().filter(c -> c.getTrainerId() != null).findFirst().orElse(null);
        assumeTrue(course != null, "needs a course with a trainer");
        course.setTrainerDailyRevenue(new BigDecimal("100.00"));
        course.setTitle("Python pour l'analyse de données");
        courseRepository.saveAndFlush(course);
        Set<String> enrolled = enrollmentRepository.findByCourseId(course.getCourseId()).stream()
                .map(Enrollment::getStudentId).collect(Collectors.toSet());
        List<Student> free = studentRepository.findAll().stream()
                .filter(s -> !enrolled.contains(s.getStudentId())).limit(2).toList();
        assumeTrue(free.size() == 2, "needs two learners not enrolled in that course");

        group = new Group();
        group.setGroupId("GRP_REPORT_" + UUID.randomUUID().toString().substring(0, 6));
        group.setCourseId(course.getCourseId());
        group.setTrainerId(course.getTrainerId());
        group.setGroupName("Report test");
        group.setGroupStatus("active");
        group.setIsActive(true);
        group.setScheduleApprovedAt(LocalDateTime.of(2024, 12, 20, 9, 0));
        group.setMeetingSchedule("{\"sessions\":["
                + "{\"date\":\"2025-01-06\",\"time\":\"10:00\",\"hours\":2},"
                + "{\"date\":\"2025-01-07\",\"time\":\"10:00\",\"hours\":2},"
                + "{\"date\":\"2025-01-08\",\"time\":\"10:00\",\"hours\":2}]}");
        group = groupRepository.saveAndFlush(group);

        done = enroll(free.get(0));
        partly = enroll(free.get(1));
    }

    private Enrollment enroll(Student s) {
        Enrollment e = new Enrollment();
        e.setEnrollmentId("ENR_REPORT_" + UUID.randomUUID().toString().substring(0, 6));
        e.setStudentId(s.getStudentId());
        e.setCourseId(course.getCourseId());
        e.setGroupId(group.getGroupId());
        e.setEnrollmentStatus("active");
        e.setPaymentStatus("paid");
        e.setEnrolledAt(LocalDateTime.of(2024, 12, 22, 9, 0));
        return enrollmentRepository.saveAndFlush(e);
    }

    /** A valid report: one learner completed, one partly; the 7th was not held. */
    private Map<String, Object> report() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("learners", List.of(
                Map.of("enrollmentId", done.getEnrollmentId(), "sessionsAttended", 2, "result", "COMPLETED",
                        "note", "Very involved"),
                Map.of("enrollmentId", partly.getEnrollmentId(), "sessionsAttended", 1, "result", "PARTIAL")));
        body.put("allSessionsHeld", false);
        body.put("sessionsNotHeld", List.of(Map.of("date", "2025-01-07", "time", "10:00", "reason", "Room unavailable")));
        body.put("planCoverage", "MOST");
        body.put("planLeftOut", "The last chapter, for lack of time.");
        body.put("levelFit", "RIGHT");
        body.put("prerequisites", "SOME_LACKED");
        body.put("comments", "The projector needs replacing.");
        body.put("confirmed", true);
        return body;
    }

    private org.springframework.test.web.servlet.ResultActions send(Map<String, Object> body, String asId) throws Exception {
        return mvc.perform(post("/api/group-reports/group/" + group.getGroupId())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body))
                .with(as(asId, "TRAINER")));
    }

    @Test
    void theFormListsTheGroupsSessionsAndLearnersOnceItIsOver() throws Exception {
        mvc.perform(get("/api/group-reports/group/" + group.getGroupId()).with(as(course.getTrainerId(), "TRAINER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.completed").value(true))
                .andExpect(jsonPath("$.canSubmit").value(true))
                .andExpect(jsonPath("$.sessions.length()").value(3))
                .andExpect(jsonPath("$.learners.length()").value(2));
        // Another trainer, or a learner, cannot read it.
        mvc.perform(get("/api/group-reports/group/" + group.getGroupId()).with(as("TRN_SOMEONE_ELSE", "TRAINER")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/group-reports/group/" + group.getGroupId()).with(as(done.getStudentId(), "STUDENT")))
                .andExpect(status().isForbidden());
    }

    @Test
    void itIsSentOnceAndDecidesTheAttestations() throws Exception {
        send(report(), course.getTrainerId()).andExpect(status().isOk());
        send(report(), course.getTrainerId()).andExpect(status().isConflict());

        assertTrue(events.stream(GroupReportService.ReportSubmitted.class).findAny().isPresent(),
                "attestations go out once the report is committed");
        assertEquals(2, enrollmentRepository.findById(done.getEnrollmentId()).orElseThrow().getSessionsAttended());

        // The learner who completed downloads it; the other has none, and nobody else sees either.
        mvc.perform(get("/api/enrollments/" + done.getEnrollmentId() + "/attestation").with(as(done.getStudentId(), "STUDENT")))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
                        .contentType(MediaType.APPLICATION_PDF));
        mvc.perform(get("/api/enrollments/" + partly.getEnrollmentId() + "/attestation").with(as(partly.getStudentId(), "STUDENT")))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/enrollments/" + done.getEnrollmentId() + "/attestation").with(as(partly.getStudentId(), "STUDENT")))
                .andExpect(status().isNotFound());
        assertEquals(Set.of(done.getEnrollmentId()),
                reportService.withAttestation(List.of(done.getEnrollmentId(), partly.getEnrollmentId())));
        // The congratulations and the email run after the commit, which this
        // rolled-back test never reaches; the event above is what starts them.
    }

    @Test
    void whatTheFormDoesNotAllowIsRefused() throws Exception {
        Map<String, Object> missingLearner = report();
        missingLearner.put("learners", List.of(Map.of("enrollmentId", done.getEnrollmentId(),
                "sessionsAttended", 2, "result", "COMPLETED")));
        send(missingLearner, course.getTrainerId()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Every learner in the group needs an answer."));

        Map<String, Object> completedWithoutAttending = report();
        completedWithoutAttending.put("learners", List.of(
                Map.of("enrollmentId", done.getEnrollmentId(), "sessionsAttended", 0, "result", "COMPLETED"),
                Map.of("enrollmentId", partly.getEnrollmentId(), "sessionsAttended", 1, "result", "PARTIAL")));
        send(completedWithoutAttending, course.getTrainerId()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        "Completed needs at least 2 of the 2 sessions held (80%): that is what earns the attestation."));

        // One session not held leaves two: nobody attended three.
        Map<String, Object> moreThanHeld = report();
        moreThanHeld.put("learners", List.of(
                Map.of("enrollmentId", done.getEnrollmentId(), "sessionsAttended", 3, "result", "COMPLETED"),
                Map.of("enrollmentId", partly.getEnrollmentId(), "sessionsAttended", 1, "result", "PARTIAL")));
        send(moreThanHeld, course.getTrainerId()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Sessions attended must be between 0 and 2, the sessions held."));

        Map<String, Object> unknownSession = report();
        unknownSession.put("sessionsNotHeld", List.of(Map.of("date", "2025-01-09", "time", "10:00", "reason", "?")));
        send(unknownSession, course.getTrainerId()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("A session marked as not held is not in the group's schedule."));

        Map<String, Object> leftOutUnsaid = report();
        leftOutUnsaid.remove("planLeftOut");
        send(leftOutUnsaid, course.getTrainerId()).andExpect(status().isBadRequest());

        Map<String, Object> unconfirmed = report();
        unconfirmed.put("confirmed", false);
        send(unconfirmed, course.getTrainerId()).andExpect(status().isBadRequest());

        send(report(), "TRN_SOMEONE_ELSE").andExpect(status().isForbidden());
    }

    @Test
    void anAttestationNeedsEightyPercentOfTheSessionsHeld() throws Exception {
        // All three held: two attended is 67%, not enough to complete.
        Map<String, Object> twoOfThree = report();
        twoOfThree.put("allSessionsHeld", true);
        twoOfThree.remove("sessionsNotHeld");
        twoOfThree.put("learners", List.of(
                Map.of("enrollmentId", done.getEnrollmentId(), "sessionsAttended", 2, "result", "COMPLETED"),
                Map.of("enrollmentId", partly.getEnrollmentId(), "sessionsAttended", 1, "result", "PARTIAL")));
        send(twoOfThree, course.getTrainerId()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        "Completed needs at least 3 of the 3 sessions held (80%): that is what earns the attestation."));

        // Two of three is still a valid report when it says Partly completed — and earns nothing.
        twoOfThree.put("learners", List.of(
                Map.of("enrollmentId", done.getEnrollmentId(), "sessionsAttended", 2, "result", "PARTIAL"),
                Map.of("enrollmentId", partly.getEnrollmentId(), "sessionsAttended", 3, "result", "COMPLETED")));
        send(twoOfThree, course.getTrainerId()).andExpect(status().isOk());
        assertEquals(Set.of(partly.getEnrollmentId()),
                reportService.withAttestation(List.of(done.getEnrollmentId(), partly.getEnrollmentId())));
    }

    @Test
    void eightyPercentIsRoundedUp() {
        assertEquals(8, GroupReportService.sessionsNeededToComplete(10));
        assertEquals(8, GroupReportService.sessionsNeededToComplete(9));   // 7.2
        assertEquals(7, GroupReportService.sessionsNeededToComplete(8));   // 6.4
        assertEquals(4, GroupReportService.sessionsNeededToComplete(5));
        assertEquals(3, GroupReportService.sessionsNeededToComplete(3));   // 2.4
        assertEquals(1, GroupReportService.sessionsNeededToComplete(1));
    }

    @Test
    void aSessionNotHeldIsNotPaid() throws Exception {
        String trainerId = course.getTrainerId();
        assertTrue(paidDays(trainerId).containsAll(Set.of("2025-01-06", "2025-01-07", "2025-01-08")));
        send(report(), trainerId).andExpect(status().isOk());
        Set<String> paid = paidDays(trainerId);
        assertTrue(paid.containsAll(Set.of("2025-01-06", "2025-01-08")));
        assertFalse(paid.contains("2025-01-07"), "the report said the 7th was not held");
    }

    @SuppressWarnings("unchecked")
    private Set<String> paidDays(String trainerId) throws Exception {
        String body = mvc.perform(get("/api/trainers/" + trainerId + "/earnings")
                        .param("year", "2025").param("month", "1").with(as(trainerId, "TRAINER")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<Map<String, Object>> days = (List<Map<String, Object>>) objectMapper.readValue(body, Map.class).get("days");
        return days.stream().filter(d -> course.getCourseId().equals(d.get("courseId")))
                .map(d -> String.valueOf(d.get("date"))).collect(Collectors.toSet());
    }

    @Test
    void anAskedReportWaitsOnTheTrainersHomeUntilSent() throws Exception {
        String trainerId = course.getTrainerId();
        reportService.view(group.getGroupId(), trainerId, false); // the group completes
        reportService.requestReport(group.getGroupId());
        assertTrue(sent(trainerId, GroupReportService.REPORT_REQUEST));
        mvc.perform(get("/api/group-reports/mine/pending").with(as(trainerId, "TRAINER")))
                .andExpect(jsonPath("$[?(@.groupId == '" + group.getGroupId() + "')]").exists());
        send(report(), trainerId).andExpect(status().isOk());
        mvc.perform(get("/api/group-reports/mine/pending").with(as(trainerId, "TRAINER")))
                .andExpect(jsonPath("$[?(@.groupId == '" + group.getGroupId() + "')]").doesNotExist());
    }

    @Test
    void aLateReportIsChasedAndThenReportedToAdmins() {
        String trainerId = course.getTrainerId();
        reportService.view(group.getGroupId(), trainerId, false); // the group completes
        LocalDateTime asked = LocalDateTime.now().minusDays(6);

        reportService.remind(group.getGroupId(), trainerId, asked, asked.plusDays(1));
        assertFalse(sent(trainerId, GroupReportService.REPORT_REMINDER), "not after one day");

        reportService.remind(group.getGroupId(), trainerId, asked, asked.plusDays(2));
        assertTrue(sent(trainerId, GroupReportService.REPORT_REMINDER));

        String adminId = adminRepository.findAll().stream().map(Admin::getAdminId).findFirst().orElse(null);
        assumeTrue(adminId != null, "needs an admin");
        reportService.remind(group.getGroupId(), trainerId, asked, asked.plusDays(5));
        assertTrue(sent(adminId, GroupReportService.REPORT_OVERDUE));
    }

    private boolean sent(String userId, String type) {
        return notificationRepository.existsByUserIdAndNotificationTypeAndRelatedEntityId(userId, type, group.getGroupId());
    }

    @Test
    void anAdministratorReadsTheReportWithTheLearnersContacts() throws Exception {
        send(report(), course.getTrainerId()).andExpect(status().isOk());
        mvc.perform(get("/api/group-reports/group/" + group.getGroupId()).with(as("ADM_REPORT_TEST", "ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.report.planCoverage").value("MOST"))
                .andExpect(jsonPath("$.report.sessionsNotHeld[0].date").value("2025-01-07"))
                .andExpect(jsonPath("$.learners[?(@.enrollmentId == '" + done.getEnrollmentId() + "')].result").value("COMPLETED"))
                .andExpect(jsonPath("$.learners[0].email").exists());
    }
}
