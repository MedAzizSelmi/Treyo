package com.byb.backend.controller;

import com.byb.backend.model.Course;
import com.byb.backend.model.Group;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.GroupRepository;
import com.byb.backend.security.AuthenticatedUser;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A trainer is paid one day's rate for each day they actually taught.
 *
 * Two ways it went wrong: sessions still to come were counted as earned,
 * and sessions on a course the admin never gave a rate to were dropped
 * without a word — a trainer who had taught saw 0 and nothing explaining
 * it. Those are now reported as unratedSessions.
 *
 * Compares the trainer's earnings before and after adding test groups,
 * so their real groups in the development database do not matter. Runs
 * in a rolled-back transaction; the request is served on the test thread.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class TrainerEarningsTest {

    @Autowired private MockMvc mvc;
    @Autowired private GroupRepository groupRepository;
    @Autowired private CourseRepository courseRepository;
    @Autowired private ObjectMapper objectMapper;

    @Test
    void paysDaysAlreadyTaughtAndReportsUnratedOnes() throws Exception {
        List<Course> withTrainer = courseRepository.findAll().stream()
                .filter(c -> c.getTrainerId() != null).limit(2).toList();
        assumeTrue(withTrainer.size() == 2, "needs two courses with a trainer in the development database");
        Course rated = withTrainer.get(0);
        Course unrated = withTrainer.get(1);
        String trainerId = rated.getTrainerId();

        rated.setTrainerDailyRevenue(new BigDecimal("100.00"));
        unrated.setTrainerDailyRevenue(null);
        courseRepository.saveAndFlush(rated);
        courseRepository.saveAndFlush(unrated);

        LocalDateTime now = LocalDateTime.now();
        LocalDate taught = now.minusHours(26).toLocalDate();   // yesterday-ish, already held
        LocalDate taughtToo = taught.minusDays(1);
        LocalDate ahead = now.plusDays(1).toLocalDate();       // not held yet
        int year = taught.getYear();
        int month = taught.getMonthValue();

        Map<String, Object> before = earnings(trainerId, year, month);

        group(trainerId, rated, taught, ahead);   // one day paid, one not yet
        group(trainerId, unrated, taughtToo);     // taught, but no rate

        Map<String, Object> after = earnings(trainerId, year, month);

        BigDecimal paid = new BigDecimal(String.valueOf(after.get("total")))
                .subtract(new BigDecimal(String.valueOf(before.get("total"))));
        assertEquals(0, paid.compareTo(new BigDecimal("100")),
                "one taught day at 100; the session still to come must not count, got " + paid);

        int unratedNow = ((Number) after.get("unratedSessions")).intValue()
                - ((Number) before.get("unratedSessions")).intValue();
        if (taughtToo.getMonthValue() == month) {
            assertEquals(1, unratedNow, "a day taught on a course with no rate is reported, not dropped");
        }
    }

    private void group(String trainerId, Course course, LocalDate... dates) throws Exception {
        List<Map<String, Object>> sessions = java.util.Arrays.stream(dates)
                .map(d -> Map.<String, Object>of("date", d.toString(), "time", "10:00"))
                .toList();
        Group g = new Group();
        g.setGroupId("GRP_ERN_" + UUID.randomUUID().toString().substring(0, 8));
        g.setCourseId(course.getCourseId());
        g.setTrainerId(trainerId);
        g.setGroupName("Earnings test");
        g.setGroupStatus("active");
        g.setIsActive(true);
        g.setMeetingSchedule(objectMapper.writeValueAsString(Map.of("sessions", sessions)));
        groupRepository.saveAndFlush(g);
    }

    private Map<String, Object> earnings(String trainerId, int year, int month) throws Exception {
        AuthenticatedUser user = new AuthenticatedUser("trainer@example.test", trainerId, "TRAINER");
        String body = mvc.perform(get("/api/trainers/" + trainerId + "/earnings")
                        .param("year", String.valueOf(year)).param("month", String.valueOf(month))
                        .with(authentication(new UsernamePasswordAuthenticationToken(
                                user, null, List.of(new SimpleGrantedAuthority("ROLE_TRAINER"))))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readValue(body, new TypeReference<>() {});
    }
}
