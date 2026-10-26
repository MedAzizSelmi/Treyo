package com.byb.backend.repository;

import com.byb.backend.model.GroupReportLearner;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface GroupReportLearnerRepository extends JpaRepository<GroupReportLearner, String> {

    List<GroupReportLearner> findByReportId(String reportId);

    Optional<GroupReportLearner> findByEnrollmentId(String enrollmentId);

    List<GroupReportLearner> findByEnrollmentIdIn(Collection<String> enrollmentIds);
}
