package com.byb.backend.controller;

import com.byb.backend.dto.message.ConversationResponse;
import com.byb.backend.dto.message.MessageResponse;
import com.byb.backend.dto.message.SendMessageRequest;
import com.byb.backend.security.AuthenticatedUser;
import com.byb.backend.security.StompPrincipal;
import com.byb.backend.service.FileAccessService;
import com.byb.backend.service.MessageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;
import java.util.Map;

/**
 * Private messages between learners and trainers.
 *
 * ── Who the caller is, is never taken from the request ──────────────
 * Every endpoint here used to accept the user id as a parameter and act
 * on it without checking it against the signed-in account. That made the
 * whole surface readable and writable by anyone with any valid token:
 * `senderId` in the request body meant a message could be sent *as*
 * another person, and `?userId1=&userId2=` meant any two people's
 * conversation could be read by passing their ids.
 *
 * The identity now comes from the token, through FileAccessService, the
 * same way the rest of the codebase establishes a caller. Where an id
 * still appears in a path or query — the mobile client sends them, and
 * they are part of the published contract — it is checked against the
 * caller rather than trusted.
 *
 * Administrators are allowed through the read paths on purpose: support
 * and moderation need it. They cannot send as somebody else.
 */
@RestController
@RequestMapping("/api/messages")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Messages", description = "Student-Trainer messaging endpoints")
@SecurityRequirement(name = "bearerAuth")
public class MessageController {

    private final MessageService messageService;
    private final FileAccessService fileAccessService;

