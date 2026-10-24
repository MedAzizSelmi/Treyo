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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Course suggestions end to end: a learner asks, nonsense is turned away
 * at the form, nothing reaches other learners before an administrator
 * accepts it, "me too" adds demand, and publishing tells every supporter
 * and registers their request. Also the searches that found nothing.
 *
 * Against the development database in a rolled-back transaction, with
 * email, push and the recommendation service mocked.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class CourseSuggestionTest {

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private CourseSuggestionService service;
    @Autowired private StudentRepository studentRepository;
    @Autowired private CourseRepository courseRepository;
    @Autowired private EnrollmentRepository enrollmentRepository;
    @Autowired private InteractionRepository interactionRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private SearchLogRepository searchLogRepository;
    @Autowired private CourseSuggestionRepository suggestionRepository;

    @MockBean private EmailService emailService;
    @MockBean private PushNotificationService pushNotificationService;
    @MockBean private MLRecommendationService mlRecommendationService;

    private Student a, b, c;

    @BeforeEach
    void setUp() {
        List<Student> learners = studentRepository.findAll().stream()
                .filter(s -> s.getEmail() != null)
                .filter(s -> suggestionRepository.findByStudentId(s.getStudentId()).isEmpty())
                .limit(3).collect(Collectors.toList());
        assumeTrue(learners.size() == 3, "needs three learners in the development database");
        a = learners.get(0);
        b = learners.get(1);
        c = learners.get(2);
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    private static RequestPostProcessor as(String id, String role) {
        AuthenticatedUser u = new AuthenticatedUser(id + "@example.test", id, role);
        return authentication(new UsernamePasswordAuthenticationToken(u, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private static final RequestPostProcessor ADMIN = as("ADM_SUGGEST_TEST", "ADMIN");

    private ResultActions suggest(Student s, String topic, String details) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("topic", topic);
        body.put("details", details);
        body.put("format", "Online");
        return mvc.perform(post("/api/course-suggestions").contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)).with(as(s.getStudentId(), "STUDENT")));
    }

    private String created(Student s, String topic) throws Exception {
        String json = suggest(s, topic, "I want to build sales dashboards for my team.")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return (String) objectMapper.readValue(json, Map.class).get("suggestionId");
    }

    private void setStatus(String id, String status) throws Exception {
        mvc.perform(put("/api/admin/course-suggestions/" + id + "/status").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"" + status + "\"}").with(ADMIN))
                .andExpect(status().isOk());
    }

    private boolean notified(String userId, String type) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .anyMatch(n -> type.equals(n.getNotificationType()));
    }

    // ── The form ────────────────────────────────────────────────────────

    @Test
    void nonsenseIsTurnedAwayAtTheForm() throws Exception {
        suggest(a, "!!!", "I want to build sales dashboards.").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("TOPIC_INVALID"));
        suggest(a, "aaaaaa", "I want to build sales dashboards.").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("TOPIC_INVALID"));
        suggest(a, "Power BI", "dash").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("DETAILS_TOO_SHORT"));
        suggest(a, "C#", "Build desktop apps with .NET").andExpect(status().isOk());
    }

    @Test
    void aLearnerHasAtMostThreeOpenSuggestions() throws Exception {
        created(a, "Power BI");
        created(a, "SAP FICO");
        created(a, "Photoshop");
        suggest(a, "Blender", "Model and animate in 3D.").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("TOO_MANY_OPEN"));
    }

    @Test
    void onlyLearnersSuggest() throws Exception {
        mvc.perform(post("/api/course-suggestions").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topic\":\"Power BI\",\"details\":\"Build sales dashboards.\"}")
                        .with(as("TRN_SUGGEST_TEST", "TRAINER")))
                .andExpect(status().isForbidden());
    }

    // ── "Me too" ────────────────────────────────────────────────────────

    @Test
    void otherLearnersSeeASuggestionOnlyOnceAnAdministratorAcceptedIt() throws Exception {
        String id = created(a, "Power BI for finance");

        mvc.perform(get("/api/course-suggestions/similar").param("q", "powerbi").with(as(b.getStudentId(), "STUDENT")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.suggestionId == '" + id + "')]").isEmpty());
        mvc.perform(post("/api/course-suggestions/" + id + "/support").with(as(b.getStudentId(), "STUDENT")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("NOT_OPEN"));

        setStatus(id, "searching");
        mvc.perform(get("/api/course-suggestions/similar").param("q", "pwer bi").with(as(b.getStudentId(), "STUDENT")))
                .andExpect(jsonPath("$[?(@.suggestionId == '" + id + "')]").isNotEmpty());
        mvc.perform(post("/api/course-suggestions/" + id + "/support").with(as(b.getStudentId(), "STUDENT")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.supporters").value(2));
        mvc.perform(post("/api/course-suggestions/" + id + "/support").with(as(b.getStudentId(), "STUDENT")))
                .andExpect(jsonPath("$.supporters").value(2));

        // Administrators see who is behind it, not only its author.
        mvc.perform(get("/api/admin/course-suggestions").param("status", "searching").with(ADMIN))
                .andExpect(jsonPath("$[?(@.suggestionId == '" + id + "')].learners.length()").value(2))
                .andExpect(jsonPath("$[?(@.suggestionId == '" + id + "')].learners[0].studentId").value(a.getStudentId()))
                .andExpect(jsonPath("$[?(@.suggestionId == '" + id + "')].learners[0].author").value(true))
                .andExpect(jsonPath("$[?(@.suggestionId == '" + id + "')].learners[1].studentId").value(b.getStudentId()))
                .andExpect(jsonPath("$[?(@.suggestionId == '" + id + "')].learners[1].author").value(false));
    }

    @Test
    void onlyItsAuthorWithdrawsASuggestion() throws Exception {
        String id = created(a, "Photoshop");
        mvc.perform(delete("/api/course-suggestions/" + id).with(as(b.getStudentId(), "STUDENT")))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/course-suggestions/" + id).with(as(a.getStudentId(), "STUDENT")))
                .andExpect(status().isNoContent());
        assertEquals("withdrawn", suggestionRepository.findById(id).orElseThrow().getStatus());
    }

    // ── Answers ─────────────────────────────────────────────────────────

    @Test
    void publishingTellsEverySupporterAndRegistersTheirRequest() throws Exception {
        Course course = courseRepository.findAll().stream()
                .filter(x -> enrollmentRepository.findByStudentIdAndCourseId(a.getStudentId(), x.getCourseId()).isEmpty()
                        && enrollmentRepository.findByStudentIdAndCourseId(b.getStudentId(), x.getCourseId()).isEmpty())
                .findFirst().orElse(null);
        assumeTrue(course != null, "needs a course neither learner is enrolled in");
        course.setApprovalStatus("APPROVED");
        course.setIsPublished(true);
        course.setIsActive(true);
        courseRepository.saveAndFlush(course);

        String id = created(a, "Power BI");
        setStatus(id, "searching");
        service.support(b.getStudentId(), id);

        mvc.perform(post("/api/admin/course-suggestions/" + id + "/publish").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"courseId\":\"" + course.getCourseId() + "\"}").with(ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.told").value(2));

        for (Student s : List.of(a, b)) {
            assertTrue(notified(s.getStudentId(), "COURSE_SUGGESTION_PUBLISHED"));
            verify(emailService).sendSuggestedCourseAvailableEmail(eq(s.getEmail()), anyString(), eq("Power BI"), eq(course.getTitle()));
            assertTrue(interactionRepository.findByStudentIdAndCourseId(s.getStudentId(), course.getCourseId()).stream()
                    .anyMatch(i -> "clicked_interested".equals(i.getInteractionType())),
                    "their request for the new course is registered");
        }
        assertEquals("published", suggestionRepository.findById(id).orElseThrow().getStatus());
    }

    @Test
    void declineTellsTheLearnersAndNotACourseRequestTellsNobody() throws Exception {
        String declined = created(a, "Blender");
        setStatus(declined, "declined");
        assertTrue(notified(a.getStudentId(), "COURSE_SUGGESTION_DECLINED"));

        String noise = created(b, "qwerty asdf");
        setStatus(noise, "rejected");
        assertFalse(notified(b.getStudentId(), "COURSE_SUGGESTION_DECLINED"));
    }

    @Test
    void aDuplicateMergesItsSupportersIntoTheOther() throws Exception {
        String first = created(a, "Power BI");
        String second = created(b, "powerbi dashboards");
        mvc.perform(post("/api/admin/course-suggestions/" + second + "/merge").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"into\":\"" + first + "\"}").with(ADMIN))
                .andExpect(status().isOk());
        assertEquals("merged", suggestionRepository.findById(second).orElseThrow().getStatus());
        assertEquals(2L, service.listForAdmin("new").stream()
                .filter(m -> first.equals(m.get("suggestionId"))).findFirst().orElseThrow().get("supporters"));
    }

    // ── Searches that found nothing ─────────────────────────────────────

    private void searched(Student s, String query) {
        SearchLog l = new SearchLog();
        l.setSearchId("sl_test_" + UUID.randomUUID().toString().substring(0, 8));
        l.setStudentId(s.getStudentId());
        l.setQuery(query);
        l.setResultCount(0);
        searchLogRepository.saveAndFlush(l);
    }

    private Optional<Map<String, Object>> missed(String key) {
        return service.missedSearches(LocalDateTime.now().plusMinutes(1)).stream()
                .filter(m -> key.equals(m.get("key"))).findFirst();
    }

    @Test
    void missedSearchesAreGroupedAndShownOnceTwoLearnersMadeThem() throws Exception {
        searched(a, "Zorblax Studio");
        searched(a, "zorblax studio");
        searched(b, "Zorblax-Studio");
        searched(a, "zorblx studio");
        searched(c, "Qwvvxz");

        Map<String, Object> line = missed("zorblaxstudio").orElseThrow();
        assertEquals(2, line.get("learners"), "learners are counted, not searches");
        assertEquals(4, line.get("searches"));
        assertTrue(missed("qwvvxz").isEmpty(), "one learner's search never shows");

        mvc.perform(post("/api/admin/missed-searches/hide").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"term\":\"Zorblax Studio\"}").with(ADMIN))
                .andExpect(status().isNoContent());
        assertTrue(missed("zorblaxstudio").isEmpty(), "hidden for good, every spelling with it");
    }

    @Test
    void theSearchScreenRecordsHowManyCoursesItFound() throws Exception {
        mvc.perform(post("/api/searches/log").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"Zorblax\",\"resultCount\":0}").with(as(a.getStudentId(), "STUDENT")))
                .andExpect(status().isOk());
        assertTrue(searchLogRepository.findByStudentId(a.getStudentId()).stream()
                .anyMatch(l -> "Zorblax".equals(l.getQuery()) && Integer.valueOf(0).equals(l.getResultCount())));
    }
}
