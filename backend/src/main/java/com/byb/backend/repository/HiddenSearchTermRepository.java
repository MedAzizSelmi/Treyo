package com.byb.backend.repository;

import com.byb.backend.model.HiddenSearchTerm;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface HiddenSearchTermRepository extends JpaRepository<HiddenSearchTerm, String> {
}
