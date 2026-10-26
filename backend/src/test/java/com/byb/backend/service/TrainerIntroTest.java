package com.byb.backend.service;

import com.byb.backend.model.Course;
import com.byb.backend.model.FeedPost;
import com.byb.backend.model.Student;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.*;
import com.byb.backend.security.AuthenticatedUser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Introducing a new trainer in the feed: only once they have a published
 * course, once while it is up, first for three days, carrying the trainer
 * its card opens, translated, and never counted as one of the day's AI
 * posts.
 *
 * Against the development database, rolled back. That database's
 * feed_posts still has the CHECK constraint Hibernate made before
 * NEW_TRAINER existed, so the test first runs the migration that rebuilds
 * it — inside its own transaction, so it is rolled back too, and the
 * migration itself is tried. Gemini is mocked: the "translation" marks the
 * text with its language.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class TrainerIntroTest {

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private TrainerRepository trainerRepository;
    @Autowired private CourseRepository courseRepository;
    @Autowired private StudentRepository studentRepository;
    @Autowired private FeedPostRepository feedPostRepository;

    @MockBean private GeminiService geminiService;
    @MockBean private EmailService emailService;
    @MockBean private PushNotificationService pushNotificationService;
    @MockBean private MLRecommendationService mlRecommendationService;

    private static final RequestPostProcessor ADMIN = as("ADM_INTRO_TEST", "ADMIN");
    private static final String INTRO = "Sami has taught Power BI to finance teams for eight years.";

    private Trainer trainer;
    private Course course;
    private Student learner;

    private static RequestPostProcessor as(String id, String role) {
        AuthenticatedUser u = new AuthenticatedUser(id + "@example.test", id, role);
        return authentication(new UsernamePasswordAuthenticationToken(u, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    @BeforeEach
    void setUp() throws Exception {
        String migration = new String(new ClassPathResource("db/migrations/2026-10-27_trainer_intro_posts.sql")
                .getInputStream().readAllBytes(), StandardCharsets.UTF_8)
                .replace("BEGIN;", "").replace("COMMIT;", "");
        jdbc.execute(migration);

        course = courseRepository.findAll().stream()
                .filter(c -> c.getTrainerId() != null && trainerRepository.findByTrainerId(c.getTrainerId()).isPresent())
                .findFirst().orElse(null);
        learner = studentRepository.findAll().stream().findFirst().orElse(null);
        assumeTrue(course != null && learner != null, "needs a trainer with a course, and a learner");
        trainer = trainerRepository.findByTrainerId(course.getTrainerId()).orElseThrow();
        trainer.setApprovalStatus("APPROVED");
        trainer.setIsActive(true);
        trainerRepository.saveAndFlush(trainer);
        // A clean slate: no introduction of them up already.
        feedPostRepository.findByTrainerIdAndCategoryAndIsActiveTrue(trainer.getTrainerId(), FeedPost.Category.NEW_TRAINER)
                .forEach(p -> { p.setIsActive(false); feedPostRepository.save(p); });

        // The mocked translation echoes each post marked with the language.
        when(geminiService.generateText(anyString(), anyInt(), anyDouble())).thenAnswer(inv -> {
            String prompt = inv.getArgument(0);
            String lang = prompt.substring("Translate every title and body in the JSON below into ".length()).split("\\.")[0];
            JsonNode input = objectMapper.readTree(prompt.substring(prompt.indexOf("Input:\n") + 7));
            ArrayNode out = objectMapper.createArrayNode();
            for (JsonNode n : input) {
                out.addObject().put("id", n.get("id").asText())
                        .put("title", "[" + lang + "] " + n.get("title").asText())
                        .put("body", "[" + lang + "] " + n.get("body").asText());
            }
            return objectMapper.writeValueAsString(out);
        });
    }

    private void published(boolean yes) {
        courseRepository.findByTrainerId(trainer.getTrainerId()).forEach(c -> {
            c.setIsPublished(yes);
            c.setIsActive(true);
            c.setApprovalStatus("APPROVED");
            courseRepository.save(c);
        });
        courseRepository.flush();
    }

    private String introduce() throws Exception {
        String json = mvc.perform(post("/api/admin/feed/trainer-intro").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("trainerId", trainer.getTrainerId(), "intro", INTRO)))
                        .with(ADMIN))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return (String) objectMapper.readValue(json, Map.class).get("postId");
    }

    @Test
    void aTrainerWithNoPublishedCourseCannotBeIntroduced() throws Exception {
        published(false);
        mvc.perform(get("/api/admin/feed/trainer-intro/" + trainer.getTrainerId()).with(ADMIN))
                .andExpect(jsonPath("$.canIntroduce").value(false))
                .andExpect(jsonPath("$.reason").value("NO_COURSE"));
        mvc.perform(post("/api/admin/feed/trainer-intro").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("trainerId", trainer.getTrainerId(), "intro", INTRO)))
                        .with(ADMIN))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("NO_COURSE"));
    }

    @Test
    void theIntroductionComesFirstCarriesTheTrainerAndIsTranslated() throws Exception {
        published(true);
        String postId = introduce();
        RequestPostProcessor me = as(learner.getStudentId(), "STUDENT");

        mvc.perform(get("/api/feed").param("userId", learner.getStudentId()).param("lang", "fr").with(me))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].postId").value(postId))
                .andExpect(jsonPath("$.items[0].category").value("NEW_TRAINER"))
                .andExpect(jsonPath("$.items[0].pinned").value(true))
                .andExpect(jsonPath("$.items[0].trainer.trainerId").value(trainer.getTrainerId()))
                .andExpect(jsonPath("$.items[0].body").value("[French] " + INTRO));
        mvc.perform(get("/api/feed").param("userId", learner.getStudentId()).param("lang", "en").with(me))
                .andExpect(jsonPath("$.items[0].body").value("[English] " + INTRO));

        // Once per trainer while it is up.
        mvc.perform(post("/api/admin/feed/trainer-intro").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("trainerId", trainer.getTrainerId(), "intro", INTRO)))
                        .with(ADMIN))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("ALREADY"));
    }

    @Test
    void afterThreeDaysItFallsBackToItsPlaceByDate() throws Exception {
        published(true);
        String postId = introduce();
        FeedPost intro = feedPostRepository.findById(postId).orElseThrow();
        intro.setPublishedAt(LocalDateTime.now().minusDays(4));
        intro.setPinnedUntil(LocalDateTime.now().minusDays(1));
        feedPostRepository.saveAndFlush(intro);

        mvc.perform(get("/api/feed").param("userId", learner.getStudentId()).with(as(learner.getStudentId(), "STUDENT")))
                .andExpect(jsonPath("$.items[0].postId").value(org.hamcrest.Matchers.not(postId)));
    }

    @Test
    void anIntroductionIsNotOneOfTheDaysAiPosts() throws Exception {
        published(true);
        LocalDateTime startOfToday = LocalDateTime.now().withHour(0).withMinute(0).withSecond(0);
        long before = feedPostRepository.countByPublishedAtAfterAndCategoryNot(startOfToday, FeedPost.Category.NEW_TRAINER);
        introduce();
        assertEquals(before, feedPostRepository.countByPublishedAtAfterAndCategoryNot(startOfToday, FeedPost.Category.NEW_TRAINER),
                "the morning batch still runs on a day a trainer was introduced");
    }

    @Test
    void aRemovedIntroductionLeavesTheFeedAndTheTrainerCanBeIntroducedAgain() throws Exception {
        published(true);
        String postId = introduce();
        mvc.perform(delete("/api/admin/feed/posts/" + postId).with(ADMIN)).andExpect(status().isNoContent());
        mvc.perform(get("/api/feed").param("userId", learner.getStudentId()).with(as(learner.getStudentId(), "STUDENT")))
                .andExpect(jsonPath("$.items[?(@.postId == '" + postId + "')]").isEmpty());
        introduce();
    }

    @Test
    void onlyAdministratorsIntroduceTrainers() throws Exception {
        published(true);
        mvc.perform(post("/api/admin/feed/trainer-intro").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("trainerId", trainer.getTrainerId(), "intro", INTRO)))
                        .with(as(trainer.getTrainerId(), "TRAINER")))
                .andExpect(status().isForbidden());
    }
}
