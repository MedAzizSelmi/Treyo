package com.byb.backend.controller;

import com.byb.backend.model.*;
import com.byb.backend.repository.*;
import com.byb.backend.security.AuthenticatedUser;
import com.byb.backend.service.EmailService;
import com.byb.backend.service.MLRecommendationService;
import com.byb.backend.service.PushNotificationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * An administrator's notification to one running group reaches its
 * learners, and its trainer unless left out — and only a running group.
 * Rolled back; push is mocked.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class GroupNotificationTest {

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private CourseRepository courseRepository;
    @Autowired private StudentRepository studentRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private EnrollmentRepository enrollmentRepository;
    @Autowired private NotificationRepository notificationRepository;

    @MockBean private EmailService emailService;
    @MockBean private PushNotificationService pushNotificationService;
    @MockBean private MLRecommendationService mlRecommendationService;

    private static final RequestPostProcessor ADMIN = authentication(new UsernamePasswordAuthenticationToken(
            new AuthenticatedUser("adm@example.test", "ADM_GROUP_NOTIFY", "ADMIN"), null,
            List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

    private Course course;
    private Group group;
    private List<Student> members;
    private Student outsider;

    @BeforeEach
    void setUp() {
        course = courseRepository.findAll().stream().filter(c -> c.getTrainerId() != null).findFirst().orElse(null);
        assumeTrue(course != null, "needs a course with a trainer");
        Set<String> enrolled = enrollmentRepository.findByCourseId(course.getCourseId()).stream()
                .map(Enrollment::getStudentId).collect(Collectors.toSet());
        List<Student> free = studentRepository.findAll().stream()
                .filter(s -> !enrolled.contains(s.getStudentId())).limit(3).toList();
        assumeTrue(free.size() == 3, "needs three learners not enrolled in that course");
        members = free.subList(0, 2);
        outsider = free.get(2);

        group = new Group();
        group.setGroupId("GRP_NOTIFY_" + UUID.randomUUID().toString().substring(0, 6));
        group.setCourseId(course.getCourseId());
        group.setTrainerId(course.getTrainerId());
        group.setGroupName("Notify test");
        group.setGroupStatus("active");
        group.setIsActive(true);
        group.setCurrentSize(2);
        group.setMaxSize(10);
        group = groupRepository.saveAndFlush(group);

        for (Student s : members) {
            Enrollment e = new Enrollment();
            e.setEnrollmentId("ENR_NOTIFY_" + UUID.randomUUID().toString().substring(0, 6));
            e.setStudentId(s.getStudentId());
            e.setCourseId(course.getCourseId());
            e.setGroupId(group.getGroupId());
            e.setEnrollmentStatus("active");
            e.setEnrolledAt(LocalDateTime.now());
            enrollmentRepository.save(e);
        }
        enrollmentRepository.flush();
    }

    private String body(boolean includeTrainer) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "recipientType", "GROUP", "targetGroupId", group.getGroupId(), "includeTrainer", includeTrainer,
                "title", "Room change", "message", "Tomorrow's session moves to room B.", "priority", "high"));
    }

    private boolean got(String userId) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .anyMatch(n -> "ADMIN_BROADCAST".equals(n.getNotificationType()) && group.getGroupId().equals(n.getRelatedEntityId()));
    }

    @Test
    void itReachesTheGroupsLearnersAndTrainerAndNobodyElse() throws Exception {
        mvc.perform(post("/api/admin/notifications/send").contentType(MediaType.APPLICATION_JSON).content(body(true)).with(ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recipients").value(3));
        for (Student s : members) assertTrue(got(s.getStudentId()));
        assertTrue(got(course.getTrainerId()));
        assertFalse(got(outsider.getStudentId()));
    }

    @Test
    @SuppressWarnings("unchecked")
    void thePushNamesTheGroupSoATapOpensItsChat() throws Exception {
        mvc.perform(post("/api/admin/notifications/send").contentType(MediaType.APPLICATION_JSON).content(body(true)).with(ADMIN))
                .andExpect(status().isOk());
        ArgumentCaptor<Map<String, Object>> data = ArgumentCaptor.forClass(Map.class);
        verify(pushNotificationService).sendToUsers(anyList(), eq("Room change"), anyString(), data.capture());
        assertEquals("ADMIN_BROADCAST", data.getValue().get("type"));
        assertEquals(group.getGroupId(), data.getValue().get("groupId"));
        assertEquals("Notify test", data.getValue().get("groupName"));
    }

    @Test
    void theTrainerCanBeLeftOut() throws Exception {
        mvc.perform(post("/api/admin/notifications/send").contentType(MediaType.APPLICATION_JSON).content(body(false)).with(ADMIN))
                .andExpect(jsonPath("$.recipients").value(2));
        assertFalse(got(course.getTrainerId()));
    }

    @Test
    void onlyARunningGroupCanBeNotified() throws Exception {
        for (String status : List.of("forming", "completed", "cancelled")) {
            group.setGroupStatus(status);
            groupRepository.saveAndFlush(group);
            mvc.perform(post("/api/admin/notifications/send").contentType(MediaType.APPLICATION_JSON).content(body(true)).with(ADMIN))
                    .andExpect(status().isBadRequest());
        }
        assertFalse(got(members.get(0).getStudentId()));
    }
}
