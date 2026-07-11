package com.byb.backend.repository;

import com.byb.backend.model.SearchLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SearchLogRepository extends JpaRepository<SearchLog, String> {
}
