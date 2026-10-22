package com.byb.backend.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChangePasswordRequest {

    /**
     * One of these two proves it is the account holder: the current
     * password, or a code emailed for PASSWORD_SET. The code is how an
     * account created through Google or LinkedIn, which has no password
     * its owner knows, gets one. AccountController requires exactly one.
     */
    private String currentPassword;

    private String code;

    @NotBlank(message = "New password is required")
    @Size(min = 8, message = "New password must be at least 8 characters")
    private String newPassword;
}
