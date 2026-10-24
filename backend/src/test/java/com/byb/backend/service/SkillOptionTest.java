package com.byb.backend.service;

import com.byb.backend.model.SkillOption;
import com.byb.backend.model.Student;
import com.byb.backend.repository.SkillOptionRepository;
import com.byb.backend.repository.StudentRepository;
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

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Skills learners choose at onboarding come from the administrators'
 * list: admins add, hide and delete them; learners get the offered ones and
 * can only save those. Against the development database, rolled back; the
 * test makes its own skills under a field and does not rely on the seed.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SkillOptionTest {

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SkillOptionRepository repository;
    @Autowired private StudentRepository studentRepository;

    @MockBean private EmailService emailService;
    @MockBean private PushNotificationService pushNotificationService;
    @MockBean private MLRecommendationService mlRecommendationService;

    private Student learner;

    private static RequestPostProcessor as(String id, String email, String role) {
        AuthenticatedUser u = new AuthenticatedUser(email, id, role);
        return authentication(new UsernamePasswordAuthenticationToken(u, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private static final RequestPostProcessor ADMIN = as("ADM_SKILL_TEST", "adm@example.test", "ADMIN");

    @BeforeEach
    void setUp() {
        learner = studentRepository.findAll().stream().filter(s -> s.getEmail() != null).findFirst().orElse(null);
        assumeTrue(learner != null, "needs a learner in the development database");
    }

    private String add(String field, String name, String nameFr) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("field", field);
        body.put("name", name);
        body.put("nameFr", nameFr);
        String json = mvc.perform(post("/api/admin/skills").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)).with(ADMIN))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return (String) objectMapper.readValue(json, Map.class).get("skillId");
    }

    private RequestPostProcessor me() {
        return as(learner.getStudentId(), learner.getEmail(), "STUDENT");
    }

    @Test
    void anAdministratorsNewSkillIsOfferedToLearnersAndHidingRemovesIt() throws Exception {
        String id = add("informatique", "Kubernetes Zeta", "Kubernetes Zêta");

        mvc.perform(get("/api/skills").param("fields", "informatique,design").with(me()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.skillId == '" + id + "')].nameFr").value("Kubernetes Zêta"));

        mvc.perform(put("/api/admin/skills/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"isActive\":false}").with(ADMIN))
                .andExpect(status().isOk());
        mvc.perform(get("/api/skills").param("fields", "informatique").with(me()))
                .andExpect(jsonPath("$[?(@.skillId == '" + id + "')]").isEmpty());
    }

    @Test
    void theSameSkillCannotBeAddedTwiceInAField() throws Exception {
        add("informatique", "Kubernetes Zeta", null);
        mvc.perform(post("/api/admin/skills").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"field\":\"informatique\",\"name\":\"kubernetes-zeta\"}").with(ADMIN))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("DUPLICATE"));
        mvc.perform(post("/api/admin/skills").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"field\":\"nowhere\",\"name\":\"Anything\"}").with(ADMIN))
                .andExpect(jsonPath("$.error").value("BAD_FIELD"));
    }

    @Test
    void learnersCanOnlySaveSkillsFromTheList() throws Exception {
        add("informatique", "Kubernetes Zeta", null);

        mvc.perform(put("/api/students/me/interests").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"primaryDomains\":[\"informatique\"],\"specificInterests\":[\"kubernetes zeta\"],\"experienceLevel\":\"beginner\"}")
                        .with(me()))
                .andExpect(status().isOk());
        assertArrayEquals(new String[]{"Kubernetes Zeta"},
                studentRepository.findByStudentId(learner.getStudentId()).orElseThrow().getSpecificInterests(),
                "saved under the list's own name");

        mvc.perform(put("/api/students/me/interests").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"primaryDomains\":[\"informatique\"],\"specificInterests\":[\"<b>anything I like</b>\"],\"experienceLevel\":\"beginner\"}")
                        .with(me()))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/students/me/interests").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"primaryDomains\":[\"design\"],\"specificInterests\":[\"Kubernetes Zeta\"],\"experienceLevel\":\"beginner\"}")
                        .with(me()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aSkillLearnersChoseIsHiddenNotDeleted() throws Exception {
        String id = add("informatique", "Kubernetes Zeta", null);
        learner.setPrimaryDomains(new String[]{"informatique"});
        learner.setSpecificInterests(new String[]{"Kubernetes Zeta"});
        studentRepository.saveAndFlush(learner);

        mvc.perform(delete("/api/admin/skills/" + id).with(ADMIN))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("IN_USE"));

        String unused = add("informatique", "Kubernetes Eta", null);
        mvc.perform(delete("/api/admin/skills/" + unused).with(ADMIN)).andExpect(status().isNoContent());
        assertTrue(repository.findById(unused).isEmpty());

        Map<String, Object> listed = objectMapper.readValue(mvc.perform(get("/api/admin/skills").with(ADMIN))
                .andReturn().getResponse().getContentAsString(), Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> mine = ((List<Map<String, Object>>) listed.get("skills")).stream()
                .filter(m -> id.equals(m.get("skillId"))).findFirst().orElseThrow();
        assertEquals(1, ((Number) mine.get("learners")).intValue());
    }

    @Test
    void generalSkillsAreSuggestedOnTheCvScreenButNeverOfferedToDevelop() throws Exception {
        String id = add("general", "Zeta Negotiation", null);

        mvc.perform(get("/api/skills/suggestions").with(me()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.skillId == '" + id + "')]").isNotEmpty());

        // Onboarding step 2 cannot be made to save one: 'general' is not a field.
        mvc.perform(put("/api/students/me/interests").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"primaryDomains\":[\"general\"],\"specificInterests\":[\"Zeta Negotiation\"],\"experienceLevel\":\"beginner\"}")
                        .with(me()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void experienceIsSavedAsEntriesAndAsTextForOlderScreens() throws Exception {
        String body = "{\"professionalExperience\":\"ignored when entries are sent\","
                + "\"experienceEntries\":[{\"organization\":\"BYB\",\"position\":\"Developer\",\"from\":\"2024-09\",\"to\":null},"
                + "{\"organization\":\"Vermeg\",\"position\":\"Intern\",\"from\":\"2022-02\",\"to\":\"2022-07\"}],"
                + "\"keySkills\":[\"C#\",\"Communication\"],\"educationLevel\":\"bachelor\"}";
        mvc.perform(put("/api/students/me/profile").contentType(MediaType.APPLICATION_JSON).content(body).with(me()))
                .andExpect(status().isOk());

        Student saved = studentRepository.findByStudentId(learner.getStudentId()).orElseThrow();
        assertEquals("Developer — BYB (09/2024 – present)\nIntern — Vermeg (02/2022 – 07/2022)", saved.getProfessionalExperience());
        mvc.perform(get("/api/students/me").with(me()))
                .andExpect(jsonPath("$.experienceEntries.length()").value(2))
                .andExpect(jsonPath("$.experienceEntries[0].organization").value("BYB"))
                .andExpect(jsonPath("$.experienceEntries[1].to").value("2022-07"));

        // An entry without its organisation is refused, not half-saved.
        mvc.perform(put("/api/students/me/profile").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"experienceEntries\":[{\"organization\":\"\",\"position\":\"Dev\",\"from\":\"2024-01\"}]}")
                        .with(me()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void onlyAdministratorsManageSkills() throws Exception {
        mvc.perform(post("/api/admin/skills").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"field\":\"informatique\",\"name\":\"Kubernetes Zeta\"}").with(me()))
                .andExpect(status().isForbidden());
    }
}
