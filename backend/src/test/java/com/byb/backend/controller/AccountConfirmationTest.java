package com.byb.backend.controller;

import com.byb.backend.security.AuthenticatedUser;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * How AccountController asks for proof on deletion and password changes:
 * a password or an emailed code, never neither and never both.
 *
 * Every request is refused before anything is written, against ids that
 * belong to nobody, so this is safe against a development database. The
 * code rules themselves are in ConfirmationCodeServiceTest.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AccountConfirmationTest {

    @Autowired
    private MockMvc mvc;

    private static RequestPostProcessor as(String userId, String role) {
        AuthenticatedUser user = new AuthenticatedUser(userId + "@example.test", userId, role);
        return authentication(new UsernamePasswordAuthenticationToken(
                user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private static RequestPostProcessor learner() { return as("STU_confirm_test", "STUDENT"); }
    private static RequestPostProcessor admin() { return as("ADM_confirm_test", "ADMIN"); }

    @Test
    void deletionNeedsAPasswordOrACode() throws Exception {
        mvc.perform(delete("/api/account").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .with(learner()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Confirmation required"));
    }

    @Test
    void aCodeThatWasNeverIssuedIsRefused() throws Exception {
        mvc.perform(delete("/api/account").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"123456\"}").with(learner()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Incorrect code"));
    }

    @Test
    void administratorsCannotDeleteThemselvesByCodeEither() throws Exception {
        mvc.perform(delete("/api/account").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"123456\"}").with(admin()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Not available for administrators"));
        mvc.perform(post("/api/account/confirmation-code").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"delete-account\"}").with(admin()))
                .andExpect(status().isForbidden());
    }

    @Test
    void unknownPurposeIsRefused() throws Exception {
        mvc.perform(post("/api/account/confirmation-code").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"anything\"}").with(learner()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void passwordChangeTakesExactlyOneProof() throws Exception {
        mvc.perform(post("/api/account/change-password").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPassword\":\"a-new-password\"}").with(learner()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Confirmation required"));
        mvc.perform(post("/api/account/change-password").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"x\",\"code\":\"123456\",\"newPassword\":\"a-new-password\"}")
                        .with(learner()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void passwordChangeRefusesACodeThatWasNeverIssued() throws Exception {
        mvc.perform(post("/api/account/change-password").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"123456\",\"newPassword\":\"a-new-password\"}")
                        .with(learner()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Incorrect code"));
    }
}
