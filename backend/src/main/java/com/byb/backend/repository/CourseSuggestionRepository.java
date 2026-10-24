package com.byb.backend.repository;

import com.byb.backend.model.CourseSuggestion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface CourseSuggestionRepository extends JpaRepository<CourseSuggestion, String> {

    List<CourseSuggestion> findByStudentId(String studentId);

    List<CourseSuggestion> findByStatusIn(Collection<String> statuses);

    long countByStudentIdAndStatusIn(String studentId, Collection<String> statuses);
}
