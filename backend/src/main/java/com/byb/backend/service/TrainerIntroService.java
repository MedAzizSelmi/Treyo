package com.byb.backend.service;

import com.byb.backend.model.FeedPost;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.FeedPostRepository;
import com.byb.backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Introducing a new trainer to learners, in the feed rather than by
 * notification (October 2026): a notification interrupts for something
 * nobody asked about, and learners who get one per trainer learn to ignore
 * them — including the ones about their groups and payments.
 *
 * An administrator publishes it from the dashboard with a short
 * introduction. Only for an approved trainer with at least one published
 * course, so the post leads to something a learner can ask to join; once
 * per trainer while it is up. It stays first in the feed for
 * {@link #PINNED_FOR}, translated into the app's languages, and its card
 * opens the trainer's profile. No push.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TrainerIntroService {

    static final Duration PINNED_FOR = Duration.ofDays(3);
    static final int INTRO_MIN = 20;
    static final int INTRO_MAX = 400;

    private final TrainerRepository trainerRepository;
    private final CourseRepository courseRepository;
    private final FeedPostRepository feedPostRepository;
    private final FeedGenerationService feedGenerationService;

    /** A refusal the dashboard shows as it is. */
    public static class IntroException extends RuntimeException {
        private final String code;

        public IntroException(String code, String message) {
            super(message);
            this.code = code;
        }

        public String getCode() {
            return code;
        }
    }

    /** Courses of the trainer a learner can open and ask to join. */
    public static long publishedCourses(CourseRepository courses, String trainerId) {
        return CourseService.openCourseCount(courses, trainerId);
    }

    /** Whether the trainer can be introduced now, and their introduction if one is up. */
    public Map<String, Object> status(String trainerId) {
        Trainer t = trainer(trainerId);
        Map<String, Object> m = new LinkedHashMap<>();
        long courses = publishedCourses(courseRepository, trainerId);
        Optional<FeedPost> current = current(trainerId);
        String reason = !"APPROVED".equalsIgnoreCase(t.getApprovalStatus()) || !Boolean.TRUE.equals(t.getIsActive())
                ? "NOT_APPROVED"
                : courses == 0 ? "NO_COURSE"
                : current.isPresent() ? "ALREADY" : null;
        m.put("canIntroduce", reason == null);
        m.put("reason", reason);
        m.put("publishedCourses", courses);
        m.put("defaultIntro", defaultIntro(t));
        current.ifPresent(p -> {
            Map<String, Object> post = new LinkedHashMap<>();
            post.put("postId", p.getPostId());
            post.put("body", p.getBody());
            post.put("publishedAt", p.getPublishedAt());
            post.put("pinnedUntil", p.getPinnedUntil());
            post.put("likesCount", p.getLikesCount() == null ? 0 : p.getLikesCount());
            m.put("post", post);
        });
        return m;
    }

    @Transactional
    public FeedPost publish(String trainerId, String intro, LocalDateTime now) {
        Trainer t = trainer(trainerId);
        if (!"APPROVED".equalsIgnoreCase(t.getApprovalStatus()) || !Boolean.TRUE.equals(t.getIsActive())) {
            throw new IntroException("NOT_APPROVED", "Only an approved, active trainer can be introduced.");
        }
        if (publishedCourses(courseRepository, trainerId) == 0) {
            throw new IntroException("NO_COURSE",
                    "Introduce the trainer once they have a published course, so learners have something to join.");
        }
        if (current(trainerId).isPresent()) {
            throw new IntroException("ALREADY", "This trainer is already introduced in the feed.");
        }
        String text = intro == null ? "" : intro.trim().replaceAll("\\s+", " ");
        if (text.length() < INTRO_MIN || text.length() > INTRO_MAX) {
            throw new IntroException("INTRO_LENGTH",
                    "The introduction needs " + INTRO_MIN + " to " + INTRO_MAX + " characters.");
        }

        FeedPost p = new FeedPost();
        p.setPostId("fp_" + UUID.randomUUID().toString().replace("-", "").substring(0, 18));
        p.setCategory(FeedPost.Category.NEW_TRAINER);
        p.setTrainerId(trainerId);
        // The app titles the card itself ("Meet …") in its own language;
        // this is for the dashboard and anything reading the row as is.
        p.setTitle("Meet " + t.getName());
        p.setBody(text);
        p.setDomain(t.getSpecializations() != null && t.getSpecializations().length > 0 ? t.getSpecializations()[0] : null);
        p.setAccentColor("#7cce06");
        p.setIcon("person-add");
        p.setPublishedAt(now);
        p.setPinnedUntil(now.plus(PINNED_FOR));
        p.setLikesCount(0);
        p.setIsActive(true);
        p = feedPostRepository.save(p);

        // Into every language the app speaks; the text as written if that fails.
        feedGenerationService.translateWrittenPost(p);
        log.info("Feed: introduced trainer {} in {}", trainerId, p.getPostId());
        return p;
    }

    /** Takes an introduction out of the feed. The trainer can be introduced again afterwards. */
    @Transactional
    public void remove(String postId) {
        FeedPost p = feedPostRepository.findById(postId)
                .orElseThrow(() -> new IntroException("NOT_FOUND", "Post not found."));
        if (p.getCategory() != FeedPost.Category.NEW_TRAINER) {
            throw new IntroException("NOT_AN_INTRO", "Only trainer introductions are removed here.");
        }
        p.setIsActive(false);
        p.setPinnedUntil(null);
        feedPostRepository.save(p);
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    private Trainer trainer(String trainerId) {
        return trainerRepository.findByTrainerId(trainerId)
                .orElseThrow(() -> new IntroException("NOT_FOUND", "Trainer not found."));
    }

    private Optional<FeedPost> current(String trainerId) {
        return feedPostRepository.findByTrainerIdAndCategoryAndIsActiveTrue(trainerId, FeedPost.Category.NEW_TRAINER)
                .stream().findFirst();
    }

    /** The bio's opening sentences, for the dashboard to start from. */
    static String defaultIntro(Trainer t) {
        String bio = t.getBio() == null ? "" : t.getBio().trim().replaceAll("\\s+", " ");
        if (bio.isEmpty()) return "";
        if (bio.length() <= 250) return bio;
        int cut = bio.lastIndexOf(". ", 250);
        return cut > 80 ? bio.substring(0, cut + 1) : bio.substring(0, 247) + "…";
    }
}
