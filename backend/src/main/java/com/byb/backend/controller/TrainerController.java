package com.byb.backend.controller;

import com.byb.backend.dto.trainer.*;
import com.byb.backend.service.TrainerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/trainers")
@RequiredArgsConstructor
@Tag(name = "Trainer", description = "Trainer management endpoints")
@SecurityRequirement(name = "bearerAuth")
public class TrainerController {

    private final TrainerService trainerService;

    @GetMapping("/me")
    @Operation(summary = "Get current trainer profile")
    public ResponseEntity<TrainerProfileResponse> getMyProfile(
            @RequestParam String trainerId) {
        TrainerProfileResponse profile = trainerService.getProfile(trainerId);
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me/profile/page1")
    @Operation(summary = "Update trainer profile - Page 1 (Contact Info)")
    public ResponseEntity<TrainerProfileResponse> updateProfilePage1(
            @RequestParam String trainerId,
            @Valid @RequestBody TrainerProfilePage1Request request) {
        TrainerProfileResponse profile = trainerService.updateProfilePage1(trainerId, request);
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me/profile/page2")
    @Operation(summary = "Update trainer profile - Page 2 (Professional Info)")
    public ResponseEntity<TrainerProfileResponse> updateProfilePage2(
            @RequestParam String trainerId,
            @Valid @RequestBody TrainerProfilePage2Request request) {
        TrainerProfileResponse profile = trainerService.updateProfilePage2(trainerId, request);
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me/profile/page3")
    @Operation(summary = "Update trainer profile - Page 3 (Bio & Photo)")
    public ResponseEntity<TrainerProfileResponse> updateProfilePage3(
            @RequestParam String trainerId,
            @Valid @RequestBody TrainerProfilePage3Request request) {
        TrainerProfileResponse profile = trainerService.updateProfilePage3(trainerId, request);
        return ResponseEntity.ok(profile);
    }
}