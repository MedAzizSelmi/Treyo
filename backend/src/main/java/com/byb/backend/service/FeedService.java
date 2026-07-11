package com.byb.backend.service;

import com.byb.backend.model.FeedPost;
import com.byb.backend.model.FeedPostTranslation;
import com.byb.backend.model.FeedReaction;
import com.byb.backend.repository.FeedPostRepository;
import com.byb.backend.repository.FeedPostTranslationRepository;
import com.byb.backend.repository.FeedReactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Read + reaction layer for the daily feed.
 * Generation lives in {@link FeedGenerationService}.
 */
@Service
@RequiredArgsConstructor
public class FeedService {

    private final FeedPostRepository feedPostRepository;
    private final FeedReactionRepository feedReactionRepository;
    private final FeedPostTranslationRepository feedPostTranslationRepository;

    /** Paged feed for the mobile client.
     *  @param userId if supplied, response includes per-user liked/saved state
     *  @param lang   ISO 2-letter code ("fr", "ar", "es"). Anything else
     *                including null = serve the original English text. */
    public Map<String, Object> getFeed(String userId, String lang, int page, int size) {
        Page<FeedPost> posts = feedPostRepository.findActiveFeed(
                java.time.LocalDateTime.now(),
                PageRequest.of(page, size)
        );

        Set<String> likedPostIds = new HashSet<>();
        Set<String> savedPostIds = new HashSet<>();
        if (userId != null && !posts.isEmpty()) {
            List<String> ids = posts.stream().map(FeedPost::getPostId).toList();
            for (FeedReaction r : feedReactionRepository.findByUserIdAndPostIdIn(userId, ids)) {
                if (r.getType() == FeedReaction.Type.LIKE) likedPostIds.add(r.getPostId());
                if (r.getType() == FeedReaction.Type.SAVE) savedPostIds.add(r.getPostId());
            }
        }

        // Bulk-load translations for the requested language, then merge
        // them into each post on the way out. Missing translations fall
        // back to the English source — never an empty title.
        Map<String, FeedPostTranslation> translations = new HashMap<>();
        if (lang != null && !lang.isBlank() && !"en".equalsIgnoreCase(lang) && !posts.isEmpty()) {
            List<String> ids = posts.stream().map(FeedPost::getPostId).toList();
            for (FeedPostTranslation tr : feedPostTranslationRepository.findByPostIdInAndLanguage(ids, lang.toLowerCase())) {
                translations.put(tr.getPostId(), tr);
            }
        }

        List<Map<String, Object>> items = posts.getContent().stream().map(p -> {
            FeedPostTranslation tr = translations.get(p.getPostId());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("postId", p.getPostId());
            m.put("category", p.getCategory().name());
            m.put("domain", p.getDomain());
            m.put("title", tr != null ? tr.getTitle() : p.getTitle());
            m.put("body", tr != null ? tr.getBody() : p.getBody());
            m.put("accentColor", p.getAccentColor());
            m.put("icon", p.getIcon());
            m.put("publishedAt", p.getPublishedAt());
            m.put("likesCount", p.getLikesCount() == null ? 0 : p.getLikesCount());
            m.put("liked", likedPostIds.contains(p.getPostId()));
            m.put("saved", savedPostIds.contains(p.getPostId()));
            return m;
        }).toList();

        Map<String, Object> out = new HashMap<>();
        out.put("items", items);
        out.put("page", page);
        out.put("size", size);
        out.put("totalElements", posts.getTotalElements());
        out.put("hasMore", posts.hasNext());
        return out;
    }

    /** Every post a user has saved, newest first. Translated into
     *  `lang` if a translation exists; English otherwise. */
    public List<Map<String, Object>> getSavedPosts(String userId, String lang) {
        List<FeedReaction> saves = feedReactionRepository.findByUserIdAndType(userId, FeedReaction.Type.SAVE);
        List<String> ids = saves.stream().map(FeedReaction::getPostId).toList();
        if (ids.isEmpty()) return List.of();

        Map<String, FeedPostTranslation> translations = new HashMap<>();
        if (lang != null && !lang.isBlank() && !"en".equalsIgnoreCase(lang)) {
            for (FeedPostTranslation tr : feedPostTranslationRepository.findByPostIdInAndLanguage(ids, lang.toLowerCase())) {
                translations.put(tr.getPostId(), tr);
            }
        }

        return feedPostRepository.findAllById(ids).stream()
                .sorted(Comparator.comparing(FeedPost::getPublishedAt).reversed())
                .map(p -> {
                    FeedPostTranslation tr = translations.get(p.getPostId());
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("postId", p.getPostId());
                    m.put("category", p.getCategory().name());
                    m.put("domain", p.getDomain());
                    m.put("title", tr != null ? tr.getTitle() : p.getTitle());
                    m.put("body", tr != null ? tr.getBody() : p.getBody());
                    m.put("accentColor", p.getAccentColor());
                    m.put("icon", p.getIcon());
                    m.put("publishedAt", p.getPublishedAt());
                    m.put("likesCount", p.getLikesCount() == null ? 0 : p.getLikesCount());
                    return m;
                }).toList();
    }

    /** Toggle a reaction. Idempotent — calling twice clears the row,
     *  matching the heart-tap UX where every tap flips the state. */
    @Transactional
    public boolean toggleReaction(String userId, String postId, FeedReaction.Type type) {
        var existing = feedReactionRepository.findByUserIdAndPostIdAndType(userId, postId, type);
        if (existing.isPresent()) {
            feedReactionRepository.delete(existing.get());
            adjustLikeCount(postId, type, -1);
            return false;
        }
        FeedReaction r = new FeedReaction();
        r.setReactionId("rea_" + UUID.randomUUID().toString().replace("-", "").substring(0, 18));
        r.setUserId(userId);
        r.setPostId(postId);
        r.setType(type);
        feedReactionRepository.save(r);
        adjustLikeCount(postId, type, 1);
        return true;
    }

    private void adjustLikeCount(String postId, FeedReaction.Type type, int delta) {
        if (type != FeedReaction.Type.LIKE) return;
        feedPostRepository.findById(postId).ifPresent(p -> {
            int current = p.getLikesCount() == null ? 0 : p.getLikesCount();
            p.setLikesCount(Math.max(0, current + delta));
            feedPostRepository.save(p);
        });
    }
}
