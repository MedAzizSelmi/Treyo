package com.byb.backend.repository;

import com.byb.backend.model.Student;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface StudentRepository extends JpaRepository<Student, String> {

    Optional<Student> findByEmail(String email);

    boolean existsByEmail(String email);

    Optional<Student> findByStudentId(String studentId);

    long countByCreatedAtAfter(LocalDateTime date);

    /** Active = logged in since the given timestamp. Used by the dashboard
     *  "Active Today" tile (passes today's 00:00 UTC). Derived query —
     *  Spring Data generates the SQL from the method name. */
    long countByLastLoginAtAfter(LocalDateTime date);
}