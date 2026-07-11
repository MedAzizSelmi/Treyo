package com.byb.backend.repository;

import com.byb.backend.model.FeedPostTranslation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FeedPostTranslationRepository extends JpaRepository<FeedPostTranslation, String> {

    Optional<FeedPostTranslation> findByPostIdAndLanguage(String postId, String language);

    List<FeedPostTranslation> findByPostIdInAndLanguage(List<String> postIds, String language);
}
