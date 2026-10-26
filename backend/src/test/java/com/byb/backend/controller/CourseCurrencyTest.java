package com.byb.backend.controller;

import com.byb.backend.model.Course;
import com.byb.backend.repository.CourseRepository;
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
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Courses are priced in dinars, the only currency ClicToPay charges in. An
 * approval used to take a currency, so a course approved in EUR showed
 * learners "100 EUR" and charged them 100 TND. Rolled back.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class CourseCurrencyTest {

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private CourseRepository courseRepository;

    @MockBean private EmailService emailService;
    @MockBean private PushNotificationService pushNotificationService;
    @MockBean private MLRecommendationService mlRecommendationService;

    private static final RequestPostProcessor ADMIN = authentication(new UsernamePasswordAuthenticationToken(
            new AuthenticatedUser("adm@example.test", "ADM_CURRENCY", "ADMIN"), null,
            List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

    @Test
    void aCourseIsApprovedInDinarsWhateverCurrencyIsSent() throws Exception {
        Course course = courseRepository.findAll().stream().findFirst().orElse(null);
        assumeTrue(course != null, "needs a course");
        course.setCurrency("EUR");
        course.setApprovalStatus("PENDING");
        courseRepository.saveAndFlush(course);

        mvc.perform(put("/api/admin/courses/" + course.getCourseId() + "/approve-trainer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "price", 100, "currency", "EUR", "trainerDailyRevenue", 50)))
                        .with(ADMIN))
                .andExpect(status().isOk());

        Course approved = courseRepository.findByCourseId(course.getCourseId()).orElseThrow();
        assertEquals("TND", approved.getCurrency());
        assertEquals(0, new BigDecimal("100").compareTo(approved.getPrice()));
    }
}
