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

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A trainer's "Upcoming sessions" lists every group that still has a
 * session ahead of it, dated by that next session.
 *
 * It used to drop a group as soon as its first session had passed —
 * the group's startDate — so a group halfway through its run vanished
 * from the trainer's home while its learners still saw the remaining
 * sessions.
 *
 * Runs in a rolled-back transaction against the development database;
 * the request is served on the test's own thread, so it sees the
 * uncommitted test groups.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class TrainerUpcomingSessionsTest {

    @Autowired private MockMvc mvc;
    @Autowired private GroupRepository groupRepository;
    @Autowired private CourseRepository courseRepository;
    @Autowired private ObjectMapper objectMapper;

    @Test
    void aGroupPastItsFirstSessionStillShowsWithItsNextOne() throws Exception {
        Course course = courseRepository.findAll().stream()
                .filter(c -> c.getTrainerId() != null)
                .findFirst().orElse(null);
        assumeTrue(course != null, "needs a course with a trainer in the development database");
        String trainerId = course.getTrainerId();

        LocalDate today = LocalDate.now();
        String midway = scheduledGroup(course, today.minusDays(1), today.plusDays(7));
        String finished = scheduledGroup(course, today.minusDays(10), today.minusDays(3));
        String unscheduled = save(group(course));

        List<Map<String, Object>> upcoming = upcomingFor(trainerId);

        Map<String, Object> midwayRow = find(upcoming, midway).orElse(null);
        assertNotNull(midwayRow, "a group with a session still ahead must be listed");
        assertTrue(String.valueOf(midwayRow.get("nextSessionAt")).startsWith(today.plusDays(7).toString()),
                "dated by its next session, not its first: " + midwayRow.get("nextSessionAt"));

        assertTrue(find(upcoming, unscheduled).isPresent(),
                "a group not yet scheduled is listed, so the trainer can schedule it");
        assertTrue(find(upcoming, finished).isEmpty(),
                "a group whose sessions are all over is not upcoming");
    }

    private String scheduledGroup(Course course, LocalDate first, LocalDate last) throws Exception {
        Group g = group(course);
        Map<String, Object> schedule = Map.of(
                "hoursPerSession", 2,
                "sessions", List.of(
                        Map.of("date", first.toString(), "time", "10:00"),
                        Map.of("date", last.toString(), "time", "10:00")));
        g.setMeetingSchedule(objectMapper.writeValueAsString(schedule));
        g.setStartDate(first.atTime(10, 0));
        g.setEndDate(last.atTime(10, 0));
        return save(g);
    }

    private Group group(Course course) {
        Group g = new Group();
        g.setGroupId("GRP_UP_" + UUID.randomUUID().toString().substring(0, 8));
        g.setCourseId(course.getCourseId());
        g.setTrainerId(course.getTrainerId());
        g.setGroupName("Upcoming test");
        g.setGroupStatus("active");
        g.setIsActive(true);
        g.setCreatedAt(LocalDateTime.now());
        return g;
    }

    private String save(Group g) {
        return groupRepository.saveAndFlush(g).getGroupId();
    }

    private List<Map<String, Object>> upcomingFor(String trainerId) throws Exception {
        AuthenticatedUser user = new AuthenticatedUser("trainer@example.test", trainerId, "TRAINER");
        String body = mvc.perform(get("/api/groups/trainer/" + trainerId + "/upcoming")
                        .with(authentication(new UsernamePasswordAuthenticationToken(
                                user, null, List.of(new SimpleGrantedAuthority("ROLE_TRAINER"))))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readValue(body, new TypeReference<>() {});
    }

    private static Optional<Map<String, Object>> find(List<Map<String, Object>> rows, String groupId) {
        return rows.stream().filter(r -> groupId.equals(r.get("groupId"))).findFirst();
    }
}
