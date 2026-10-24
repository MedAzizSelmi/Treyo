package com.byb.backend.repository;

import com.byb.backend.model.SkillOption;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface SkillOptionRepository extends JpaRepository<SkillOption, String> {

    List<SkillOption> findByFieldInAndIsActiveTrue(Collection<String> fields);

    List<SkillOption> findByField(String field);

    List<SkillOption> findByIsActiveTrue();

    /** How many learners chose each skill, by the name stored on their profile. */
    @Query(value = "SELECT skill, COUNT(*) FROM students, unnest(specific_interests) AS skill GROUP BY skill",
            nativeQuery = true)
    List<Object[]> countLearnersBySkill();
}
