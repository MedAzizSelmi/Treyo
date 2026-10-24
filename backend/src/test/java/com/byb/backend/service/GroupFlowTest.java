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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The automated group flow, end to end (GroupAutomationService):
 * requests open a group, the trainer schedules, an administrator
 * approves, learners are invited, paying joins, the minimum starts it,
 * and the deadlines call, start or close.
 *
 * Runs against the development database in a rolled-back transaction. It
 * borrows a real course, its trainer and learners with no stake in that
 * course, and adjusts them only inside the transaction. Email, push and the
 * recommendation service are mocked: no administrator or phone receives
 * anything. The course is made free so joining needs no payment gateway.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class GroupFlowTest {

    @Autowired private GroupAutomationService automation;
    @Autowired private EnrollmentService enrollmentService;
    @Autowired private PaymentService paymentService;
    @Autowired private CourseRepository courseRepository;
    @Autowired private TrainerRepository trainerRepository;
    @Autowired private StudentRepository studentRepository;
    @Autowired private AdminRepository adminRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private InteractionRepository interactionRepository;
    @Autowired private EnrollmentRepository enrollmentRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;

    @MockBean private EmailService emailService;
    @MockBean private PushNotificationService pushNotificationService;
    @MockBean private MLRecommendationService mlRecommendationService;

    private Course course;
    private Trainer trainer;
    private List<Student> learners;
    private LocalDateTime now;

    @BeforeEach
    void setUp() {
        now = LocalDateTime.now();
        course = courseRepository.findAll().stream()
                .filter(c -> c.getTrainerId() != null && trainerRepository.findByTrainerId(c.getTrainerId()).isPresent())
                .findFirst().orElse(null);
        assumeTrue(course != null, "needs a course with a trainer in the development database");

        course.setApprovalStatus("APPROVED");
        course.setIsActive(true);
        course.setIsPublished(true);
        course.setMinStudentsRequired(2);
        course.setMaxStudentsPerGroup(10);
        course.setPrice(BigDecimal.ZERO);
        courseRepository.saveAndFlush(course);

        trainer = trainerRepository.findByTrainerId(course.getTrainerId()).orElseThrow();
        trainer.setIsActive(true);
        trainer.setMaxConcurrentGroups(100);
        trainerRepository.saveAndFlush(trainer);

        // A clean slate for this course: no group being prepared.
        groupRepository.findByCourseId(course.getCourseId()).forEach(g -> {
            g.setIsActive(false);
            groupRepository.save(g);
        });

        Set<String> involved = new HashSet<>();
        enrollmentRepository.findByCourseId(course.getCourseId()).forEach(e -> involved.add(e.getStudentId()));
        interactionRepository.findByCourseId(course.getCourseId()).forEach(i -> involved.add(i.getStudentId()));
        learners = studentRepository.findAll().stream()
                .filter(s -> !involved.contains(s.getStudentId()))
                .limit(3).collect(Collectors.toList());
        assumeTrue(learners.size() == 3, "needs three learners with no stake in that course");
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    private void request(Student s) {
        Interaction i = new Interaction();
        i.setInteractionId("INT_FLOW_" + UUID.randomUUID().toString().substring(0, 8));
        i.setStudentId(s.getStudentId());
        i.setCourseId(course.getCourseId());
        i.setInteractionType("clicked_interested");
        interactionRepository.saveAndFlush(i);
        automation.onInterest(s.getStudentId(), course.getCourseId(), now);
    }

    private Group formingGroup() {
        return groupRepository.findByCourseId(course.getCourseId()).stream()
                .filter(g -> Boolean.TRUE.equals(g.getIsActive()) && "forming".equals(g.getGroupStatus()))
                .findFirst().orElse(null);
    }

    private static RequestPostProcessor as(String id, String role) {
        AuthenticatedUser u = new AuthenticatedUser(id + "@example.test", id, role);
        return authentication(new UsernamePasswordAuthenticationToken(u, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private String schedule(LocalDateTime... sessions) throws Exception {
        List<Map<String, Object>> list = new ArrayList<>();
        for (LocalDateTime t : sessions) {
            list.add(Map.of("date", t.toLocalDate().toString(), "time", String.format("%02d:00", t.getHour()), "hours", 2));
        }
        return objectMapper.writeValueAsString(Map.of("hoursPerSession", 2, "sessions", list));
    }

    private boolean requesting(Student s) {
        return interactionRepository.findByStudentIdAndCourseId(s.getStudentId(), course.getCourseId()).stream()
                .anyMatch(i -> "clicked_interested".equals(i.getInteractionType()));
    }

    private boolean notified(String userId, String type, String groupId) {
        return notificationRepository.existsByUserIdAndNotificationTypeAndRelatedEntityId(userId, type, groupId);
    }

    private Group groupWithApprovedSchedule(LocalDateTime firstSession) throws Exception {
        Group g = new Group();
        g.setGroupId("GRP_FLOW_" + UUID.randomUUID().toString().substring(0, 6));
        g.setCourseId(course.getCourseId());
        g.setTrainerId(trainer.getTrainerId());
        g.setGroupName("Flow test");
        g.setGroupStatus("forming");
        g.setIsActive(true);
        g.setCurrentSize(0);
        g.setMaxSize(10);
        g.setMeetingSchedule(schedule(firstSession, firstSession.plusDays(1)));
        g.setScheduleApprovedAt(now);
        return groupRepository.saveAndFlush(g);
    }

    // ── The normal path ─────────────────────────────────────────────────

    @Test
    void requestsOpenTheGroupAndTheMinimumPaidStartsIt() throws Exception {
        Student a = learners.get(0), b = learners.get(1);

        request(a);
        assertNull(formingGroup(), "one request of a minimum of two opens nothing");
        request(b);
        Group g = formingGroup();
        assertNotNull(g, "the second request reaches the minimum and opens a group");
        assertTrue(notified(trainer.getTrainerId(), "GROUP_SCHEDULE_REQUEST", g.getGroupId()),
                "the trainer is asked to schedule it");
        assertEquals("awaiting_schedule", automation.stage(g));

        // The trainer schedules; administrators are told there is one to review.
        LocalDateTime first = now.plusDays(5).withHour(18).withMinute(0).withSecond(0).withNano(0);
        mvc.perform(put("/api/groups/" + g.getGroupId() + "/schedule").contentType(MediaType.APPLICATION_JSON)
                        .content(schedule(first, first.plusDays(1))).with(as(trainer.getTrainerId(), "TRAINER")))
                .andExpect(status().isOk());
        assertEquals("awaiting_review", automation.stage(groupRepository.findById(g.getGroupId()).orElseThrow()));
        Admin admin = adminRepository.findAll().stream().findFirst().orElse(null);
        if (admin != null) {
            assertTrue(notified(admin.getAdminId(), "GROUP_SCHEDULE_REVIEW", g.getGroupId()));
        }

        // Nobody can pay before the schedule is approved.
        Group beforeApproval = groupRepository.findById(g.getGroupId()).orElseThrow();
        IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
                () -> paymentService.createEnrollmentPayment(a.getStudentId(), course.getCourseId(), beforeApproval.getGroupId()));
        assertEquals("This group is not open for enrollment.", refused.getMessage());

        // An administrator approves; everyone still asking for the course is
        // invited with the dates — these two, and any real requests already
        // in the development database.
        String approved = mvc.perform(put("/api/admin/groups/" + g.getGroupId() + "/approve-schedule")
                        .with(as("ADM_FLOW_TEST", "ADMIN")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertTrue(((Number) objectMapper.readValue(approved, Map.class).get("invited")).intValue() >= 2);
        assertTrue(notified(a.getStudentId(), "GROUP_PAYMENT_OPEN", g.getGroupId()));
        assertTrue(notified(b.getStudentId(), "GROUP_PAYMENT_OPEN", g.getGroupId()));

        // The trainer can no longer move the dates learners are paying for.
        mvc.perform(put("/api/groups/" + g.getGroupId() + "/schedule").contentType(MediaType.APPLICATION_JSON)
                        .content(schedule(first.plusDays(2))).with(as(trainer.getTrainerId(), "TRAINER")))
                .andExpect(status().isConflict());

        // The first learner pays (a free course here) and joins at once.
        enrollmentService.confirmEnrollment(a.getStudentId(), course.getCourseId(), g.getGroupId(), null);
        automation.onJoined(groupRepository.findById(g.getGroupId()).orElseThrow(), now);
        assertEquals("forming", groupRepository.findById(g.getGroupId()).orElseThrow().getGroupStatus(),
                "one of two paid: not started yet");
        mvc.perform(get("/api/groups/student/" + a.getStudentId() + "/sessions").with(as(a.getStudentId(), "STUDENT")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        // The second completes the minimum: the group starts.
        enrollmentService.confirmEnrollment(b.getStudentId(), course.getCourseId(), g.getGroupId(), null);
        automation.onJoined(groupRepository.findById(g.getGroupId()).orElseThrow(), now);
        Group started = groupRepository.findById(g.getGroupId()).orElseThrow();
        assertEquals("ready", started.getGroupStatus());
        for (Student s : List.of(a, b)) {
            Enrollment e = enrollmentRepository.findByStudentIdAndCourseId(s.getStudentId(), course.getCourseId()).orElseThrow();
            assertEquals("active", e.getEnrollmentStatus());
            assertTrue(notified(s.getStudentId(), "GROUP_READY", g.getGroupId()));
        }
    }

    @Test
    void invitedLearnersWhoDidNotPayDoNotOpenAnotherGroup() throws Exception {
        request(learners.get(0));
        request(learners.get(1));
        Group g = formingGroup();
        assertNotNull(g);
        g.setIsActive(false);
        g.setGroupStatus("cancelled");
        groupRepository.saveAndFlush(g);

        assertTrue(automation.maybeOpenGroup(course, now.plusDays(1)).isEmpty(),
                "their requests predate the group they were offered");
    }

    // ── Deadlines ───────────────────────────────────────────────────────

    @Test
    void fortyEightHoursOutTheAdminsGetACallList() throws Exception {
        Group g = groupWithApprovedSchedule(now.plusHours(40));
        Student invited = learners.get(2);
        automation.onInterest(invited.getStudentId(), course.getCourseId(), now);
        assertTrue(notified(invited.getStudentId(), "GROUP_PAYMENT_OPEN", g.getGroupId()),
                "a request while a group is open is an invitation to it");

        automation.advance(g.getGroupId(), now);
        Admin admin = adminRepository.findAll().stream().findFirst().orElse(null);
        if (admin != null) {
            assertTrue(notified(admin.getAdminId(), "GROUP_CALL_LIST", g.getGroupId()));
        }
        assertEquals(List.of(invited.getStudentId()),
                automation.callList(g).stream().map(m -> m.get("studentId")).toList());
        assertEquals("forming", groupRepository.findById(g.getGroupId()).orElseThrow().getGroupStatus());
        assertTrue(notified(invited.getStudentId(), "GROUP_PAYMENT_REMINDER", g.getGroupId()),
                "the learner on the call list is reminded as well");

        automation.advance(g.getGroupId(), now.plusMinutes(15));
        assertEquals(1, notificationRepository.findByNotificationTypeAndRelatedEntityId(
                "GROUP_PAYMENT_REMINDER", g.getGroupId()).size(), "reminded once, not every sweep");
    }

    @Test
    void twentyFourHoursOutTheGroupStartsWithWhoeverPaid() throws Exception {
        Group g = groupWithApprovedSchedule(now.plusHours(20));
        Student paid = learners.get(0);
        enrollmentService.confirmEnrollment(paid.getStudentId(), course.getCourseId(), g.getGroupId(), null);

        automation.advance(g.getGroupId(), now);
        assertEquals("ready", groupRepository.findById(g.getGroupId()).orElseThrow().getGroupStatus(),
                "one paid of two needed: it starts with that one");
    }

    @Test
    void twentyFourHoursOutWithNobodyPaidTheGroupCloses() throws Exception {
        Group g = groupWithApprovedSchedule(now.plusHours(20));

        Student invited = learners.get(0);
        request(invited);
        assertTrue(notified(invited.getStudentId(), "GROUP_PAYMENT_OPEN", g.getGroupId()));

        automation.advance(g.getGroupId(), now);
        Group closed = groupRepository.findById(g.getGroupId()).orElseThrow();
        assertEquals("cancelled", closed.getGroupStatus());
        assertFalse(closed.getIsActive());
        assertTrue(notified(trainer.getTrainerId(), "GROUP_CLOSED", g.getGroupId()));
        assertTrue(notified(invited.getStudentId(), "GROUP_CLOSED", g.getGroupId()));
        assertFalse(requesting(invited), "their request ended with the group; asking again counts afresh");
    }

    @Test
    void onceAStartedGroupsFirstSessionBeginsTheUnpaidInvitationsEnd() throws Exception {
        Group g = groupWithApprovedSchedule(now.plusDays(2));
        Student paid = learners.get(0), unpaid = learners.get(1);
        request(paid);
        request(unpaid);
        enrollmentService.confirmEnrollment(paid.getStudentId(), course.getCourseId(), g.getGroupId(), null);
        g = groupRepository.findById(g.getGroupId()).orElseThrow();
        g.setGroupStatus("ready");
        groupRepository.saveAndFlush(g);

        automation.endUnpaidInvitations(g.getGroupId(), now);
        assertTrue(requesting(unpaid), "before the first session they can still join");

        automation.endUnpaidInvitations(g.getGroupId(), now.plusDays(3));
        assertFalse(requesting(unpaid));
        assertTrue(notified(unpaid.getStudentId(), "GROUP_MISSED", g.getGroupId()));
        assertFalse(notified(paid.getStudentId(), "GROUP_MISSED", g.getGroupId()), "a member is not told they missed it");
    }

    // ── The course page's way back to an invitation ─────────────────────

    @Test
    void anInvitedLearnerFindsTheirOpenGroupUntilTheyPay() throws Exception {
        Group g = groupWithApprovedSchedule(now.plusDays(3));
        Student invited = learners.get(0), other = learners.get(1);
        request(invited);

        mvc.perform(get("/api/groups/course/" + course.getCourseId() + "/my-offer").with(as(invited.getStudentId(), "STUDENT")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groupId").value(g.getGroupId()))
                .andExpect(jsonPath("$.stage").value("open_for_payment"));
        mvc.perform(get("/api/groups/course/" + course.getCourseId() + "/my-offer").with(as(other.getStudentId(), "STUDENT")))
                .andExpect(status().isNoContent());

        enrollmentService.confirmEnrollment(invited.getStudentId(), course.getCourseId(), g.getGroupId(), null);
        mvc.perform(get("/api/groups/course/" + course.getCourseId() + "/my-offer").with(as(invited.getStudentId(), "STUDENT")))
                .andExpect(status().isNoContent());

        // The invitation still has its button; paying again must be refused
        // before the gateway, since a second payment could never be a place.
        IllegalArgumentException twice = assertThrows(IllegalArgumentException.class,
                () -> paymentService.createEnrollmentPayment(invited.getStudentId(), course.getCourseId(), g.getGroupId()));
        assertEquals("Already enrolled in this course", twice.getMessage());
    }

    @Test
    void aLateLearnerJoinsAStartedGroupAsActive() throws Exception {
        Group g = groupWithApprovedSchedule(now.plusDays(3));
        g.setGroupStatus("ready");
        groupRepository.saveAndFlush(g);

        Student late = learners.get(1);
        enrollmentService.confirmEnrollment(late.getStudentId(), course.getCourseId(), g.getGroupId(), null);
        Enrollment e = enrollmentRepository.findByStudentIdAndCourseId(late.getStudentId(), course.getCourseId()).orElseThrow();
        assertEquals("active", e.getEnrollmentStatus());
    }

    @Test
    void aFullOrStartedGroupCannotBePaidFor() throws Exception {
        Group past = groupWithApprovedSchedule(now.minusHours(1));
        assertThrows(IllegalArgumentException.class,
                () -> automation.checkJoinable(past, course.getCourseId(), now));

        Group full = groupWithApprovedSchedule(now.plusDays(3));
        full.setMaxSize(1);
        groupRepository.saveAndFlush(full);
        enrollmentService.confirmEnrollment(learners.get(0).getStudentId(), course.getCourseId(), full.getGroupId(), null);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> automation.checkJoinable(groupRepository.findById(full.getGroupId()).orElseThrow(), course.getCourseId(), now));
        assertEquals("This group is full.", e.getMessage());
    }

    // ── Scheduling reminders ────────────────────────────────────────────

    @Test
    void aTrainerWhoDoesNotScheduleIsRemindedThenTheAdminsAreTold() {
        request(learners.get(0));
        request(learners.get(1));
        Group g = formingGroup();
        assertNotNull(g);

        automation.advance(g.getGroupId(), now.plusDays(1));
        assertFalse(notified(trainer.getTrainerId(), "GROUP_SCHEDULE_REMINDER", g.getGroupId()), "not after one day");

        automation.advance(g.getGroupId(), now.plusDays(3));
        assertTrue(notified(trainer.getTrainerId(), "GROUP_SCHEDULE_REMINDER", g.getGroupId()));

        automation.advance(g.getGroupId(), now.plusDays(6));
        Admin admin = adminRepository.findAll().stream().findFirst().orElse(null);
        if (admin != null) {
            assertTrue(notified(admin.getAdminId(), "GROUP_SCHEDULE_OVERDUE", g.getGroupId()));
        }
        assertEquals(1, notificationRepository.findByNotificationTypeAndRelatedEntityId(
                "GROUP_SCHEDULE_REMINDER", g.getGroupId()).size(), "reminded once, not every sweep");
    }
}
