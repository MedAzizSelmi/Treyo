package com.byb.backend.service;

import com.byb.backend.dto.recommendation.RecommendationResponse;
import com.byb.backend.model.Course;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.EnrollmentRepository;
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
    // Live enrolled-count source — same source the course-detail
    // screen uses, so the recommendation card and the detail page
    // always agree.
    private final EnrollmentRepository enrollmentRepository;

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

    /**
     * Call the FastAPI cold-start endpoint. Field names MUST match the
     * ColdStartRequest Pydantic model in ml-service/main.py:
     *   student_interests, student_level, student_domains, n_recommendations
     * (The previous "interests"/"level" names caused 422 validation errors.)
     *
     * @param domains comma-separated primary_domains, e.g. "informatique,design".
     *                Optional — when null/blank the ranker falls back to pure
     *                content/rating scoring without the hard domain gate.
     */
    public RecommendationResponse getColdStartRecommendations(
            String interests, String level, int count, String domains) {
        try {
            String url = mlServiceUrl + "/recommendations/cold-start";

            Map<String, Object> request = new HashMap<>();
            request.put("student_interests", interests);
            request.put("student_level", level);
            request.put("n_recommendations", count);
            if (domains != null && !domains.isBlank()) {
                request.put("student_domains", domains);
            }

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

    // Backwards-compat overload for any caller still passing the 3-arg form.
    public RecommendationResponse getColdStartRecommendations(String interests, String level, int count) {
        return getColdStartRecommendations(interests, level, count, null);
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

                    // Prefer the live DB value for rating + enrolled
                    // count over what the ML service cached. The ML
                    // model refreshes on a schedule (every X min), so
                    // reviews submitted between refreshes would
                    // otherwise show stale stars/numbers. Falling back
                    // to the ML value only if the course row is missing.
                    java.math.BigDecimal liveRating = course != null
                            ? course.getAverageRating()
                            : null;
                    if (liveRating == null && rec.get("rating") != null) {
                        liveRating = java.math.BigDecimal.valueOf((Double) rec.get("rating"));
                    }
                    // `Course.totalEnrolled` is never auto-bumped on
                    // the enrollment table — every other read path
                    // computes it dynamically. Match that here so
                    // recommendation cards show the same number as
                    // course-detail's "X enrolled" pill.
                    int liveEnrolled = course != null
                            ? (int) enrollmentRepository.countByCourseId(course.getCourseId())
                            : 0;

                    return RecommendationResponse.RecommendedCourse.builder()
                            .courseId(courseId)
                            .title((String) rec.get("title"))
                            .domain((String) rec.get("domain"))
                            .specificTopic((String) rec.get("specific_topic"))
                            .level((String) rec.get("level"))
                            .rating(liveRating)
                            // Mirror to averageRating so the mobile (which
                            // already reads `course.averageRating`) gets
                            // the value without a second client-side
                            // normalisation step.
                            .averageRating(liveRating)
                            .score((Double) rec.get("score"))
                            .reason((String) rec.get("reason"))
                            .trainerId(course != null ? course.getTrainerId() : null)
                            .trainerName(trainer != null ? trainer.getName() : null)
                            .price(course != null ? course.getPrice() : null)
                            .durationHours(course != null ? course.getDurationHours() : null)
                            .totalEnrolled(liveEnrolled)
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