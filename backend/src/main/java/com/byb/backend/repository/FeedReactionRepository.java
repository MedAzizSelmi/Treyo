package com.byb.backend.repository;

import com.byb.backend.model.FeedReaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FeedReactionRepository extends JpaRepository<FeedReaction, String> {

    Optional<FeedReaction> findByUserIdAndPostIdAndType(String userId, String postId, FeedReaction.Type type);

    List<FeedReaction> findByUserIdAndType(String userId, FeedReaction.Type type);

    List<FeedReaction> findByUserIdAndPostIdIn(String userId, List<String> postIds);
}
