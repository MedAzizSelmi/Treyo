package com.byb.backend.controller;

import com.byb.backend.dto.message.ConversationResponse;
import com.byb.backend.dto.message.MessageResponse;
import com.byb.backend.dto.message.SendMessageRequest;
import com.byb.backend.service.MessageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/messages")
@RequiredArgsConstructor
@Tag(name = "Messages", description = "Student-Trainer messaging endpoints")
public class MessageController {

    private final MessageService messageService;

    /**
     * Send a message (REST endpoint)
     */
    @PostMapping("/send")
    @Operation(summary = "Send a message")
    public ResponseEntity<MessageResponse> sendMessage(@RequestBody SendMessageRequest request) {
        MessageResponse message = messageService.sendMessage(request);
        return ResponseEntity.ok(message);
    }

    /**
     * Send a message (WebSocket endpoint)
     * Client sends to: /app/chat
     */
    @MessageMapping("/chat")
    public void sendMessageViaWebSocket(@Payload SendMessageRequest message) {
        // Service handles WebSocket delivery
        messageService.sendMessage(message);
    }

    /**
     * Get conversation between two users
     */
    @GetMapping("/conversation")
    @Operation(summary = "Get conversation between two users")
    public ResponseEntity<List<MessageResponse>> getConversation(
            @RequestParam String userId1,
            @RequestParam String userId2,
            @RequestParam(defaultValue = "50") int limit
    ) {
        List<MessageResponse> messages = messageService.getConversation(userId1, userId2, limit);
        return ResponseEntity.ok(messages);
    }

    /**
     * Get all conversations for a user
     */
    @GetMapping("/conversations/{userId}")
    @Operation(summary = "Get all conversations for a user")
    public ResponseEntity<List<ConversationResponse>> getUserConversations(@PathVariable String userId) {
        List<ConversationResponse> conversations = messageService.getUserConversations(userId);
        return ResponseEntity.ok(conversations);
    }

    /**
     * Mark message as read
     */
    @PutMapping("/{messageId}/read")
    @Operation(summary = "Mark message as read")
    public ResponseEntity<Void> markAsRead(@PathVariable String messageId) {
        messageService.markAsRead(messageId);
        return ResponseEntity.ok().build();
    }

    /**
     * Mark all messages in a conversation as read
     */
    @PutMapping("/conversation/read")
    @Operation(summary = "Mark conversation as read")
    public ResponseEntity<Void> markConversationAsRead(
            @RequestParam String conversationId,
            @RequestParam String userId
    ) {
        messageService.markConversationAsRead(conversationId, userId);
        return ResponseEntity.ok().build();
    }

    /**
     * Get unread message count
     */
    @GetMapping("/unread/{userId}")
    @Operation(summary = "Get unread message count")
    public ResponseEntity<Map<String, Long>> getUnreadCount(@PathVariable String userId) {
        long count = messageService.getUnreadCount(userId);
        return ResponseEntity.ok(Map.of("unreadCount", count));
    }

    /**
     * Delete a message
     */
    @DeleteMapping("/{messageId}")
    @Operation(summary = "Delete a message")
    public ResponseEntity<Void> deleteMessage(@PathVariable String messageId) {
        messageService.deleteMessage(messageId);
        return ResponseEntity.ok().build();
    }

    /**
     * Typing indicator (WebSocket only)
     * Client sends to: /app/typing
     */
    @MessageMapping("/typing")
    public void handleTypingIndicator(
            @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        // Broadcast typing indicator to receiver
        // Implementation depends on your frontend needs
        String receiverId = payload.get("receiverId");
        String senderId = payload.get("senderId");
        // messagingTemplate.convertAndSendToUser(receiverId, "/queue/typing", senderId);
    }
}