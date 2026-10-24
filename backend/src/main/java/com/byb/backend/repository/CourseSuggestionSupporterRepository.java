package com.byb.backend.repository;

import com.byb.backend.model.CourseSuggestionSupporter;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CourseSuggestionSupporterRepository extends JpaRepository<CourseSuggestionSupporter, String> {

    List<CourseSuggestionSupporter> findBySuggestionId(String suggestionId);

    List<CourseSuggestionSupporter> findByStudentId(String studentId);

    Optional<CourseSuggestionSupporter> findBySuggestionIdAndStudentId(String suggestionId, String studentId);

    long countBySuggestionId(String suggestionId);
}
