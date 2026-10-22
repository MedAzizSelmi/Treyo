package com.byb.backend.realtime;

import com.byb.backend.model.Admin;
import com.byb.backend.model.Course;
import com.byb.backend.model.Group;
import com.byb.backend.repository.AdminRepository;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.GroupRepository;
import com.byb.backend.service.JwtService;
import com.byb.backend.service.MessageService;
import com.byb.backend.service.PushNotificationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.CompositeMessageConverter;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.converter.SimpleMessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.lang.reflect.Type;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeFalse;

/**
 * A group message reaches another member over the live socket, and
 * arrives carrying the group it belongs to.
 *
 * Connects exactly the way the app does: a plain WebSocket to
 * /ws/websocket, the access token on the CONNECT frame, and the Origin
 * header React Native's Android WebSocket adds by itself (the backend's
 * own address). Both chat screens — the app's and the dashboard's — drop
 * any frame whose groupId does not match the open conversation, so a
 * frame without one is as good as never delivered.
 *
 * Runs against the development database inside a transaction that is
 * rolled back, so the test group and its message are never kept. Push
 * notifications are mocked: the receiver is a real administrator, who
 * may have a real phone registered.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GroupChatRealtimeTest {

    @LocalServerPort
    private int port;

    @Autowired private MessageService messageService;
    @Autowired private JwtService jwtService;
    @Autowired private GroupRepository groupRepository;
    @Autowired private AdminRepository adminRepository;
    @Autowired private CourseRepository courseRepository;

    @MockBean private PushNotificationService pushNotificationService;

    @Test
    @Transactional
    void aGroupMessageArrivesLiveWithItsGroupId() throws Exception {
        // Every administrator is a member of every group, which makes one
        // the simplest receiver to set up.
        List<Admin> admins = adminRepository.findAll();
        // The groups table references a real trainer and course, so the
        // test group borrows an existing pair; the trainer is the sender.
        Course course = courseRepository.findAll().stream()
                .filter(c -> c.getTrainerId() != null)
                .findFirst().orElse(null);
        assumeFalse(admins.isEmpty(), "needs an administrator in the development database");
        assumeFalse(course == null, "needs a course with a trainer in the development database");
        Admin receiver = admins.get(0);

        String trainerId = course.getTrainerId();
        Group group = new Group();
        group.setGroupId("GRP_RT_" + UUID.randomUUID().toString().substring(0, 8));
        group.setCourseId(course.getCourseId());
        group.setTrainerId(trainerId);
        group.setGroupName("Realtime test");
        group.setGroupStatus("active");
        group.setIsActive(true);
        groupRepository.saveAndFlush(group);

        BlockingQueue<Map<String, Object>> received = new LinkedBlockingQueue<>();
        StompSession session = connectAs(receiver.getEmail(), receiver.getAdminId(), "ADMIN");
        try {
            session.subscribe("/user/queue/group-messages", new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return Map.class;
                }

                @Override
                @SuppressWarnings("unchecked")
                public void handleFrame(StompHeaders headers, Object payload) {
                    received.add((Map<String, Object>) payload);
                }
            });
            // SUBSCRIBE is processed asynchronously and the simple broker
            // sends no receipt; give it a moment to register.
            Thread.sleep(500);

            messageService.sendGroupMessage(trainerId, group.getGroupId(), "hello, live", "text", null);

            Map<String, Object> frame = received.poll(5, TimeUnit.SECONDS);
            assertNotNull(frame, "the message never arrived over the socket");
            assertEquals("hello, live", frame.get("content"));
            assertEquals(group.getGroupId(), frame.get("groupId"),
                    "the frame must say which group it belongs to, or both chat screens discard it");
        } finally {
            session.disconnect();
        }
    }

    /**
     * Not in a rolled-back transaction like the test above: the typing
     * frame is handled on the broker's own thread, which cannot see an
     * uncommitted group and would rightly ignore it. The group is saved
     * for real and deleted at the end; typing writes nothing else.
     */
    @Test
    void typingInAGroupReachesTheOtherMembers() throws Exception {
        List<Admin> admins = adminRepository.findAll();
        Course course = courseRepository.findAll().stream()
                .filter(c -> c.getTrainerId() != null)
                .findFirst().orElse(null);
        assumeFalse(admins.isEmpty(), "needs an administrator in the development database");
        assumeFalse(course == null, "needs a course with a trainer in the development database");
        Admin watcher = admins.get(0);

        Group group = new Group();
        group.setGroupId("GRP_RT_" + UUID.randomUUID().toString().substring(0, 8));
        group.setCourseId(course.getCourseId());
        group.setTrainerId(course.getTrainerId());
        group.setGroupName("Realtime typing test");
        group.setGroupStatus("active");
        group.setIsActive(true);
        groupRepository.saveAndFlush(group);

        BlockingQueue<Map<String, Object>> received = new LinkedBlockingQueue<>();
        StompSession admin = null;
        StompSession trainer = null;
        try {
            admin = connectAs(watcher.getEmail(), watcher.getAdminId(), "ADMIN");
            trainer = connectAs("rt-trainer@example.test", course.getTrainerId(), "TRAINER");
            admin.subscribe("/user/queue/typing", new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return Map.class;
                }

                @Override
                @SuppressWarnings("unchecked")
                public void handleFrame(StompHeaders headers, Object payload) {
                    received.add((Map<String, Object>) payload);
                }
            });
            Thread.sleep(500);

            // Exactly what the app's publishTyping sends: a JSON body and
            // no content-type header.
            StompHeaders send = new StompHeaders();
            send.setDestination("/app/typing");
            trainer.send(send, ("{\"groupId\":\"" + group.getGroupId() + "\"}")
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8));

            Map<String, Object> frame = received.poll(5, TimeUnit.SECONDS);
            assertNotNull(frame, "the typing indicator never arrived");
            assertEquals(group.getGroupId(), frame.get("groupId"));
            assertEquals(course.getTrainerId(), frame.get("senderId"));
        } finally {
            if (trainer != null) trainer.disconnect();
            if (admin != null) admin.disconnect();
            groupRepository.deleteById(group.getGroupId());
        }
    }

    /**
     * The app sends STOMP as binary WebSocket frames: React Native cuts a
     * text frame at the NULL that ends every STOMP frame, so text never
     * got as far as a CONNECTED. This speaks raw STOMP, as binary, and
     * checks the server answers.
     */
    @Test
    void stompSentAsBinaryFramesIsAccepted() throws Exception {
        String token = jwtService.generateToken("rt-binary@example.test", "STU_RT_BINARY", "STUDENT");
        BlockingQueue<String> replies = new LinkedBlockingQueue<>();

        WebSocketHttpHeaders handshake = new WebSocketHttpHeaders();
        handshake.setOrigin("http://localhost:" + port);
        org.springframework.web.socket.WebSocketSession ws = new StandardWebSocketClient()
                .execute(new org.springframework.web.socket.handler.AbstractWebSocketHandler() {
                    @Override
                    protected void handleTextMessage(org.springframework.web.socket.WebSocketSession s,
                                                     org.springframework.web.socket.TextMessage m) {
                        replies.add(m.getPayload());
                    }

                    @Override
                    protected void handleBinaryMessage(org.springframework.web.socket.WebSocketSession s,
                                                       org.springframework.web.socket.BinaryMessage m) {
                        replies.add(java.nio.charset.StandardCharsets.UTF_8.decode(m.getPayload()).toString());
                    }
                }, handshake, java.net.URI.create("ws://localhost:" + port + "/ws/websocket"))
                .get(5, TimeUnit.SECONDS);
        try {
            // A raw STOMP frame: headers, a blank line, then the NULL
            // terminator that React Native would have cut off a text frame.
            String nl = String.valueOf((char) 10);
            String connect = "CONNECT" + nl + "accept-version:1.2" + nl + "heart-beat:0,0" + nl
                    + "Authorization:Bearer " + token + nl + nl + (char) 0;
            ws.sendMessage(new org.springframework.web.socket.BinaryMessage(
                    connect.getBytes(java.nio.charset.StandardCharsets.UTF_8)));

            String reply = replies.poll(5, TimeUnit.SECONDS);
            assertNotNull(reply, "no reply to a binary CONNECT frame");
            assertTrue(reply.startsWith("CONNECTED"), "expected CONNECTED, got: " + reply);
        } finally {
            ws.close();
        }
    }

    @Test
    void anExpiredTokenIsRefused() {
        // What the app used to do an hour after it opened its socket:
        // reconnect with the token it started with.
        Map<String, Object> claims = new java.util.HashMap<>(Map.of("userId", "STU_RT_TEST", "role", "STUDENT"));
        JwtService target = AopTestUtils.getTargetObject(jwtService);
        String expired = ReflectionTestUtils.invokeMethod(target, "createToken",
                claims, "rt-test@example.test", -1000L);
        assertThrows(Exception.class, () -> connectWithToken(expired));
    }

    private StompSession connectAs(String email, String userId, String role) throws Exception {
        return connectWithToken(jwtService.generateToken(email, userId, role));
    }

    private StompSession connectWithToken(String token) throws Exception {
        WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
        // Raw bytes go out untouched and with no content-type, as stompjs
        // sends them; frames coming in are read as JSON.
        client.setMessageConverter(new CompositeMessageConverter(List.of(
                new SimpleMessageConverter(), new MappingJackson2MessageConverter())));

        WebSocketHttpHeaders handshake = new WebSocketHttpHeaders();
        // React Native's Android WebSocket sends this unasked.
        handshake.setOrigin("http://localhost:" + port);
        StompHeaders connect = new StompHeaders();
        connect.add("Authorization", "Bearer " + token);

        return client.connectAsync("ws://localhost:" + port + "/ws/websocket",
                        handshake, connect, new StompSessionHandlerAdapter() { })
                .get(5, TimeUnit.SECONDS);
    }
}
