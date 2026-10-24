package com.byb.backend.dto.student;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A learner's contact details — the first onboarding step, the same one
 * trainers have. Added in October 2026 because the automated group flow
 * has the admin phone learners who have not paid for their group, and
 * learners had never been asked for a number.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UpdateContactRequest {

    @NotBlank(message = "Phone number is required")
    private String phone;

    @NotBlank(message = "Home address is required")
    private String address;

    @NotBlank(message = "City is required")
    private String city;

    @NotBlank(message = "State is required")
    private String state;

    @NotBlank(message = "Postal code is required")
    private String postalCode;
}
