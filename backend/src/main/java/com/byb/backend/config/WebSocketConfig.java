package com.byb.backend.config;

import com.byb.backend.security.StompAuthChannelInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * The real-time messaging transport.
 *
 * A WebSocket upgrade carries no Authorization header, so none of the
 * HTTP security applies to it. Until StompAuthChannelInterceptor was
 * added, that meant the broker accepted any connection from any origin
 * and served any subscription — private conversations included.
 * Authentication now happens on the CONNECT frame, and subscriptions are
 * limited to the caller's own user destinations.
 */
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final StompAuthChannelInterceptor stompAuthChannelInterceptor;

    /**
     * Allowed browser origins, comma separated.
     *
     * Only the dashboard needs this — the mobile app is not a browser
     * and sends no Origin header. The previous "*" meant any website a
     * signed-in user visited could open a socket as them.
     */
    @Value("${app.cors.allowed-origins:}")
    private String allowedOrigins;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        String[] origins = allowedOrigins == null || allowedOrigins.isBlank()
                ? new String[]{"http://localhost:3000"}
                : allowedOrigins.split("\\s*,\\s*");

        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(origins)
                // SockJS for the dashboard, where a plain WebSocket may be
                // blocked by a proxy. React Native connects natively and
                // ignores the fallback.
                .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // /queue only. Nothing in this application publishes to /topic —
        // every send goes through convertAndSendToUser — so enabling a
        // broadcast prefix would only create somewhere for a client to
        // listen that nobody audits.
        registry.enableSimpleBroker("/queue");

        // Client -> server, handled by @MessageMapping methods.
        registry.setApplicationDestinationPrefixes("/app");

        // Per-user destinations: Spring rewrites "/user/queue/x" to a
        // session-scoped destination, keyed by the principal's name.
        // StompPrincipal.getName() returns the user id for that reason.
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(stompAuthChannelInterceptor);
    }
}
