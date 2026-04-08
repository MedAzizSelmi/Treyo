package com.byb.backend.controller;

import com.byb.backend.dto.student.StudentProfileResponse;
import com.byb.backend.dto.student.UpdateBasicProfileRequest;
import com.byb.backend.dto.student.UpdateInterestsRequest;
import com.byb.backend.dto.student.UpdateProfilePictureRequest;
import com.byb.backend.dto.student.UpdateStudentProfileRequest;
import com.byb.backend.service.StudentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/students")
@RequiredArgsConstructor
@Tag(name = "Student", description = "Student management endpoints")
@SecurityRequirement(name = "bearerAuth")
public class StudentController {

    private final StudentService studentService;

    @GetMapping("/me")
    @Operation(summary = "Get current student profile")
    public ResponseEntity<StudentProfileResponse> getMyProfile(Authentication authentication) {
        // Get studentId from JWT token (email is stored in authentication)
        String email = authentication.getName();
        StudentProfileResponse profile = studentService.getProfileByEmail(email);
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me/profile")
    @Operation(summary = "Update student profile — CV info (onboarding step 3)")
    public ResponseEntity<StudentProfileResponse> updateProfile(
            Authentication authentication,
            @Valid @RequestBody UpdateStudentProfileRequest request) {
        String email = authentication.getName();
        StudentProfileResponse profile = studentService.updateProfileByEmail(email, request);
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me/basic")
    @Operation(summary = "Update student name and bio")
    public ResponseEntity<StudentProfileResponse> updateBasicProfile(
            Authentication authentication,
            @RequestBody UpdateBasicProfileRequest request) {
        String email = authentication.getName();
        StudentProfileResponse profile = studentService.updateBasicProfileByEmail(email, request);
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me/profile-picture")
    @Operation(summary = "Update student profile picture URL")
    public ResponseEntity<StudentProfileResponse> updateProfilePicture(
            Authentication authentication,
            @RequestBody UpdateProfilePictureRequest request) {
        String email = authentication.getName();
        StudentProfileResponse profile = studentService.updateProfilePictureByEmail(email, request.getProfilePictureUrl());
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me/interests")
    @Operation(summary = "Update student interests (onboarding)")
    public ResponseEntity<StudentProfileResponse> updateInterests(
            Authentication authentication,
            @Valid @RequestBody UpdateInterestsRequest request) {
        // Get email from JWT token
        String email = authentication.getName();
        StudentProfileResponse profile = studentService.updateInterestsByEmail(email, request);
        return ResponseEntity.ok(profile);
    }
}