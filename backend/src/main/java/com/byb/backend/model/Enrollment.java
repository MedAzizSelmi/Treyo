package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "enrollments")
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class Enrollment extends BaseEntity {

    @Id
    @Column(name = "enrollment_id", length = 50)
    private String enrollmentId;

    @Column(name = "student_id", length = 50, nullable = false)
    private String studentId;

    @Column(name = "course_id", length = 50, nullable = false)
    private String courseId;

    @Column(name = "group_id", length = 50)
    private String groupId;

    @Column(name = "enrollment_status", length = 20)
    private String enrollmentStatus = "pending"; // pending, confirmed, active, completed, dropped

    @Column(name = "payment_status", length = 20)
    private String paymentStatus = "unpaid"; // unpaid, paid, partial, refunded

    @Column(name = "amount_paid", precision = 10, scale = 2)
    private BigDecimal amountPaid = BigDecimal.ZERO;

    @Column(name = "progress_percentage", precision = 5, scale = 2)
    private BigDecimal progressPercentage = BigDecimal.ZERO;

    @Column(name = "sessions_attended")
    private Integer sessionsAttended = 0;

    @Column(name = "total_sessions")
    private Integer totalSessions = 0;

    @Column(name = "enrolled_at")
    private LocalDateTime enrolledAt;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "last_accessed_at")
    private LocalDateTime lastAccessedAt;
}