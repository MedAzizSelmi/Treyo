package com.byb.backend.security;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.security.Principal;

/**
 * The authenticated caller, carried as the Spring Security principal.
 *
 * The JWT already contains the user's id and role, so exposing them here
 * lets authorization checks run without a database round-trip. Previously
 * the filter discarded both and kept only the email, which meant any
 * ownership check had to re-query the user by email.
 *
 * Implements {@link Principal} with {@link #getName()} returning the
 * email, so {@code authentication.getName()} keeps returning exactly what
 * it did before and existing callers are unaffected.
 */
@Getter
@RequiredArgsConstructor
public class AuthenticatedUser implements Principal {

    private final String email;
    private final String userId;
    /** STUDENT, TRAINER, or ADMIN. */
    private final String role;

    @Override
    public String getName() {
        return email;
    }

    public boolean isAdmin() {
        return "ADMIN".equalsIgnoreCase(role);
    }

    public boolean isTrainer() {
        return "TRAINER".equalsIgnoreCase(role);
    }

    public boolean isStudent() {
        return "STUDENT".equalsIgnoreCase(role);
    }

    @Override
    public String toString() {
        return email;
    }
}
