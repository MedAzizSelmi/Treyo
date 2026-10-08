package com.byb.backend.security;

import com.byb.backend.service.JwtService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        // Get Authorization header
        final String authHeader = request.getHeader("Authorization");

        // Check if header exists and starts with "Bearer "
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            // Extract token
            final String jwt = authHeader.substring(7);
            final String userEmail = jwtService.extractUsername(jwt);

            // If token is valid and user is not authenticated yet
            if (userEmail != null && SecurityContextHolder.getContext().getAuthentication() == null) {

                // Only an access token authenticates a request.
                //
                // Refresh tokens and 2FA challenge tokens carry userId and
                // role exactly like an access token does, so without this
                // check either one would be accepted here — a refresh
                // token would work as a session, and a 2FA challenge would
                // grant access before the second factor was ever supplied,
                // making it decorative. Access tokens carry no type claim.
                String type = jwtService.extractType(jwt);
                boolean isAccessToken = type == null || "access".equals(type);

                if (isAccessToken && !jwtService.isTokenExpired(jwt)) {

                    // Extract role and userId
                    String role = jwtService.extractRole(jwt);
                    String userId = jwtService.extractUserId(jwt);

                    // Carry the id and role on the principal so ownership
                    // checks downstream cost no database lookup. getName()
                    // still returns the email, so existing callers that read
                    // authentication.getName() are unaffected.
                    AuthenticatedUser principal = new AuthenticatedUser(userEmail, userId, role);

                    UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                            principal,
                            null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + role))
                    );

                    authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                    // Set authentication in security context
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                }
            }

        } catch (Exception e) {
            // Log error but don't block request
            System.err.println("JWT Authentication error: " + e.getMessage());
        }

        filterChain.doFilter(request, response);
    }
}