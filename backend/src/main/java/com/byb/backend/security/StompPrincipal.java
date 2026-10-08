package com.byb.backend.security;

import java.security.Principal;

/**
 * Who a WebSocket session belongs to.
 *
 * {@code getName()} returns the **user id**, not the email, and that is
 * load-bearing. Spring routes user destinations by principal name, and
 * every send in MessageService already addresses them by user id —
 * {@code convertAndSendToUser(receiverId, "/queue/messages", …)}. A
 * principal named by email would route those messages to a destination
 * nobody is subscribed to, and they would vanish without an error.
 *
 * This is deliberately a different type from AuthenticatedUser, which
 * names itself by email because the HTTP layer looks accounts up that
 * way. Reusing it here would mean one of the two layers silently using
 * the wrong key.
 */
public record StompPrincipal(String userId, String email, String role) implements Principal {

    @Override
    public String getName() {
        return userId;
    }

    public boolean isAdmin() {
        return "ADMIN".equalsIgnoreCase(role);
    }
}
