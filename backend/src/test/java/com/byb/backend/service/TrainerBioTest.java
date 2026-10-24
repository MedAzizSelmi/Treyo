package com.byb.backend.service;

import com.byb.backend.model.Trainer;
import com.byb.backend.repository.TrainerRepository;
import com.byb.backend.security.AuthenticatedUser;
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
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A trainer's bio has at least BIO_MIN characters, not counting surrounding spaces. Rolled back. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class TrainerBioTest {

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private TrainerRepository trainerRepository;

    @MockBean private EmailService emailService;
    @MockBean private PushNotificationService pushNotificationService;
    @MockBean private MLRecommendationService mlRecommendationService;

    @Test
    void aShortBioIsRefusedAndALongEnoughOneSaved() throws Exception {
        Trainer trainer = trainerRepository.findAll().stream().findFirst().orElse(null);
        assumeTrue(trainer != null, "needs a trainer in the development database");
        AuthenticatedUser me = new AuthenticatedUser(trainer.getEmail(), trainer.getTrainerId(), "TRAINER");
        var as = authentication(new UsernamePasswordAuthenticationToken(me, null, List.of(new SimpleGrantedAuthority("ROLE_TRAINER"))));

        String fifty = "I teach Java and Spring to beginners, step by step.";      // 51 characters
        String padded = "   " + "x".repeat(TrainerService.BIO_MIN - 1) + "   ";
        String enough = "I have taught Java and Spring Boot for six years, to beginners and teams, "
                + "with projects learners keep after the course.";

        for (String bio : List.of(fifty, padded)) {
            mvc.perform(put("/api/trainers/me/profile/page3").contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of("bio", bio))).with(as))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(put("/api/trainers/me/profile/page3").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("bio", "  " + enough + "  "))).with(as))
                .andExpect(status().isOk());
        assertEquals(enough, trainerRepository.findByTrainerId(trainer.getTrainerId()).orElseThrow().getBio(), "saved trimmed");
    }
}
