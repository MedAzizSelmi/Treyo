package com.byb.backend.controller;

import com.byb.backend.model.Course;
import com.byb.backend.model.Student;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.StudentRepository;
import com.byb.backend.security.AuthenticatedUser;
import com.byb.backend.service.EmailService;
import com.byb.backend.service.MLRecommendationService;
import com.byb.backend.service.PushNotificationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A trainer's page: learners get the courses they can open and a count of
 * those; the trainer gets every course they made. The page used to filter
 * on a field courses do not have, and said every trainer had none.
 * Rolled back.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class TrainerCoursesTest {

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private CourseRepository courseRepository;
    @Autowired private StudentRepository studentRepository;

    @MockBean private EmailService emailService;
    @MockBean private PushNotificationService pushNotificationService;
    @MockBean private MLRecommendationService mlRecommendationService;

    private static RequestPostProcessor as(String id, String role) {
        AuthenticatedUser u = new AuthenticatedUser(id + "@example.test", id, role);
        return authentication(new UsernamePasswordAuthenticationToken(u, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    @Test
    void learnersSeeTheOpenCoursesAndTheTrainerSeesAll() throws Exception {
        String trainerId = courseRepository.findAll().stream()
                .map(Course::getTrainerId).filter(id -> id != null && courseRepository.findByTrainerId(id).size() >= 3)
                .findFirst().orElse(null);
        Student learner = studentRepository.findAll().stream().findFirst().orElse(null);
        assumeTrue(trainerId != null && learner != null, "needs a trainer with three courses, and a learner");

        // Learners only see an approved trainer's page.
        trainerRepository.findByTrainerId(trainerId).ifPresent(t -> {
            t.setApprovalStatus("APPROVED");
            trainerRepository.saveAndFlush(t);
        });

        // Two open, one still pending review.
        List<Course> courses = courseRepository.findByTrainerId(trainerId);
        for (int i = 0; i < courses.size(); i++) {
            Course c = courses.get(i);
            c.setIsActive(true);
            c.setIsPublished(i != 2);
            c.setApprovalStatus(i == 2 ? "PENDING" : "APPROVED");
            courseRepository.save(c);
        }
        courseRepository.flush();
        long open = courses.size() - 1;

        mvc.perform(get("/api/courses/trainer/" + trainerId).with(as(learner.getStudentId(), "STUDENT")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value((int) open))
                .andExpect(jsonPath("$[?(@.approvalStatus == 'PENDING')]").isEmpty());
        mvc.perform(get("/api/courses/trainer/" + trainerId).with(as(trainerId, "TRAINER")))
                .andExpect(jsonPath("$.length()").value(courses.size()));

        String json = mvc.perform(get("/api/trainers/" + trainerId).with(as(learner.getStudentId(), "STUDENT")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(open, ((Number) objectMapper.readValue(json, Map.class).get("coursesCount")).longValue(),
                "the count matches the courses listed, not every course ever made");
    }

    @Autowired private com.byb.backend.repository.TrainerRepository trainerRepository;

    @Test
    void thePublicTrainerListShowsApprovedTrainersAndNoEmails() throws Exception {
        List<com.byb.backend.model.Trainer> trainers = trainerRepository.findByIsActiveTrue();
        assumeTrue(trainers.size() >= 2, "needs two active trainers");
        com.byb.backend.model.Trainer approved = trainers.get(0), applicant = trainers.get(1);
        approved.setApprovalStatus("APPROVED");
        applicant.setApprovalStatus("PENDING");
        trainerRepository.saveAll(List.of(approved, applicant));
        trainerRepository.flush();

        // Open to anyone, signed in or not.
        mvc.perform(get("/api/trainers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.trainerId == '" + approved.getTrainerId() + "')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.trainerId == '" + applicant.getTrainerId() + "')]").isEmpty())
                .andExpect(jsonPath("$[0].email").doesNotExist());

        Student learner = studentRepository.findAll().stream().findFirst().orElse(null);
        assumeTrue(learner != null, "needs a learner");
        mvc.perform(get("/api/trainers/" + applicant.getTrainerId()).with(as(learner.getStudentId(), "STUDENT")))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/trainers/" + applicant.getTrainerId()).with(as("ADM_LIST_TEST", "ADMIN")))
                .andExpect(status().isOk());
    }
}
