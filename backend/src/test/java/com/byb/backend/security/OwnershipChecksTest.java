package com.byb.backend.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Endpoints that name a user in the request refuse a caller who is not
 * that user. Runs through the real security chain and controllers.
 *
 * Every request here is either refused before it touches data, or a read,
 * and the ids belong to nobody — so it is safe against a development
 * database. The callers are principals built directly, the same shape
 * JwtAuthenticationFilter produces from an access token.
 */
@SpringBootTest
@AutoConfigureMockMvc
class OwnershipChecksTest {

    private static final String ME = "STU_ownership_test_a";
    private static final String OTHER_STUDENT = "STU_ownership_test_b";
    private static final String TRAINER = "TRN_ownership_test_a";
    private static final String OTHER_TRAINER = "TRN_ownership_test_b";

    @Autowired
    private MockMvc mvc;

    private static RequestPostProcessor as(String userId, String role) {
        AuthenticatedUser user = new AuthenticatedUser(userId + "@example.test", userId, role);
        return authentication(new UsernamePasswordAuthenticationToken(
                user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private static RequestPostProcessor learner() { return as(ME, "STUDENT"); }
    private static RequestPostProcessor trainer() { return as(TRAINER, "TRAINER"); }
    private static RequestPostProcessor admin() { return as("ADM_ownership_test", "ADMIN"); }

    // ── Trainer profile and settings ────────────────────────────────

    @Test
    void cannotChangeAnotherTrainersAvailability() throws Exception {
        mvc.perform(put("/api/trainers/me/availability").param("trainerId", OTHER_TRAINER)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"isActive\":false}")
                        .with(trainer()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Not available"));
    }

    @Test
    void learnerCannotEditATrainerProfile() throws Exception {
        mvc.perform(put("/api/trainers/me/availability").param("trainerId", TRAINER)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"isActive\":false}")
                        .with(learner()))
                .andExpect(status().isForbidden());
    }

    @Test
    void cannotReadAnotherTrainersEarnings() throws Exception {
        mvc.perform(get("/api/trainers/" + OTHER_TRAINER + "/earnings")
                        .param("year", "2026").param("month", "10").with(trainer()))
                .andExpect(status().isForbidden());
    }

    @Test
    void trainerReadsOwnEarnings() throws Exception {
        mvc.perform(get("/api/trainers/" + TRAINER + "/earnings")
                        .param("year", "2026").param("month", "10").with(trainer()))
                .andExpect(status().isOk());
    }

    @Test
    void cannotReadAnotherTrainersUpcomingSessions() throws Exception {
        mvc.perform(get("/api/groups/trainer/" + OTHER_TRAINER + "/upcoming").with(trainer()))
                .andExpect(status().isForbidden());
    }

    // ── Notifications ───────────────────────────────────────────────

    @Test
    void cannotReadAnotherUsersNotifications() throws Exception {
        mvc.perform(get("/api/notifications/user/" + OTHER_STUDENT).with(learner()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/notifications/user/" + OTHER_STUDENT + "/unread/count").with(learner()))
                .andExpect(status().isForbidden());
    }

    @Test
    void readsOwnNotifications() throws Exception {
        mvc.perform(get("/api/notifications/user/" + ME).with(learner()))
                .andExpect(status().isOk());
    }

    @Test
    void adminReadsAnyonesNotifications() throws Exception {
        mvc.perform(get("/api/notifications/user/" + OTHER_STUDENT).with(admin()))
                .andExpect(status().isOk());
    }

    @Test
    void markingANotificationThatIsNotYoursIsNotFound() throws Exception {
        mvc.perform(put("/api/notifications/no_such_notification/read").with(learner()))
                .andExpect(status().isNotFound());
    }

    // ── Enrollments, payments, sessions ─────────────────────────────

    @Test
    void cannotReadAnotherLearnersEnrollments() throws Exception {
        mvc.perform(get("/api/enrollments/student/" + OTHER_STUDENT).with(learner()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/groups/student/" + OTHER_STUDENT + "/sessions").with(learner()))
                .andExpect(status().isForbidden());
    }

    @Test
    void cannotEnrollSomeoneElse() throws Exception {
        mvc.perform(post("/api/enrollments/confirm")
                        .param("studentId", OTHER_STUDENT).param("courseId", "CRS_none")
                        .with(learner()))
                .andExpect(status().isForbidden());
    }

    @Test
    void cannotStartAPaymentForSomeoneElse() throws Exception {
        // Was the most likely to be mis-reported: the handler catches
        // RuntimeException and answers 502.
        mvc.perform(post("/api/payments/enrollment-payment")
                        .param("studentId", OTHER_STUDENT).param("courseId", "CRS_none")
                        .with(learner()))
                .andExpect(status().isForbidden());
    }

    @Test
    void learnerCannotMarkAnEnrollmentCompleted() throws Exception {
        mvc.perform(put("/api/enrollments/ENR_none/complete").with(learner()))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/enrollments/ENR_none/start").with(trainer()))
                .andExpect(status().isForbidden());
    }

    // ── Interactions, searches, recommendations, feed ───────────────

    @Test
    void cannotActAsAnotherLearner() throws Exception {
        mvc.perform(post("/api/interactions/interested")
                        .param("studentId", OTHER_STUDENT).param("courseId", "CRS_none")
                        .with(learner()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/interactions/saved")
                        .param("studentId", OTHER_STUDENT).param("courseId", "CRS_none")
                        .with(learner()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/searches/log")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"studentId\":\"" + OTHER_STUDENT + "\",\"query\":\"java\"}")
                        .with(learner()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/feed/fpost_none/like")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"" + OTHER_STUDENT + "\"}")
                        .with(learner()))
                .andExpect(status().isForbidden());
    }

    @Test
    void cannotReadAnotherLearnersData() throws Exception {
        mvc.perform(get("/api/recommendations/student/" + OTHER_STUDENT).with(learner()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/interactions/saved/student/" + OTHER_STUDENT).with(learner()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/feed/saved").param("userId", OTHER_STUDENT).with(learner()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/reviews/check")
                        .param("studentId", OTHER_STUDENT).param("courseId", "CRS_none")
                        .with(learner()))
                .andExpect(status().isForbidden());
    }

    // ── Reviews ─────────────────────────────────────────────────────

    @Test
    void cannotReviewInAnotherLearnersName() throws Exception {
        mvc.perform(post("/api/reviews")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"studentId\":\"" + OTHER_STUDENT + "\",\"courseId\":\"CRS_none\","
                                + "\"courseRating\":1,\"trainerRating\":1}")
                        .with(learner()))
                .andExpect(status().isForbidden());
    }

    @Test
    void reviewModerationIsAdminOnly() throws Exception {
        mvc.perform(get("/api/reviews/admin/all").with(learner()))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/reviews/admin/rev_none/visibility")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"hidden\":true}")
                        .with(trainer()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/reviews/admin/all").with(admin()))
                .andExpect(status().isOk());
    }
}
