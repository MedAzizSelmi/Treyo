package com.byb.backend.repository;

import com.byb.backend.model.GroupReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface GroupReportRepository extends JpaRepository<GroupReport, String> {

    Optional<GroupReport> findByGroupId(String groupId);

    boolean existsByGroupId(String groupId);

    List<GroupReport> findByGroupIdIn(Collection<String> groupIds);
}
