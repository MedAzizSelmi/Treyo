package com.byb.backend.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeIn;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.context.annotation.Configuration;

/**
 * Declares the bearer scheme the controllers already reference with
 * {@code @SecurityRequirement(name = "bearerAuth")}.
 *
 * Without this declaration the name resolves to nothing: springdoc still
 * renders every endpoint, but Swagger UI shows no "Authorize" button, so
 * no request it sends carries a token and every secured call comes back
 * 401 or 403 — which looks like a broken endpoint rather than a missing
 * credential.
 *
 * Paste only the token into the dialog. Swagger adds the "Bearer "
 * prefix itself, because the scheme is declared as HTTP bearer.
 */
@Configuration
@OpenAPIDefinition(info = @Info(
        title = "Treyo API",
        version = "v1",
        description = "Trainer–learner matching platform."))
@SecurityScheme(
        name = "bearerAuth",
        type = SecuritySchemeType.HTTP,
        scheme = "bearer",
        bearerFormat = "JWT",
        in = SecuritySchemeIn.HEADER,
        description = "JWT issued by POST /api/auth/login.")
public class OpenApiConfig {
}
