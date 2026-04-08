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
}