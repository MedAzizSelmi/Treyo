package com.byb.backend.service;

import com.byb.backend.dto.message.ConversationResponse;
import com.byb.backend.model.*;
import com.byb.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * The group chat list counts members and shows the newest message by asking
 * the database for exactly that, instead of loading every enrollment and
 * every message on each refresh. What it shows must not change: the
 * learners in the group plus its trainer, and the last message sent.
 * Rolled back.
 */
@SpringBootTest
@Transactional
class GroupConversationListTest {

    @Autowired private MessageService messageService;
    @Autowired private CourseRepository courseRepository;
    @Autowired private StudentRepository studentRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private EnrollmentRepository enrollmentRepository;
    @Autowired private MessageRepository messageRepository;
    @Autowired private AdminRepository adminRepository;

    @MockBean private PushNotificationService pushNotificationService;
    @MockBean private MLRecommendationService mlRecommendationService;
    @MockBean private EmailService emailService;

    private Group group;
    private List<Student> members;
    private String adminId;

    @BeforeEach
    void setUp() {
        Course course = courseRepository.findAll().stream().filter(c -> c.getTrainerId() != null).findFirst().orElse(null);
        assumeTrue(course != null, "needs a course with a trainer");
        adminId = adminRepository.findAll().stream().map(Admin::getAdminId).findFirst().orElse(null);
        assumeTrue(adminId != null, "needs an admin");
        Set<String> enrolled = enrollmentRepository.findByCourseId(course.getCourseId()).stream()
                .map(Enrollment::getStudentId).collect(Collectors.toSet());
        members = studentRepository.findAll().stream()
                .filter(s -> !enrolled.contains(s.getStudentId())).limit(2).toList();
        assumeTrue(members.size() == 2, "needs two learners not enrolled in that course");

        group = new Group();
        group.setGroupId("GRP_LIST_" + UUID.randomUUID().toString().substring(0, 6));
        group.setCourseId(course.getCourseId());
        group.setTrainerId(course.getTrainerId());
        group.setGroupName("List test");
        group.setGroupStatus("active");
        group.setIsActive(true);
        group = groupRepository.saveAndFlush(group);

        for (Student s : members) {
            Enrollment e = new Enrollment();
            e.setEnrollmentId("ENR_LIST_" + UUID.randomUUID().toString().substring(0, 6));
            e.setStudentId(s.getStudentId());
            e.setCourseId(course.getCourseId());
            e.setGroupId(group.getGroupId());
            e.setEnrollmentStatus("active");
            e.setEnrolledAt(LocalDateTime.now());
            enrollmentRepository.save(e);
        }
        enrollmentRepository.flush();
    }

    private void send(String text) throws InterruptedException {
        Message m = new Message();
        m.setMessageId("MSG_LIST_" + UUID.randomUUID().toString().substring(0, 8));
        m.setSenderId(members.get(0).getStudentId());
        m.setSenderType("student");
        m.setReceiverId(group.getGroupId());
        m.setReceiverType("group");
        m.setConversationId(MessageService.groupConversationId(group.getGroupId()));
        m.setContent(text);
        messageRepository.saveAndFlush(m);
        Thread.sleep(5); // distinct created_at for the next one
    }

    private ConversationResponse listed(String userId) {
        return messageService.getUserGroupConversations(userId).stream()
                .filter(c -> group.getGroupId().equals(c.getGroupId()))
                .findFirst().orElse(null);
    }

    @Test
    void theListCountsTheGroupsLearnersAndTrainerAndShowsTheNewestMessage() throws Exception {
        send("First");
        send("Second");
        ConversationResponse conv = listed(adminId);
        assertNotNull(conv, "an admin sees every active group");
        assertEquals(3, conv.getMemberCount());
        assertEquals("Second", conv.getLastMessage());
    }

    @Test
    void aLearnerSeesTheirGroupFromTheirOwnEnrollments() {
        ConversationResponse conv = listed(members.get(1).getStudentId());
        assertNotNull(conv);
        assertEquals("Group created — say hi!", conv.getLastMessage());
    }
}
