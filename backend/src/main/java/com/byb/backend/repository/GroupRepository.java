package com.byb.backend.repository;

import com.byb.backend.model.Group;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GroupRepository extends JpaRepository<Group, String> {

    Optional<Group> findByGroupId(String groupId);

    List<Group> findByCourseId(String courseId);

    List<Group> findByTrainerId(String trainerId);

    long countByGroupStatus(String groupStatus);

    @Query("SELECT AVG(g.currentSize) FROM Group g WHERE g.groupStatus = 'active'")
    Double getAverageGroupSize();

    int countByCourseId(String courseId);

    @Query("SELECT g FROM Group g WHERE g.courseId = :courseId AND g.groupStatus = 'forming'")
    Optional<Group> findFormingGroupByCourse(String courseId);

    @Query("SELECT g FROM Group g WHERE g.trainerId = :trainerId AND g.groupStatus = 'active'")
    List<Group> findActiveGroupsByTrainer(String trainerId);
}