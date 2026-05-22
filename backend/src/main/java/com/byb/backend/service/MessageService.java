package com.byb.backend.service;

import com.byb.backend.dto.message.ConversationResponse;
import com.byb.backend.dto.message.MessageResponse;
import com.byb.backend.dto.message.SendMessageRequest;
import com.byb.backend.model.Admin;
import com.byb.backend.model.Course;
import com.byb.backend.model.Enrollment;
import com.byb.backend.model.Group;
import com.byb.backend.model.Message;
import com.byb.backend.model.Student;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.AdminRepository;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.EnrollmentRepository;
import com.byb.backend.repository.GroupRepository;
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
    private final GroupRepository groupRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final CourseRepository courseRepository;
    private final AdminRepository adminRepository;

    // ─── Group chat namespacing ─────────────────────────────────────
    // We reuse the messages table for both 1-to-1 DMs and group chats.
    // Group conversations are identified by a "GROUP_" prefix on their
    // conversation_id so we can distinguish them at query time without
    // a separate table.
    public static final String GROUP_CONV_PREFIX = "GROUP_";

    public static String groupConversationId(String groupId) {
        return GROUP_CONV_PREFIX + groupId;
    }

    public static boolean isGroupConversation(String conversationId) {
        return conversationId != null && conversationId.startsWith(GROUP_CONV_PREFIX);
    }

    public static String groupIdFromConversation(String conversationId) {
        if (!isGroupConversation(conversationId)) return null;
        return conversationId.substring(GROUP_CONV_PREFIX.length());
    }

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
     * Get all conversations for a user — DMs + group chats merged into
     * one list, sorted by most recent activity. The mobile reads the
     * isGroup flag to decide whether tapping should open the 1-to-1 view
     * or the group-chat screen.
     */
    public List<ConversationResponse> getUserConversations(String userId) {
        // ── DMs (1-to-1) ────────────────────────────────────────────
        // Same as before: every message where the user is sender or
        // receiver, grouped by conversation_id, summarised. We exclude
        // group conversations here so we don't surface them twice (group
        // rows come from getUserGroupConversations below, which handles
        // membership properly).
        List<Message> allMessages = messageRepository.findAllByUser(userId);

        Map<String, List<Message>> conversations = allMessages.stream()
                .filter(m -> !isGroupConversation(m.getConversationId()))
                .collect(Collectors.groupingBy(Message::getConversationId));

        List<ConversationResponse> result = new ArrayList<>();

        for (Map.Entry<String, List<Message>> entry : conversations.entrySet()) {
            List<Message> msgs = entry.getValue();
            if (msgs.isEmpty()) continue;

            Message lastMsg = msgs.stream()
                    .max(Comparator.comparing(Message::getCreatedAt))
                    .orElse(null);
            if (lastMsg == null) continue;

            String otherUserId = lastMsg.getSenderId().equals(userId)
                    ? lastMsg.getReceiverId()
                    : lastMsg.getSenderId();
            String otherUserType = lastMsg.getSenderId().equals(userId)
                    ? lastMsg.getReceiverType()
                    : lastMsg.getSenderType();

            String otherUserName = getUserName(otherUserId, otherUserType);
            String otherUserPhotoUrl = getUserPhotoUrl(otherUserId, otherUserType);

            int unreadCount = (int) msgs.stream()
                    .filter(m -> m.getReceiverId().equals(userId) && !m.getIsRead())
                    .count();

            result.add(ConversationResponse.builder()
                    .conversationId(entry.getKey())
                    .otherUserId(otherUserId)
                    .otherUserName(otherUserName)
                    .otherUserType(otherUserType)
                    .otherUserPhotoUrl(otherUserPhotoUrl)
                    .lastMessage(lastMsg.getContent())
                    .lastMessageTime(lastMsg.getCreatedAt())
                    .unreadCount(unreadCount)
                    .isOnline(false)
                    .isGroup(false)
                    .build());
        }

        // ── Group chats ─────────────────────────────────────────────
        // Membership-driven (not message-driven) so a freshly-created
        // group with zero messages still appears in the list, with the
        // seeded welcome message as its preview.
        result.addAll(getUserGroupConversations(userId));

        // Most recent activity first.
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

    // ═══════════════════════════════════════════════════════════════
    // GROUP CHAT
    // ═══════════════════════════════════════════════════════════════

    /**
     * Post a message into a group's conversation. Membership is enforced:
     * the sender must be an enrolled student, the group's trainer, or any
     * admin — otherwise we reject with an exception.
     *
     * One DB row per message regardless of group size. The {@code receiverId}
     * is set to the group's ID and {@code receiverType="group"}, which is
     * how the conversations list later distinguishes group rows from DMs.
     *
     * Broadcasts via WebSocket to every member individually (each gets a
     * personal /user/queue/group-messages frame) so existing per-user
     * socket subscriptions just work.
     */
    @Transactional
    public MessageResponse sendGroupMessage(String senderId, String groupId, String content,
                                            String messageType, String attachmentUrl) {
        // Either text or an attachment is required, but not both must be
        // set — image-only messages have a blank content, and pure text
        // has no attachmentUrl. Reject only the case where the user
        // somehow sent nothing at all.
        boolean hasContent = content != null && !content.isBlank();
        boolean hasAttachment = attachmentUrl != null && !attachmentUrl.isBlank();
        if (!hasContent && !hasAttachment) {
            throw new IllegalArgumentException("Message content or attachment is required");
        }
        // Normalise the stored content so consumers don't have to handle
        // null — easier to deal with empty string when rendering.
        if (!hasContent) content = "";

        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new IllegalArgumentException("Group not found: " + groupId));

        Set<String> members = resolveGroupMemberIds(group);
        if (!members.contains(senderId)) {
            throw new SecurityException("Sender is not a member of this group");
        }

        String senderType = determineUserType(senderId);
        String senderName = getUserName(senderId, senderType);
        String convId = groupConversationId(groupId);
        String messageId = "MSG_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        Message message = new Message();
        message.setMessageId(messageId);
        message.setSenderId(senderId);
        message.setSenderType(senderType);
        // receiver = the group itself. Keeps single-row storage simple and
        // lets the conversations list treat (receiverType=group) as a hint.
        message.setReceiverId(groupId);
        message.setReceiverType("group");
        message.setConversationId(convId);
        message.setContent(content);
        message.setMessageType(messageType == null ? "text" : messageType);
        message.setAttachmentUrl(attachmentUrl);
        message.setIsRead(false);
        message.setIsDeleted(false);
        message.setCreatedAt(LocalDateTime.now());
        message.setUpdatedAt(LocalDateTime.now());

        message = messageRepository.save(message);

        MessageResponse response = mapToResponse(message, senderName);

        // Fan-out the socket frame to every member except the sender — they
        // already have the message in their UI from the POST round-trip.
        for (String memberId : members) {
            if (memberId.equals(senderId)) continue;
            try {
                messagingTemplate.convertAndSendToUser(memberId, "/queue/group-messages", response);
            } catch (Exception e) {
                System.err.println("Failed WS push to " + memberId + ": " + e.getMessage());
            }
        }
        return response;
    }

    /**
     * Insert a server-driven message into a group as a specific user.
     * Bypasses the sender-must-be-a-member check that {@link #sendGroupMessage}
     * enforces — used by group-formation to seed the welcome message
     * authored by an admin (so it lands in the chat as if the admin
     * typed it, rather than a "SYSTEM" pseudo-user the students never
     * see again). The admin is then a real participant going forward.
     *
     * @param senderId   user ID to attribute the message to (e.g. ADM_xxx)
     * @param senderType "admin" / "trainer" / "student" — must match the ID
     */
    @Transactional
    public MessageResponse postAsUser(String groupId, String senderId, String senderType, String content) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new IllegalArgumentException("Group not found: " + groupId));

        String messageId = "MSG_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        Message message = new Message();
        message.setMessageId(messageId);
        message.setSenderId(senderId);
        message.setSenderType(senderType);
        message.setReceiverId(group.getGroupId());
        message.setReceiverType("group");
        message.setConversationId(groupConversationId(group.getGroupId()));
        message.setContent(content);
        message.setMessageType("text");
        message.setIsRead(false);
        message.setIsDeleted(false);
        message.setCreatedAt(LocalDateTime.now());
        message.setUpdatedAt(LocalDateTime.now());
        message = messageRepository.save(message);
        return mapToResponse(message, getUserName(senderId, senderType));
    }

    /** Returns an admin to attribute server-driven messages to (welcome,
     *  announcements, etc.). Picks pseudo-randomly across all admins so
     *  in shops with multiple admins the load is roughly spread. Returns
     *  null when there are zero admins — the caller can fall back to
     *  another sender or skip the message. */
    public Admin pickRandomAdmin() {
        List<Admin> admins = adminRepository.findAll();
        if (admins.isEmpty()) return null;
        return admins.get(new Random().nextInt(admins.size()));
    }

    /**
     * List all messages in a group's conversation (oldest → newest). The
     * viewer MUST be a member; non-members get a 403-equivalent.
     */
    public List<MessageResponse> getGroupMessages(String groupId, String viewerId) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new IllegalArgumentException("Group not found: " + groupId));
        Set<String> members = resolveGroupMemberIds(group);
        if (!members.contains(viewerId)) {
            throw new SecurityException("You are not a member of this group");
        }

        List<Message> messages = messageRepository.findGroupMessages(groupConversationId(groupId));
        return messages.stream()
                .map(m -> {
                    String name = "SYSTEM".equals(m.getSenderId())
                            ? "System"
                            : getUserName(m.getSenderId(), m.getSenderType());
                    return mapToResponse(m, name);
                })
                .collect(Collectors.toList());
    }

    /**
     * All groups this user belongs to, projected into ConversationResponse
     * shape so the messages screen can show them alongside 1-to-1 chats.
     * "Belongs to" means:
     *   - enrolled in the course this group serves, OR
     *   - the group's trainer, OR
     *   - an admin (all admins see all groups)
     */
    public List<ConversationResponse> getUserGroupConversations(String userId) {
        boolean isAdmin = adminRepository.existsById(userId);
        Set<String> groupIds = new HashSet<>();

        if (isAdmin) {
            // Admins watch every active group — they're moderators/escalation.
            for (Group g : groupRepository.findAll()) {
                if (Boolean.TRUE.equals(g.getIsActive())) groupIds.add(g.getGroupId());
            }
        } else {
            // Trainer? Pick up groups where I'm the trainer.
            for (Group g : groupRepository.findAll()) {
                if (!Boolean.TRUE.equals(g.getIsActive())) continue;
                if (userId.equals(g.getTrainerId())) {
                    groupIds.add(g.getGroupId());
                }
            }
            // Student? Pick up groups via enrollments.
            for (Enrollment e : enrollmentRepository.findAll()) {
                if (!userId.equals(e.getStudentId())) continue;
                if (e.getGroupId() == null) continue;
                groupIds.add(e.getGroupId());
            }
        }

        List<ConversationResponse> out = new ArrayList<>();
        for (String gid : groupIds) {
            groupRepository.findById(gid).ifPresent(g -> {
                ConversationResponse conv = buildGroupConversation(g);
                if (conv != null) out.add(conv);
            });
        }
        return out;
    }

    /**
     * Resolve a group's full member set: enrolled students with this
     * groupId + the group's trainer + every admin in the system.
     * Returned as user IDs so the caller can do membership tests cheaply.
     */
    private Set<String> resolveGroupMemberIds(Group group) {
        Set<String> ids = new HashSet<>();
        ids.add(group.getTrainerId());
        for (Enrollment e : enrollmentRepository.findAll()) {
            if (group.getGroupId().equals(e.getGroupId())) {
                ids.add(e.getStudentId());
            }
        }
        for (Admin a : adminRepository.findAll()) {
            ids.add(a.getAdminId());
        }
        return ids;
    }

    /**
     * Build a ConversationResponse for one group. Last-message text and
     * timestamp come from the most recent row in this group's
     * conversation; if there are zero messages we fall back to the
     * group's createdAt so the row still sorts sanely in the list.
     */
    private ConversationResponse buildGroupConversation(Group group) {
        String convId = groupConversationId(group.getGroupId());
        List<Message> msgs = messageRepository.findGroupMessages(convId);

        Message last = msgs.isEmpty() ? null : msgs.get(msgs.size() - 1);
        String lastText = last != null ? last.getContent() : "Group created — say hi!";
        LocalDateTime lastTime = last != null ? last.getCreatedAt() : group.getCreatedAt();

        // Group "title" = course title where possible, falling back to
        // the group's own name. Subtitle is just the course title again
        // (currently the same) — separate fields keep room for nuance
        // later (e.g. "<title> — Group 2").
        String courseTitle = courseRepository.findByCourseId(group.getCourseId())
                .map(Course::getTitle)
                .orElse(group.getGroupName());

        // Member count we show in the UI: students + trainer. Admins are
        // moderators and are intentionally NOT counted in the visible
        // total (avoids cluttering the badge with admin headcount).
        int students = 0;
        for (Enrollment e : enrollmentRepository.findAll()) {
            if (group.getGroupId().equals(e.getGroupId())) students++;
        }
        int memberCount = students + 1; // +1 for the trainer

        return ConversationResponse.builder()
                .conversationId(convId)
                .otherUserId(group.getGroupId())
                .otherUserName(group.getGroupName() == null ? courseTitle : group.getGroupName())
                .otherUserType("group")
                .otherUserPhotoUrl(null)
                .lastMessage(lastText)
                .lastMessageTime(lastTime == null ? LocalDateTime.now() : lastTime)
                .unreadCount(0) // per-user unread for groups not tracked yet
                .isOnline(false)
                .isGroup(true)
                .groupId(group.getGroupId())
                .courseTitle(courseTitle)
                .memberCount(memberCount)
                .build();
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
        if (userId == null) return "unknown";
        if (userId.startsWith("STU_")) return "student";  // lowercase
        if (userId.startsWith("TRN_")) return "trainer";
        if (userId.startsWith("ADM_")) return "admin";
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
        } else if ("admin".equals(userType)) {
            return adminRepository.findById(userId)
                    .map(Admin::getName)
                    .orElse("Admin");
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
        } else if ("admin".equals(userType)) {
            // Admins don't have a profilePictureUrl column today — return
            // null and the client renders the initial-letter fallback.
            // If we add admin photos later, only this branch changes.
            return null;
        }
        return null;
    }

    private MessageResponse mapToResponse(Message message, String senderName) {
        // Pull the sender's photo so the chat UI can draw a WhatsApp-style
        // avatar circle next to each bubble. Cheap lookup — already on the
        // hot path that resolves senderName.
        String photoUrl = getUserPhotoUrl(message.getSenderId(), message.getSenderType());

        return MessageResponse.builder()
                .messageId(message.getMessageId())
                .senderId(message.getSenderId())
                .senderType(message.getSenderType())
                .senderName(senderName)
                .senderPhotoUrl(photoUrl)
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