package com.byb.backend.controller;

import com.byb.backend.dto.recommendation.RecommendationResponse;
import com.byb.backend.service.MLRecommendationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/recommendations")
@RequiredArgsConstructor
@Tag(name = "Recommendations", description = "AI-powered course recommendations")
@SecurityRequirement(name = "bearerAuth")
public class RecommendationController {

    private final MLRecommendationService mlRecommendationService;

    @GetMapping("/student/{studentId}")
    @Operation(summary = "Get AI-powered recommendations for student")
    public ResponseEntity<RecommendationResponse> getRecommendations(
            @PathVariable String studentId,
            @RequestParam(defaultValue = "10") int count) {
        RecommendationResponse recommendations = mlRecommendationService.getRecommendations(studentId, count);
        return ResponseEntity.ok(recommendations);
    }

    @GetMapping("/cold-start")
    @Operation(summary = "Get recommendations for new student based on interests")
    public ResponseEntity<RecommendationResponse> getColdStartRecommendations(
            @RequestParam String interests,
            @RequestParam(defaultValue = "beginner") String level,
            @RequestParam(defaultValue = "10") int count) {
        RecommendationResponse recommendations =
                mlRecommendationService.getColdStartRecommendations(interests, level, count);
        return ResponseEntity.ok(recommendations);
    }
}