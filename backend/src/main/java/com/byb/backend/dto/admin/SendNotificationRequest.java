package com.byb.backend.dto.admin;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SendNotificationRequest {

    /** "ALL", "STUDENTS", "TRAINERS", "SPECIFIC" */
    private String recipientType;

    /** Only used when recipientType == "SPECIFIC" */
    private String targetUserId;

    /** "STUDENT" or "TRAINER" — only used when recipientType == "SPECIFIC" */
    private String targetUserType;

    private String title;
    private String message;

    /** "normal", "high", "urgent" */
    private String priority = "normal";
}
