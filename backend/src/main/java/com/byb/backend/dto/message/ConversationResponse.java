package com.byb.backend.dto.message;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Conversation summary DTO
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConversationResponse {
    private String conversationId;
    private String otherUserId;
    private String otherUserName;
    private String otherUserType; // STUDENT or TRAINER (or "group" for group chats)
    private String otherUserPhotoUrl;
    private String lastMessage;
    private LocalDateTime lastMessageTime;
    private Integer unreadCount;
    private Boolean isOnline; // For future presence feature

    // ── Group-chat fields ──
    // Populated when this conversation represents a group (course cohort
    // + trainer + admin), null/false for normal DMs. The mobile uses
    // `isGroup` to route taps to the group-chat screen instead of the
    // 1-to-1 conversation view.
    private Boolean isGroup;
    private String groupId;

    /** forming, ready, active, completed, cancelled. Groups only. */
    private String groupStatus;

    /**
     * Whether the chat still accepts messages.
     *
     * Derived server-side on purpose. sendGroupMessage refuses a group
     * that has completed or been cancelled, and a client that worked
     * that rule out for itself would eventually disagree with the
     * server — showing a composer that only fails once something has
     * been typed, which is exactly what the dashboard was doing.
     */
    private Boolean readOnly;
    private String courseTitle;   // shown as the conversation subtitle
    private Integer memberCount;  // students + trainer (admins not counted in the visible total)
}