package com.byb.backend.service;

import com.byb.backend.dto.message.ConversationResponse;
import com.byb.backend.dto.message.MessageResponse;
import com.byb.backend.dto.message.SendMessageRequest;
import com.byb.backend.model.Message;
import com.byb.backend.model.Student;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.MessageRepository;
import com.byb.backend.repository.StudentRepository;
import com.byb.backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MessageService {

    private final MessageRepository messageRepository;
    private final StudentRepository studentRepository;
    private final TrainerRepository trainerRepository;
    private final SimpMessagingTemplate messagingTemplate; // For WebSocket

    /**
     * Send a message
     */
    @Transactional
    public MessageResponse sendMessage(SendMessageRequest request) {
        // Generate unique message ID
        String messageId = "MSG_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        // Determine sender and receiver types
        String senderType = determineUserType(request.getSenderId());
        String receiverType = determineUserType(request.getReceiverId());

        // Get sender name
        String senderName = getUserName(request.getSenderId(), senderType);

        // Generate conversation ID (consistent regardless of who sends first)
        String conversationId = generateConversationId(request.getSenderId(), request.getReceiverId());

        // Create message
        Message message = new Message();
        message.setMessageId(messageId);
        message.setSenderId(request.getSenderId());
        message.setSenderType(senderType);
        message.setReceiverId(request.getReceiverId());
        message.setReceiverType(receiverType);
        message.setConversationId(conversationId);
        message.setContent(request.getContent());
        message.setMessageType(request.getMessageType());
        message.setAttachmentUrl(request.getAttachmentUrl());
        message.setIsRead(false);
        message.setIsDeleted(false);

        // MANUALLY SET TIMESTAMPS (since JPA auditing isn't working)
        message.setCreatedAt(LocalDateTime.now());
        message.setUpdatedAt(LocalDateTime.now());

        message = messageRepository.save(message);

        // Convert to response
        MessageResponse response = mapToResponse(message, senderName);

        // Send via WebSocket to receiver
        sendViaWebSocket(response);

        return response;
    }

    /**
     * Get conversation between two users
     */
    public List<MessageResponse> getConversation(String userId1, String userId2, int limit) {
        String conversationId = generateConversationId(userId1, userId2);

        List<Message> messages;
        if (limit > 0) {
            messages = messageRepository.findConversationBetweenLimited(
                    conversationId,
                    org.springframework.data.domain.PageRequest.of(0, limit)
            );
        } else {
            // Use findByConversationIdOrderByCreatedAtAsc for all messages
            messages = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
        }

        return messages.stream()
                .map(msg -> mapToResponse(msg, getUserName(msg.getSenderId(), msg.getSenderType())))
                .collect(Collectors.toList());
    }

    /**
     * Get all conversations for a user
     */
    public List<ConversationResponse> getUserConversations(String userId) {
        // Get all messages where user is sender or receiver
        List<Message> allMessages = messageRepository.findAllByUser(userId);

        // Group by conversation ID
        Map<String, List<Message>> conversations = allMessages.stream()
                .collect(Collectors.groupingBy(Message::getConversationId));

        // Build conversation summaries
        List<ConversationResponse> result = new ArrayList<>();

        for (Map.Entry<String, List<Message>> entry : conversations.entrySet()) {
            List<Message> msgs = entry.getValue();
            if (msgs.isEmpty()) continue;

            // Get most recent message
            Message lastMsg = msgs.stream()
                    .max(Comparator.comparing(Message::getCreatedAt))
                    .orElse(null);

            if (lastMsg == null) continue;

            // Determine other user
            String otherUserId = lastMsg.getSenderId().equals(userId)
                    ? lastMsg.getReceiverId()
                    : lastMsg.getSenderId();

            String otherUserType = lastMsg.getSenderId().equals(userId)
                    ? lastMsg.getReceiverType()
                    : lastMsg.getSenderType();

            // Get other user's details
            String otherUserName = getUserName(otherUserId, otherUserType);
            String otherUserPhotoUrl = getUserPhotoUrl(otherUserId, otherUserType);

            // Count unread messages
            int unreadCount = (int) msgs.stream()
                    .filter(m -> m.getReceiverId().equals(userId) && !m.getIsRead())
                    .count();

            ConversationResponse conv = ConversationResponse.builder()
                    .conversationId(entry.getKey())
                    .otherUserId(otherUserId)
                    .otherUserName(otherUserName)
                    .otherUserType(otherUserType)
                    .otherUserPhotoUrl(otherUserPhotoUrl)
                    .lastMessage(lastMsg.getContent())
                    .lastMessageTime(lastMsg.getCreatedAt())
                    .unreadCount(unreadCount)
                    .isOnline(false) // TODO: Implement presence tracking
                    .build();

            result.add(conv);
        }

        // Sort by most recent first
        result.sort(Comparator.comparing(ConversationResponse::getLastMessageTime).reversed());

        return result;
    }

    /**
     * Mark message as read
     */
    @Transactional
    public void markAsRead(String messageId) {
        messageRepository.findById(messageId).ifPresent(message -> {
            message.setIsRead(true);
            message.setReadAt(LocalDateTime.now());
            messageRepository.save(message);

            // Notify sender via WebSocket that message was read
            sendReadReceipt(message);
        });
    }

    /**
     * Mark all messages in a conversation as read
     */
    @Transactional
    public void markConversationAsRead(String conversationId, String userId) {
        List<Message> unreadMessages = messageRepository.findUnreadInConversation(conversationId, userId);

        LocalDateTime now = LocalDateTime.now();
        for (Message message : unreadMessages) {
            message.setIsRead(true);
            message.setReadAt(now);
        }

        messageRepository.saveAll(unreadMessages);
    }

    /**
     * Get unread message count for a user
     */
    public long getUnreadCount(String userId) {
        return messageRepository.countUnreadMessages(userId);
    }

    /**
     * Delete message (soft delete)
     */
    @Transactional
    public void deleteMessage(String messageId) {
        messageRepository.findById(messageId).ifPresent(message -> {
            message.setIsDeleted(true);
            messageRepository.save(message);
        });
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    private String generateConversationId(String userId1, String userId2) {
        // Sort to ensure consistent ID
        if (userId1.compareTo(userId2) < 0) {
            return userId1 + "_" + userId2;
        } else {
            return userId2 + "_" + userId1;
        }
    }

    private String determineUserType(String userId) {
        if (userId.startsWith("STU_")) return "student";  // lowercase
        if (userId.startsWith("TRN_")) return "trainer";  // lowercase
        return "unknown";
    }

    private String getUserName(String userId, String userType) {
        if ("student".equals(userType)) {
            return studentRepository.findById(userId)
                    .map(Student::getName)
                    .orElse("Unknown Student");
        } else if ("trainer".equals(userType)) {
            return trainerRepository.findById(userId)
                    .map(Trainer::getName)
                    .orElse("Unknown Trainer");
        }
        return "Unknown User";
    }

    private String getUserPhotoUrl(String userId, String userType) {
        if ("student".equals(userType)) {
            return studentRepository.findById(userId)
                    .map(Student::getProfilePictureUrl)
                    .orElse(null);
        } else if ("trainer".equals(userType)) {
            return trainerRepository.findById(userId)
                    .map(Trainer::getProfilePictureUrl)
                    .orElse(null);
        }
        return null;
    }

    private MessageResponse mapToResponse(Message message, String senderName) {
        return MessageResponse.builder()
                .messageId(message.getMessageId())
                .senderId(message.getSenderId())
                .senderType(message.getSenderType())
                .senderName(senderName)
                .receiverId(message.getReceiverId())
                .receiverType(message.getReceiverType())
                .conversationId(message.getConversationId())
                .content(message.getContent())
                .messageType(message.getMessageType())
                .attachmentUrl(message.getAttachmentUrl())
                .isRead(message.getIsRead())
                .readAt(message.getReadAt())
                .sentAt(message.getCreatedAt())
                .build();
    }

    /**
     * Send message via WebSocket to receiver
     */
    private void sendViaWebSocket(MessageResponse message) {
        try {
            // Send to specific user's queue
            messagingTemplate.convertAndSendToUser(
                    message.getReceiverId(),
                    "/queue/messages",
                    message
            );
        } catch (Exception e) {
            // Log error but don't fail the message send
            System.err.println("Failed to send WebSocket message: " + e.getMessage());
        }
    }

    /**
     * Send read receipt via WebSocket
     */
    private void sendReadReceipt(Message message) {
        try {
            Map<String, Object> receipt = Map.of(
                    "messageId", message.getMessageId(),
                    "readAt", message.getReadAt(),
                    "conversationId", message.getConversationId()
            );

            messagingTemplate.convertAndSendToUser(
                    message.getSenderId(),
                    "/queue/read-receipts",
                    receipt
            );
        } catch (Exception e) {
            System.err.println("Failed to send read receipt: " + e.getMessage());
        }
    }
}