package com.byb.backend.controller;

import com.byb.backend.dto.trainer.*;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.TrainerRepository;
import com.byb.backend.service.TrainerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/trainers")
@RequiredArgsConstructor
@Tag(name = "Trainer", description = "Trainer management endpoints")
@SecurityRequirement(name = "bearerAuth")
public class TrainerController {

    private final TrainerService trainerService;
    private final TrainerRepository trainerRepository;
    private final CourseRepository courseRepository;

    @GetMapping
    @Operation(summary = "Get all active trainers")
    public ResponseEntity<List<Map<String, Object>>> getAllTrainers() {
        List<Trainer> trainers = trainerRepository.findByIsActiveTrue();
        List<Map<String, Object>> result = trainers.stream().map(t -> {
            Map<String, Object> map = new java.util.LinkedHashMap<>();
            map.put("trainerId", t.getTrainerId());
            map.put("name", t.getName());
            map.put("email", t.getEmail());
            map.put("profilePictureUrl", t.getProfilePictureUrl());
            map.put("specializations", t.getSpecializations());
            map.put("skills", t.getSkills());
            map.put("experienceYears", t.getExperienceYears());
            map.put("bio", t.getBio());
            map.put("isVerified", t.getIsVerified());
            long coursesCount = courseRepository.countByTrainerId(t.getTrainerId());
            map.put("coursesCount", coursesCount);
            return map;
        }).collect(java.util.stream.Collectors.toList());
        return ResponseEntity.ok(result);
    }

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