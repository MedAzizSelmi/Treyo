package com.byb.backend.controller;

import com.byb.backend.dto.auth.ChangePasswordRequest;
import com.byb.backend.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Authenticated account-management endpoints (password change, future 2FA, etc.).
 * Lives under /api/account/** so it inherits the catch-all .anyRequest().authenticated()
 * rule in SecurityConfig — unlike /api/auth/** which is permitAll for login/signup.
 */
@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
@Tag(name = "Account", description = "Authenticated account management")
@SecurityRequirement(name = "bearerAuth")
public class AccountController {

    private final AuthService authService;

    @PostMapping("/change-password")
    @Operation(summary = "Change password for the currently authenticated user")
    public ResponseEntity<Map<String, String>> changePassword(
            Authentication authentication,
            @Valid @RequestBody ChangePasswordRequest request
    ) {
        String email = authentication.getName();
        authService.changePassword(email, request.getCurrentPassword(), request.getNewPassword());
        return ResponseEntity.ok(Map.of("message", "Password updated successfully"));
    }
}
