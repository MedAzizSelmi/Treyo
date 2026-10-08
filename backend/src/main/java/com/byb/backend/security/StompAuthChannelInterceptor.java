package com.byb.backend.security;

import com.byb.backend.service.JwtService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Authentication for the STOMP broker.
 *
 * The HTTP side is guarded by JwtAuthenticationFilter, but a WebSocket
 * upgrade carries no Authorization header, so nothing was checking who
 * was on the other end of a socket. The endpoint accepted any connection
 * and the broker served any subscription — which meant private messages
 * were readable by anyone who could reach the server. This closes that.
 *
 * Two frames matter:
 *
 *   CONNECT    carries the access token as a STOMP header. It is
 *              verified here and the session is bound to a principal.
 *              No token, or a bad one, and the connection is refused —
 *              an unauthenticated socket is never allowed to exist.
 *
 *   SUBSCRIBE  is restricted to the caller's own user destinations.
 *              Spring rewrites "/user/queue/x" per session, so this is
 *              belt and braces, but it means a client cannot even ask
 *              for a raw broker destination.
 *
 * The token is read from the CONNECT frame rather than the handshake
 * URL on purpose: query strings end up in access logs and proxy logs,
 * and an access token in a log is a credential in a log.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private final JwtService jwtService;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) return message;

        StompCommand command = accessor.getCommand();
        if (StompCommand.CONNECT.equals(command)) {
            accessor.setUser(authenticate(accessor));
        } else if (StompCommand.SUBSCRIBE.equals(command)) {
            requireOwnDestination(accessor);
        }
        return message;
    }

    /**
     * Verify the token on the CONNECT frame and build the principal.
     * Throws rather than returning null: a refused CONNECT closes the
     * socket, which is the only safe outcome.
     */
    private StompPrincipal authenticate(StompHeaderAccessor accessor) {
        String token = bearerToken(accessor);
        if (token == null) {
            throw new IllegalArgumentException("No credentials on the WebSocket connection");
        }
        try {
            // Same rule as the HTTP filter: only an access token counts.
            // A refresh token or a 2FA challenge carries userId and role
            // too, and would otherwise open a socket.
            String type = jwtService.extractType(token);
            if (!(type == null || "access".equals(type)) || jwtService.isTokenExpired(token)) {
                throw new IllegalArgumentException("Not a usable access token");
            }
            String email = jwtService.extractUsername(token);
            String userId = jwtService.extractUserId(token);
            String role = jwtService.extractRole(token);
            if (userId == null || email == null) {
                throw new IllegalArgumentException("Token is missing an identity");
            }
            return new StompPrincipal(userId, email, role);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            // Signature failures, malformed tokens and the rest all land
            // here. The reason is logged, never returned to the client.
            log.warn("Rejected a WebSocket connection: {}", e.getMessage());
            throw new IllegalArgumentException("WebSocket authentication failed");
        }
    }

    /**
     * A session may only subscribe to its own user destinations.
     *
     * Everything this application publishes goes through
     * convertAndSendToUser, so "/user/queue/..." is the only thing worth
     * subscribing to. Refusing the rest means a client cannot listen on
     * a raw broker destination and pick up somebody else's traffic.
     */
    private void requireOwnDestination(StompHeaderAccessor accessor) {
        if (!(accessor.getUser() instanceof StompPrincipal principal)) {
            throw new IllegalArgumentException("Not connected");
        }
        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith("/user/queue/")) {
            log.warn("Refused subscription to {} by {}", destination, principal.userId());
            throw new IllegalArgumentException("Subscription not allowed");
        }
    }

    /** The access token from the CONNECT frame's Authorization header. */
    private String bearerToken(StompHeaderAccessor accessor) {
        List<String> header = accessor.getNativeHeader("Authorization");
        if (header == null || header.isEmpty()) return null;
        String value = header.get(0);
        if (value == null || !value.startsWith("Bearer ")) return null;
        String token = value.substring(7).trim();
        return token.isEmpty() ? null : token;
    }
}
