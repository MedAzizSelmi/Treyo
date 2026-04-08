package com.byb.backend.service;

import com.byb.backend.dto.recommendation.RecommendationResponse;
import com.byb.backend.model.Course;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MLRecommendationService {

    private final WebClient.Builder webClientBuilder;
    private final CourseRepository courseRepository;
    private final TrainerRepository trainerRepository;

    @Value("${ml.service.url}")
    private String mlServiceUrl;

    public RecommendationResponse getRecommendations(String studentId, int count) {
        try {
            // Call FastAPI ML service
            String url = mlServiceUrl + "/recommendations/" + studentId + "?n=" + count;

            WebClient webClient = webClientBuilder.build();

            Map<String, Object> mlResponse = webClient.get()
                    .uri(url)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            if (mlResponse == null) {
                throw new RuntimeException("No response from ML service");
            }

            // Parse ML response
            return parseMLResponse(mlResponse);

        } catch (Exception e) {
            throw new RuntimeException("Failed to get recommendations from ML service: " + e.getMessage());
        }
    }

    public RecommendationResponse getColdStartRecommendations(String interests, String level, int count) {
        try {
            String url = mlServiceUrl + "/recommendations/cold-start";

            Map<String, Object> request = new HashMap<>();
            request.put("interests", interests);
            request.put("level", level);
            request.put("n_recommendations", count);

            WebClient webClient = webClientBuilder.build();

            Map<String, Object> mlResponse = webClient.post()
                    .uri(url)
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            if (mlResponse == null) {
                throw new RuntimeException("No response from ML service");
            }

            return parseMLResponse(mlResponse);

        } catch (Exception e) {
            throw new RuntimeException("Failed to get cold-start recommendations: " + e.getMessage());
        }
    }

    public void trackInteraction(String studentId, String courseId, String interactionType) {
        try {
            String url = mlServiceUrl + "/interactions/track";

            Map<String, String> request = new HashMap<>();
            request.put("student_id", studentId);
            request.put("course_id", courseId);
            request.put("interaction_type", interactionType);

            WebClient webClient = webClientBuilder.build();

            webClient.post()
                    .uri(url)
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(Void.class)
                    .block();

        } catch (Exception e) {
            // Log error but don't fail the request
            System.err.println("Failed to track interaction: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private RecommendationResponse parseMLResponse(Map<String, Object> mlResponse) {
        String studentId = (String) mlResponse.get("student_id");
        List<Map<String, Object>> recommendations = (List<Map<String, Object>>) mlResponse.get("recommendations");
        Integer totalRecommended = (Integer) mlResponse.get("total_recommended");
        String generatedAt = (String) mlResponse.get("generated_at");

        List<RecommendationResponse.RecommendedCourse> courses = recommendations.stream()
                .map(rec -> {
                    String courseId = (String) rec.get("course_id");

                    // Get course and trainer details from database
                    Course course = courseRepository.findByCourseId(courseId).orElse(null);
                    Trainer trainer = null;
                    if (course != null) {
                        trainer = trainerRepository.findByTrainerId(course.getTrainerId()).orElse(null);
                    }

                    return RecommendationResponse.RecommendedCourse.builder()
                            .courseId(courseId)
                            .title((String) rec.get("title"))
                            .domain((String) rec.get("domain"))
                            .specificTopic((String) rec.get("specific_topic"))
                            .level((String) rec.get("level"))
                            .rating(rec.get("rating") != null ?
                                    java.math.BigDecimal.valueOf((Double) rec.get("rating")) : null)
                            .score((Double) rec.get("score"))
                            .reason((String) rec.get("reason"))
                            .trainerId(course != null ? course.getTrainerId() : null)
                            .trainerName(trainer != null ? trainer.getName() : null)
                            .price(course != null ? course.getPrice() : null)
                            .durationHours(course != null ? course.getDurationHours() : null)
                            .build();
                })
                .collect(Collectors.toList());

        return RecommendationResponse.builder()
                .studentId(studentId)
                .recommendations(courses)
                .totalRecommended(totalRecommended)
                .generatedAt(generatedAt)
                .build();
    }
}