    /** Send a message. The sender is the caller, whatever the body says. */
    @PostMapping("/send")
    @Operation(summary = "Send a message")
    public ResponseEntity<?> sendMessage(@RequestBody SendMessageRequest request) {
        AuthenticatedUser caller = fileAccessService.caller().orElse(null);
        if (caller == null) return unauthenticated();

        if (request == null || isBlank(request.getReceiverId()) || isBlank(request.getContent())) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Recipient and content are required"));
        }
        if (request.getReceiverId().equals(caller.getUserId())) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "You cannot message yourself"));
        }

        // Overwritten, not validated: there is no legitimate reason for a
        // client to name a different sender, so the value is simply
        // replaced rather than rejected with a hint about what it checks.
        request.setSenderId(caller.getUserId());
        return ResponseEntity.ok(messageService.sendMessage(request));
    }


    /** A conversation, readable only by the two people in it. */
    @GetMapping("/conversation")
    @Operation(summary = "Get conversation between two users")
    public ResponseEntity<?> getConversation(
            @RequestParam String userId1,
            @RequestParam String userId2,
            @RequestParam(defaultValue = "50") int limit
    ) {
        AuthenticatedUser caller = fileAccessService.caller().orElse(null);
        if (caller == null) return unauthenticated();

        boolean isParticipant = caller.getUserId().equals(userId1)
                || caller.getUserId().equals(userId2);
        if (!isParticipant && !caller.isAdmin()) {
            return forbidden();
        }
        List<MessageResponse> messages =
                messageService.getConversation(userId1, userId2, limit);
        return ResponseEntity.ok(messages);
    }

    /** Someone's conversation list — their own, or an administrator's view. */
    @GetMapping("/conversations/{userId}")
    @Operation(summary = "Get all conversations for a user")
    public ResponseEntity<?> getUserConversations(@PathVariable String userId) {
        AuthenticatedUser caller = fileAccessService.caller().orElse(null);
        if (caller == null) return unauthenticated();
        if (!caller.getUserId().equals(userId) && !caller.isAdmin()) {
            return forbidden();
        }
        List<ConversationResponse> conversations = messageService.getUserConversations(userId);
        return ResponseEntity.ok(conversations);
    }

    /**
     * Mark one message read.
     *
     * Delegated to the service with the caller's id so the check happens
     * where the message is actually loaded — doing it here would mean
     * fetching the row twice.
     */
    @PutMapping("/{messageId}/read")
    @Operation(summary = "Mark message as read")
    public ResponseEntity<?> markAsRead(@PathVariable String messageId) {
        AuthenticatedUser caller = fileAccessService.caller().orElse(null);
        if (caller == null) return unauthenticated();
        boolean done = messageService.markAsReadFor(messageId, caller.getUserId());
        return done ? ResponseEntity.ok().build() : forbidden();
    }

    /** Mark a conversation read. Only your own unread count is yours to clear. */
    @PutMapping("/conversation/read")
    @Operation(summary = "Mark conversation as read")
    public ResponseEntity<?> markConversationAsRead(
            @RequestParam String conversationId,
            @RequestParam String userId
    ) {
        AuthenticatedUser caller = fileAccessService.caller().orElse(null);
        if (caller == null) return unauthenticated();
        if (!caller.getUserId().equals(userId)) return forbidden();

        messageService.markConversationAsRead(conversationId, userId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/unread/{userId}")
    @Operation(summary = "Get unread message count")
    public ResponseEntity<?> getUnreadCount(@PathVariable String userId) {
        AuthenticatedUser caller = fileAccessService.caller().orElse(null);
        if (caller == null) return unauthenticated();
        if (!caller.getUserId().equals(userId) && !caller.isAdmin()) {
            return forbidden();
        }
        return ResponseEntity.ok(Map.of("unreadCount", messageService.getUnreadCount(userId)));
    }

    /** Delete a message you sent. */
    @DeleteMapping("/{messageId}")
    @Operation(summary = "Delete a message you sent")
    public ResponseEntity<?> deleteMessage(@PathVariable String messageId) {
        AuthenticatedUser caller = fileAccessService.caller().orElse(null);
        if (caller == null) return unauthenticated();
        boolean done = messageService.deleteMessageFor(messageId, caller.getUserId(), caller.isAdmin());
        return done ? ResponseEntity.ok().build() : forbidden();
    }

    /**
     * Typing indicator for a group.
     *
     * Fanned out to each member's own destination rather than a shared
     * topic, so membership is still what decides who sees it — the
     * service drops anyone who does not belong to the group.
     */
    @MessageMapping("/typing")
    public void handleTypingIndicator(@Payload Map<String, String> payload, Principal principal) {
        if (!(principal instanceof StompPrincipal caller)) return;
        String groupId = payload == null ? null : payload.get("groupId");
        if (isBlank(groupId)) return;
        messageService.sendGroupTypingIndicator(caller.userId(), groupId);
    }

    // ── Group chat ──────────────────────────────────────────────────

    /**
     * Every message in a group's chat.
     *
     * Membership is enforced in the service, which admits enrolled
     * students, the group's trainer and administrators, and refuses
     * everyone else.
     *
     * {@code viewerId} stays in the signature because the dashboard and
     * the app both send it, but it is no longer what the check runs on —
     * the caller's own id is used instead, so passing somebody else's is
     * simply ineffective rather than a way in.
     */
    @GetMapping("/group/{groupId}")
    @Operation(summary = "Get all messages in a group chat")
    public ResponseEntity<?> getGroupMessages(
            @PathVariable String groupId,
            @RequestParam(required = false) String viewerId) {
        AuthenticatedUser caller = fileAccessService.caller().orElse(null);
        if (caller == null) return unauthenticated();
        return ResponseEntity.ok(
                messageService.getGroupMessages(groupId, caller.getUserId()));
    }

    /**
     * Post into a group's chat. The service rejects non-members and
     * empty content, and returns the saved message so the client can
     * settle its optimistic bubble.
     *
     * As with the direct-message path, the sender is the caller — a
     * senderId in the body is ignored rather than trusted.
     */
    @PostMapping("/group/{groupId}")
    @Operation(summary = "Send a message to a group chat")
    public ResponseEntity<?> sendGroupMessage(
            @PathVariable String groupId,
            @RequestBody Map<String, String> body) {
        AuthenticatedUser caller = fileAccessService.caller().orElse(null);
        if (caller == null) return unauthenticated();

        String content = body == null ? null : body.get("content");
        if (isBlank(content)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Message content is required"));
        }
        String messageType = body.getOrDefault("messageType", "text");
        String attachmentUrl = body.get("attachmentUrl");

        return ResponseEntity.ok(messageService.sendGroupMessage(
                caller.getUserId(), groupId, content, messageType, attachmentUrl));
    }

    // ── helpers ─────────────────────────────────────────────────────

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private ResponseEntity<?> unauthenticated() {
        return ResponseEntity.status(401).body(Map.of("error", "Not signed in"));
    }

    /**
     * 403 with no detail. Saying "that conversation isn't yours" would
     * confirm the conversation exists, which is the thing being withheld.
     */
    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(403).body(Map.of(
                "error", "Not available",
                "message", "You don't have access to that."));
    }
}
