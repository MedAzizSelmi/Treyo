package com.byb.backend.dto.auth;

import com.byb.backend.model.Role;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {

    private String token;
    private String refreshToken;
    private String userId;
    private String email;
    private String name;
    private Role role;
    private boolean onboardingComplete;

    /**
     * True when the password was right but a TOTP code is still owed.
     * In that case `token` and `refreshToken` are deliberately absent —
     * the caller gets `challengeToken` instead and must exchange it at
     * /api/auth/2fa/verify. Nothing here grants access on its own.
     */
    private boolean twoFactorRequired;

    /** Short-lived proof that the first factor passed. Five minutes. */
    private String challengeToken;
}