package com.byb.backend.repository;

import com.byb.backend.model.FeedPost;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;

@Repository
public interface FeedPostRepository extends JpaRepository<FeedPost, String> {

    /** Paged feed: active posts that have already been published, pinned
     *  ones first, then newest first. */
    @Query("""
            SELECT p FROM FeedPost p
            WHERE p.isActive = true
              AND p.publishedAt <= :now
            ORDER BY CASE WHEN p.pinnedUntil IS NOT NULL AND p.pinnedUntil > :now THEN 0 ELSE 1 END,
                     p.publishedAt DESC
            """)
    Page<FeedPost> findActiveFeed(LocalDateTime now, Pageable pageable);

    long countByPublishedAtAfter(LocalDateTime threshold);

    /** Today's AI posts, leaving out introductions, which must not stand in for them. */
    long countByPublishedAtAfterAndCategoryNot(LocalDateTime threshold, FeedPost.Category category);

    java.util.List<FeedPost> findByTrainerIdAndCategoryAndIsActiveTrue(String trainerId, FeedPost.Category category);
}
