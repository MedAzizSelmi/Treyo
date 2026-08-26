package com.byb.backend.config;

import com.byb.backend.security.JwtAuthenticationFilter;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;

    /** Comma-separated browser origins allowed to call this API. */
    @org.springframework.beans.factory.annotation.Value("${app.cors.allowed-origins:http://localhost:3000}")
    private String allowedOrigins;

    /** Whether the interactive API documentation is reachable. Off in production. */
    @org.springframework.beans.factory.annotation.Value("${app.swagger.enabled:false}")
    private boolean swaggerEnabled;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .authorizeHttpRequests(auth -> {
                    // Public endpoints - NO AUTHENTICATION REQUIRED
                    //
                    // /api/files/download/** stays reachable without a
                    // token ONLY so the mobile <Image> component can load
                    // avatars, which cannot send an Authorization header.
                    // It is no longer unguarded: FileAccessService
                    // authorizes every request per file, allowing
                    // anonymous reads for avatars and chat attachments
                    // while requiring ownership for CVs and a confirmed
                    // enrollment for paid course material.
                    auth.requestMatchers(
                            "/api/auth/**",
                            "/api/files/download/**",
                            "/api/trainers",
                            "/api/settings/revenue-currency",
                            "/api/modules",
                            // The payment webhook is server-to-server and
                            // has no JWT — it has to be permitAll. The
                            // handler still re-verifies every event with
                            // the gateway before doing anything, so a
                            // forged webhook cannot create an enrollment.
                            "/api/payments/konnect-webhook",
                            // Liveness probe for the reverse proxy and
                            // uptime monitoring. Details are suppressed
                            // (show-details=never), so it reveals only
                            // UP/DOWN.
                            "/actuator/health",
                            "/error"
                    ).permitAll();

                    // Interactive API docs map the whole attack surface,
                    // so they are opt-in and stay off in production.
                    String[] docs = {
                            "/swagger-ui/**", "/v3/api-docs/**",
                            "/swagger-ui.html", "/api-docs/**"
                    };
                    if (swaggerEnabled) {
                        auth.requestMatchers(docs).permitAll();
                    } else {
                        auth.requestMatchers(docs).denyAll();
                    }

                    // Admin endpoints - ADMIN role only
                    auth.requestMatchers("/api/admin/**").hasRole("ADMIN");
                    // All other endpoints require authentication
                    auth.anyRequest().authenticated();
                })
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                )
                // IMPORTANT: Don't add filter for public endpoints
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
                // Disable default form login
                .formLogin(AbstractHttpConfigurer::disable)
                // Disable HTTP Basic
                .httpBasic(AbstractHttpConfigurer::disable)
                // Handle exceptions properly
                .exceptionHandling(exception -> exception
                        .authenticationEntryPoint((request, response, authException) -> {
                            response.setContentType("application/json");
                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                            response.getWriter().write("{\"error\": \"Unauthorized\"}");
                        })
                );

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // Allowed browser origins, from app.cors.allowed-origins.
        //
        // This used to be addAllowedOriginPattern("*") together with
        // setAllowCredentials(true), which lets any website on the
        // internet issue credentialed cross-origin calls against this
        // API. That is acceptable on a laptop and dangerous in
        // production, so the list is now explicit and configurable.
        //
        // Note this only constrains browsers: the mobile application is
        // not subject to CORS, so restricting it costs nothing there.
        for (String origin : allowedOrigins.split(",")) {
            String trimmed = origin.trim();
            if (!trimmed.isEmpty()) {
                configuration.addAllowedOriginPattern(trimmed);
            }
        }

        // Allow all methods
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));

        // Allow all headers
        configuration.setAllowedHeaders(List.of("*"));

        // Expose Authorization header
        configuration.setExposedHeaders(List.of("Authorization"));

        // Allow credentials
        configuration.setAllowCredentials(true);

        // Apply to all paths
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}