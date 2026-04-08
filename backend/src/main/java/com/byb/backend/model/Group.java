package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

@Entity
@Table(name = "groups")
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class Group extends BaseEntity {

    @Id
    @Column(name = "group_id", length = 50)
    private String groupId;

    @Column(name = "course_id", length = 50, nullable = false)
    private String courseId;

    @Column(name = "trainer_id", length = 50, nullable = false)
    private String trainerId;

    @Column(name = "group_name", length = 255)
    private String groupName;

    @Column(name = "current_size")
    private Integer currentSize = 0;

    @Column(name = "max_size")
    private Integer maxSize = 30;

    @Column(name = "group_status", length = 20)
    private String groupStatus = "forming"; // forming, ready, active, completed, cancelled

    @Column(name = "start_date")
    private LocalDateTime startDate;

    @Column(name = "end_date")
    private LocalDateTime endDate;

    @Column(name = "meeting_schedule", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String meetingSchedule; // JSON: {"days": ["Monday", "Wednesday"], "time": "18:00"}

    @Column(name = "meeting_link", length = 500)
    private String meetingLink;

    @Column(name = "meeting_location", columnDefinition = "TEXT")
    private String meetingLocation;

    @Column(name = "is_online")
    private Boolean isOnline = true;

    @Column(name = "is_active")
    private Boolean isActive = true;
}