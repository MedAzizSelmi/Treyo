package com.byb.backend.dto.trainer;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TrainerProfilePage3Request {

    // Make it optional - remove @NotBlank
    private String profilePictureUrl; // Optional now!

    @NotBlank(message = "Bio is required")
    private String bio;
}