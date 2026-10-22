package com.byb.backend.security;

import com.byb.backend.service.FileAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

/**
 * Ownership checks for endpoints that name a user in the request.
 *
 * Why this exists: many endpoints take a {@code studentId}, {@code trainerId}
 * or {@code userId} from the path, query or body, and used to act on it
 * unchecked. Registration is open, so "authenticated" meant "anyone": any
 * account could edit any trainer's profile, create courses in their name,
 * or read another learner's enrollments and notifications.
 *
 * The id in the request is now only accepted when it is the caller's own,
 * as read from the access token. Clients keep sending it, so nothing on
 * the mobile side changes; a request that omits it acts on the caller.
 *
 * Ids carry a role prefix (STU_, TRN_, ADM_), so matching the caller's id
 * also proves the caller has the matching role.
 *
 * A refusal throws {@link AccessDeniedException}, which
 * {@code GlobalExceptionHandler} turns into a 403. Call these before any
 * {@code try} block that catches {@code RuntimeException}, or the refusal
 * is swallowed into a 400.
 */
@Component
@RequiredArgsConstructor
public class CallerGuard {

    private final FileAccessService fileAccessService;

    /** The caller. Every guarded endpoint is authenticated, so absence is a refusal. */
    public AuthenticatedUser current() {
        AuthenticatedUser caller = fileAccessService.caller().orElse(null);
        if (caller == null || caller.getUserId() == null) {
            throw new AccessDeniedException("Not signed in");
        }
        return caller;
    }

    /**
     * For acting as a user — liking, enrolling, editing a profile. The
     * claimed id must be the caller's own; administrators get no
     * exception, because nothing in the dashboard acts on a user's behalf
     * and those actions have their own endpoints under /api/admin.
     *
     * @return the id to act on: always the caller's
     */
    public String self(String claimedId) {
        AuthenticatedUser caller = current();
        if (claimedId != null && !claimedId.isBlank() && !claimedId.equals(caller.getUserId())) {
            throw new AccessDeniedException("Not your account");
        }
        return caller.getUserId();
    }

    /**
     * For reading a user's data. The caller's own, or anyone's for an
     * administrator.
     *
     * @return the id to read
     */
    public String selfOrAdmin(String claimedId) {
        AuthenticatedUser caller = current();
        if (claimedId == null || claimedId.isBlank()) return caller.getUserId();
        if (caller.isAdmin() || claimedId.equals(caller.getUserId())) return claimedId;
        throw new AccessDeniedException("Not your account");
    }

    /** Administrators, or the one user who owns the resource. */
    public void requireOwnerOrAdmin(String ownerId) {
        AuthenticatedUser caller = current();
        if (caller.isAdmin()) return;
        if (ownerId == null || !ownerId.equals(caller.getUserId())) {
            throw new AccessDeniedException("Not yours");
        }
    }

    public void requireAdmin() {
        if (!current().isAdmin()) {
            throw new AccessDeniedException("Administrators only");
        }
    }

    public boolean isAdmin() {
        return current().isAdmin();
    }
}
