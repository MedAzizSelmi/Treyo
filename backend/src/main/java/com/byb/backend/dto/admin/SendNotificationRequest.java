package com.byb.backend.dto.admin;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SendNotificationRequest {

    /** "ALL", "STUDENTS", "TRAINERS", "SPECIFIC", "GROUP" */
    private String recipientType;

    /** Only used when recipientType == "GROUP": a running group (ready or active). */
    private String targetGroupId;

    /** With "GROUP": also send it to the trainer who runs the group. Default true. */
    private Boolean includeTrainer;

    /** Only used when recipientType == "SPECIFIC" */
    private String targetUserId;

    /** "STUDENT" or "TRAINER" — only used when recipientType == "SPECIFIC" */
    private String targetUserType;

    private String title;
    private String message;

    /** "normal", "high", "urgent" */
    private String priority = "normal";
}
