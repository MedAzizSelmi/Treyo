package com.byb.backend.repository;

import com.byb.backend.model.CourseModule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ModuleRepository extends JpaRepository<CourseModule, String> {

    /** Public list — the trainer's module picker + student browse
     *  should both use this. Ordered by sort_order asc, then name. */
    @Query("SELECT m FROM CourseModule m WHERE m.isActive = true ORDER BY m.sortOrder ASC, m.name ASC")
    List<CourseModule> findActiveOrdered();

    /** Admin sees everything, including archived. */
    @Query("SELECT m FROM CourseModule m ORDER BY m.isActive DESC, m.sortOrder ASC, m.name ASC")
    List<CourseModule> findAllForAdmin();
}
