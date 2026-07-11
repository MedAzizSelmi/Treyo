package com.byb.backend.service;

import com.byb.backend.model.FeedPost;
import com.byb.backend.model.FeedPostTranslation;
import com.byb.backend.repository.FeedPostRepository;
import com.byb.backend.repository.FeedPostTranslationRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Daily AI-generated feed posts.
 *
 * Architecture:
 *   - One Gemini call per day produces N posts in a structured JSON
 *     format. All users see the same posts — cheap, easy to moderate,
 *     and creates a shared community feed instead of isolated streams.
 *   - The cron fires at 06:00 server time. Manual {@link #generateBatch}
 *     endpoint exists for testing and to backfill the empty feed on
 *     first deploy.
 *   - If Gemini returns malformed JSON or the API quota is hit, we
 *     fall back to a small hard-coded seed pool so the feed is never
 *     empty in production.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FeedGenerationService {

    private final GeminiService geminiService;
    private final FeedPostRepository feedPostRepository;
    private final FeedPostTranslationRepository feedPostTranslationRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Languages we generate translations for after the English batch
     *  is created. English is implicit — the row itself is the source. */
    private static final Map<String, String> TARGET_LANGUAGES = Map.of(
            "fr", "French",
            "ar", "Arabic",
            "es", "Spanish"
    );

    /** The recipe we ask Gemini to follow. Strict JSON so we can parse
     *  without falling back to scraping fenced code blocks. */
    private static final String PROMPT = """
            You are the editorial AI for Treyo — a platform that connects students with professional trainers across domains like Web Development, Marketing, Design, Data Science, Mobile Development, Business, and Personal Development.

            Generate exactly 4 short feed posts that learners will see on their home screen today. Mix these categories:

            1. ONE "FUN_FACT" — a surprising "did you know?" about science, technology, learning, or human curiosity. Should make the reader smile or pause.
            2. TWO "DOMAIN_TIP" — actionable bite-sized tips. Pick two DIFFERENT training domains (e.g. one for Web Development, one for Marketing). Tip should be concrete enough to try today.
            3. ONE "MOTIVATION" — a short motivational thought or learning habit insight. Avoid clichés.

            Rules:
            - Titles: 3 to 8 words, punchy. No emojis.
            - Body: 30 to 60 words. Conversational, warm. No clichés like "the journey of a thousand miles".
            - For DOMAIN_TIP, set the "domain" field to a short domain name.
            - Keep it diverse from common AI-feed cliches.

            Reply with ONLY valid JSON in this exact shape — no prose, no markdown fences:
            {
              "posts": [
                { "category": "FUN_FACT", "title": "...", "body": "...", "domain": null },
                { "category": "DOMAIN_TIP", "title": "...", "body": "...", "domain": "Web Development" },
                { "category": "DOMAIN_TIP", "title": "...", "body": "...", "domain": "Marketing" },
                { "category": "MOTIVATION", "title": "...", "body": "...", "domain": null }
              ]
            }
            """;

    /** Visual styling kept on the row so the client doesn't need to
     *  switch on category. Same scheme as the rest of the app — green
     *  brand for core categories, yellow/blue accents for variety. */
    private String accentFor(FeedPost.Category c) {
        return switch (c) {
            case FUN_FACT -> "#FFD700";
            case DOMAIN_TIP -> "#7cce06";
            case MOTIVATION -> "#9b87ff";
            case NEWS -> "#7cce06";
        };
    }

    private String iconFor(FeedPost.Category c) {
        return switch (c) {
            case FUN_FACT -> "bulb";
            case DOMAIN_TIP -> "rocket";
            case MOTIVATION -> "heart";
            case NEWS -> "newspaper";
        };
    }

    /**
     * Daily cron — runs at 06:00 server time. Skips if today already
     * has posts (idempotent if the server restarts), so we don't
     * double-post on container redeploys.
     */
    @Scheduled(cron = "0 0 6 * * *")
    public void dailyJob() {
        LocalDateTime startOfToday = LocalDateTime.now().withHour(0).withMinute(0).withSecond(0);
        long todayCount = feedPostRepository.countByPublishedAtAfter(startOfToday);
        if (todayCount >= 3) {
            log.info("Feed: today already has {} posts, skipping daily generation", todayCount);
            return;
        }
        log.info("Feed: starting daily generation");
        generateBatch();
    }

    /**
     * Startup catch-up. If the backend was down when the 06:00 cron
     * should have fired, we'd otherwise leave the feed stale until
     * the next 6 AM. Running the same idempotent check at app boot
     * means a restart at 9 AM still backfills today's posts.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void runOnStartup() {
        try {
            dailyJob();
        } catch (Exception e) {
            log.warn("Startup feed generation failed: {}", e.getMessage());
        }
    }

    /**
     * Public entry point for manual generation. Called by the seed
     * endpoint on first deploy + safe to call again any time.
     * Returns the number of posts actually inserted.
     */
    @Transactional
    public int generateBatch() {
        List<FeedPost> posts;
        try {
            String json = geminiService.generateText(PROMPT, 1024, 0.95);
            posts = parsePosts(json);
        } catch (Exception e) {
            log.warn("Feed generation via Gemini failed ({}), falling back to seed pool", e.getMessage());
            posts = fallbackPosts();
        }

        int saved = 0;
        LocalDateTime now = LocalDateTime.now();
        List<FeedPost> savedPosts = new ArrayList<>();
        for (int i = 0; i < posts.size(); i++) {
            FeedPost p = posts.get(i);
            p.setPostId("fpost_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
            // Stagger publishedAt by 1 minute so they don't all sort
            // exactly equal — keeps the order stable across calls.
            p.setPublishedAt(now.minusMinutes(i));
            p.setLikesCount(0);
            p.setIsActive(true);
            p.setAccentColor(accentFor(p.getCategory()));
            p.setIcon(iconFor(p.getCategory()));
            feedPostRepository.save(p);
            savedPosts.add(p);
            saved++;
        }
        log.info("Feed: inserted {} posts", saved);

        // Translate the batch into every supported language. One
        // Gemini call per language so we get the whole batch back as
        // one JSON object — much cheaper than per-post calls. Failures
        // per language are logged but don't fail the whole job; readers
        // fall back to the English text if a translation is missing.
        for (Map.Entry<String, String> lang : TARGET_LANGUAGES.entrySet()) {
            try {
                translateBatch(savedPosts, lang.getKey(), lang.getValue());
            } catch (Exception e) {
                log.warn("Feed: translation to {} failed — {}", lang.getKey(), e.getMessage());
            }
        }
        return saved;
    }

    /** Translate one batch of posts into the target language and
     *  persist the results. Sends the whole batch in a single Gemini
     *  request so we can index responses by the post's ordinal. */
    private void translateBatch(List<FeedPost> sourcePosts, String langCode, String langName) throws Exception {
        // Build the input array — keep post IDs in the prompt so the
        // model has a stable key to echo back.
        ArrayNode input = objectMapper.createArrayNode();
        for (FeedPost p : sourcePosts) {
            ObjectNode item = objectMapper.createObjectNode();
            item.put("id", p.getPostId());
            item.put("title", p.getTitle());
            item.put("body", p.getBody());
            input.add(item);
        }
        String inputJson = objectMapper.writeValueAsString(input);

        String prompt = "Translate every title and body in the JSON below into " + langName +
                ". Preserve meaning, tone, and length. Do NOT translate proper nouns " +
                "(brand names, product names, technologies like 'JavaScript' or 'React').\n\n" +
                "Reply with ONLY a JSON array of objects, each with `id`, `title`, " +
                "and `body`. Same `id`s as the input. No prose, no markdown fences.\n\n" +
                "Input:\n" + inputJson;

        String response = geminiService.generateText(prompt, 2048, 0.3);
        String cleaned = stripFences(response);
        // The reply might be wrapped in {"translations":[...]} or be a
        // bare array — handle either.
        JsonNode root = objectMapper.readTree(cleaned);
        JsonNode arr = root.isArray() ? root : root.path("translations");
        if (!arr.isArray()) {
            throw new RuntimeException("translation response not an array");
        }

        int saved = 0;
        for (JsonNode node : arr) {
            String id = node.path("id").asText("");
            String title = node.path("title").asText("").trim();
            String body = node.path("body").asText("").trim();
            if (id.isEmpty() || title.isEmpty() || body.isEmpty()) continue;

            // Don't double-insert if we somehow run twice.
            if (feedPostTranslationRepository.findByPostIdAndLanguage(id, langCode).isPresent()) {
                continue;
            }
            FeedPostTranslation tr = new FeedPostTranslation();
            tr.setTranslationId("ftr_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
            tr.setPostId(id);
            tr.setLanguage(langCode);
            tr.setTitle(title);
            tr.setBody(body);
            feedPostTranslationRepository.save(tr);
            saved++;
        }
        log.info("Feed: saved {} {} translations", saved, langCode);
    }

    /** Parse Gemini's JSON, tolerating leading/trailing prose and
     *  ```json fences in case the model ignored the "no markdown"
     *  rule. */
    private List<FeedPost> parsePosts(String text) throws Exception {
        String cleaned = stripFences(text);
        JsonNode root = objectMapper.readTree(cleaned);
        JsonNode arr = root.path("posts");
        if (!arr.isArray()) throw new RuntimeException("posts field missing");

        List<FeedPost> out = new ArrayList<>();
        for (JsonNode node : arr) {
            String categoryStr = node.path("category").asText("DOMAIN_TIP").toUpperCase();
            FeedPost.Category category;
            try { category = FeedPost.Category.valueOf(categoryStr); }
            catch (IllegalArgumentException ex) { category = FeedPost.Category.DOMAIN_TIP; }

            String title = node.path("title").asText("").trim();
            String body = node.path("body").asText("").trim();
            if (title.isEmpty() || body.isEmpty()) continue;

            FeedPost p = new FeedPost();
            p.setCategory(category);
            p.setTitle(title);
            p.setBody(body);
            JsonNode domainNode = node.path("domain");
            if (!domainNode.isNull() && !domainNode.asText("").isBlank()) {
                p.setDomain(domainNode.asText().trim());
            }
            out.add(p);
        }
        if (out.isEmpty()) throw new RuntimeException("no valid posts parsed");
        return out;
    }

    /** Strip ```json … ``` fences and any surrounding prose, leaving
     *  just the JSON body. Gemini sometimes wraps even when told not
     *  to, so we defend against it. */
    private String stripFences(String raw) {
        String s = raw.trim();
        if (s.startsWith("```")) {
            int firstNl = s.indexOf('\n');
            if (firstNl > 0) s = s.substring(firstNl + 1);
            int lastFence = s.lastIndexOf("```");
            if (lastFence >= 0) s = s.substring(0, lastFence);
        }
        // If there's still prose around the JSON, trim to the outer
        // braces.
        int firstBrace = s.indexOf('{');
        int lastBrace = s.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            s = s.substring(firstBrace, lastBrace + 1);
        }
        return s.trim();
    }

    /** Backup pool for when Gemini fails. Curated by hand — not
     *  refreshed automatically, so the feed gradually goes stale if
     *  Gemini stays down. Keeps the app from looking empty though. */
    private List<FeedPost> fallbackPosts() {
        List<FeedPost> out = new ArrayList<>();
        out.add(make(FeedPost.Category.FUN_FACT, null,
                "The brain learns faster after 20 minutes",
                "Studies show short rest breaks of 10–20 minutes between focused study sessions can boost retention by up to 50%. The brain consolidates information during quiet moments — not just while studying."));
        out.add(make(FeedPost.Category.DOMAIN_TIP, "Web Development",
                "Console.dir beats console.log for objects",
                "Try console.dir(yourObject) next time you debug. It gives a fully interactive, expandable tree view instead of a string dump. A small habit change that saves real time."));
        out.add(make(FeedPost.Category.DOMAIN_TIP, "Marketing",
                "The 3-second hook rule",
                "Most viewers decide whether to keep watching a video in the first 3 seconds. Open with a question, a number, or a surprising claim — never with a logo or a title card."));
        out.add(make(FeedPost.Category.MOTIVATION, null,
                "Done beats perfect, today",
                "A finished imperfect project teaches you more than a perfect one still in your head. Today, ship the thing you've been refining. Polish version two."));
        return out;
    }

    private FeedPost make(FeedPost.Category cat, String domain, String title, String body) {
        FeedPost p = new FeedPost();
        p.setCategory(cat);
        p.setDomain(domain);
        p.setTitle(title);
        p.setBody(body);
        return p;
    }
}
