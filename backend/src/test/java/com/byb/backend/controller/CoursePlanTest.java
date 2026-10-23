package com.byb.backend.controller;

import com.byb.backend.config.FileStorageProperties;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.TrainerRepository;
import com.byb.backend.security.AuthenticatedUser;
import com.byb.backend.service.FileStorageService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Since the October 2026 review a trainer attaches the course's plan, not
 * the course: PDF, Word or PowerPoint only, and a course is not submitted
 * without one.
 *
 * The accepted upload writes a real file, which the test deletes; nothing
 * else here is stored.
 */
@SpringBootTest
@AutoConfigureMockMvc
class CoursePlanTest {

    @Autowired private MockMvc mvc;
    @Autowired private TrainerRepository trainerRepository;
    @Autowired private FileStorageService fileStorageService;
    @Autowired private FileStorageProperties storage;
    @Autowired private ObjectMapper objectMapper;

    private static RequestPostProcessor trainer(String id) {
        AuthenticatedUser user = new AuthenticatedUser(id + "@example.test", id, "TRAINER");
        return authentication(new UsernamePasswordAuthenticationToken(
                user, null, List.of(new SimpleGrantedAuthority("ROLE_TRAINER"))));
    }

    @Test
    void anArchiveIsNotAPlan() throws Exception {
        MockMultipartFile zip = new MockMultipartFile(
                "file", "course.zip", "application/zip", new byte[]{'P', 'K', 3, 4});
        mvc.perform(multipart("/api/files/upload/pending-material").file(zip).with(trainer("TRN_PLAN_TEST")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("The course plan must be a PDF, Word or PowerPoint document."));
    }

    @Test
    void aSlideDeckIsAccepted() throws Exception {
        // PowerPoint was refused before, though the app offered it.
        MockMultipartFile pptx = new MockMultipartFile("file", "plan.pptx",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation", new byte[]{1, 2, 3});
        String body = mvc.perform(multipart("/api/files/upload/pending-material").file(pptx).with(trainer("TRN_PLAN_TEST")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String stored = String.valueOf(objectMapper.readValue(body, Map.class).get("filePath"));
        fileStorageService.deleteFile(stored);
        // And the trainer's pending folder, which the upload created.
        java.nio.file.Files.deleteIfExists(java.nio.file.Paths.get(storage.getUploadDir())
                .resolve(stored).getParent());
    }

    @Test
    void aCourseIsNotSubmittedWithoutItsPlan() throws Exception {
        Trainer t = trainerRepository.findAll().stream().findFirst().orElse(null);
        assumeTrue(t != null, "needs a trainer in the development database");
        Map<String, Object> course = Map.of(
                "title", "Plan test", "description", "x", "domain", "Test", "specificTopic", "x",
                "level", "beginner", "durationHours", 2, "moduleId", "MOD_ANY");
        mvc.perform(post("/api/courses").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(course))
                        .with(trainer(t.getTrainerId())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Attach the course plan."));
    }
}
