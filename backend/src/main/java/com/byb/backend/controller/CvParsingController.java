package com.byb.backend.controller;

import com.byb.backend.service.CvParsingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/**
 * Onboarding CV parsing.
 *
 * The file is forwarded to Affinda by the server, so the API key stays
 * out of the mobile bundle. Authenticated: onboarding happens after the
 * first sign-in, so every caller has a token.
 *
 * The response is Affinda's parsed document, unchanged, because the two
 * onboarding screens already know how to read that shape. An empty
 * object means "could not parse" — the screens then leave the form for
 * the user to fill, which is what they did before any of this existed.
 */
@RestController
@RequestMapping("/api/cv")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "CV parsing", description = "Pre-fill onboarding from an uploaded CV")
@SecurityRequirement(name = "bearerAuth")
public class CvParsingController {

    private final CvParsingService cvParsingService;

    @PostMapping(value = "/parse", consumes = "multipart/form-data")
    @Operation(summary = "Parse a CV and return the extracted fields")
    public ResponseEntity<?> parse(@RequestParam("file") MultipartFile file) {
        try {
            return ResponseEntity.ok(cvParsingService.parse(file));
        } catch (CvParsingService.InvalidCvException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (RuntimeException e) {
            log.error("CV parsing failed", e);
            // Not a 5xx: parsing is best-effort and the client is expected
            // to carry on with manual entry.
            return ResponseEntity.ok(Map.of());
        }
    }
}
