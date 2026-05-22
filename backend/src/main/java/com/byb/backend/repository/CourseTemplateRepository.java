package com.byb.backend.repository;

import com.byb.backend.model.CourseTemplate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CourseTemplateRepository extends JpaRepository<CourseTemplate, String> {

    Optional<CourseTemplate> findByTemplateId(String templateId);

    List<CourseTemplate> findByIsActiveTrueOrderByCreatedAtDesc();

    long countByIsActive(Boolean isActive);
}
