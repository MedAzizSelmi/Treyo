package com.byb.backend.service;

import com.byb.backend.dto.auth.*;
import com.byb.backend.model.Admin;
import com.byb.backend.model.Role;
import com.byb.backend.model.Student;
import com.byb.backend.model.Trainer;
import com.byb.backend.model.VerificationToken;
import com.byb.backend.repository.AdminRepository;
import com.byb.backend.repository.StudentRepository;
import com.byb.backend.repository.TrainerRepository;
import com.byb.backend.repository.VerificationTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class AuthService {

    private final StudentRepository studentRepository;
    private final TrainerRepository trainerRepository;
    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final VerificationTokenRepository verificationTokenRepository;
    private final EmailService emailService;
    private final TwoFactorService twoFactorService;

    /** Base URL used to build the verification / reset links in emails.
     *  In production this should point at a website that deep-links into
     *  the app. For dev it can be a local HTML page or the Expo dev URL —
     *  whatever the user reads the email on needs to be able to follow it. */
    @Value("${app.url:https://treyo.app}")
    private String appUrl;

    private static final SecureRandom RANDOM = new SecureRandom();

    /** Generate a 32-byte URL-safe random token. Long enough to be
     *  unguessable; short enough to fit in a Mailgun link. */
    private String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** Create + save a new token of the given purpose. Returns the
     *  plain token string the caller will email out. */
    private String issueToken(String email, VerificationToken.Purpose purpose, int ttlMinutes) {
        VerificationToken token = new VerificationToken();
        token.setTokenId("VTK_" + UUID.randomUUID().toString().substring(0, 12).toUpperCase());
        token.setToken(randomToken());
        token.setEmail(email);
        token.setPurpose(purpose);
        token.setExpiresAt(LocalDateTime.now().plusMinutes(ttlMinutes));
        token.setUsed(false);
        verificationTokenRepository.save(token);
        return token.getToken();
    }

    /**
     * Sign in (or sign up) with an identity a provider has already
     * verified — Google, Apple or LinkedIn.
     *
     * The identity reaching this method has been checked against the
     * provider's signing keys by {@link SocialIdentityService}; nothing
     * here trusts the client.
     *
     * Matching is by email address, so someone who registered with a
     * password and later taps "Continue with Google" lands in the same
     * account instead of acquiring a second one. No email verification
     * step: the provider has already done it, which is the whole value
     * of the flow.
     *
     * @param userType only consulted when the account does not exist yet
     *                 — an existing learner does not become a trainer by
     *                 signing in from the trainer screen.
     */
    @Transactional
    public AuthResponse socialLogin(SocialIdentityService.SocialIdentity identity, String userType) {
        String email = identity.email().toLowerCase();

        var studentOpt = studentRepository.findByEmail(email);
        if (studentOpt.isPresent()) {
            Student student = studentOpt.get();
            if (!Boolean.TRUE.equals(student.getIsActive())) {
                throw new RuntimeException("ACCOUNT_DISABLED");
            }
            // A provider-verified address verifies the account too: it is
            // the same proof the emailed link was asking for.
            student.setIsVerified(true);
            studentRepository.save(student);

            // The second factor applies here as well. Google having
            // vouched for the address says nothing about whether this
            // person holds the authenticator, and letting a provider
            // bypass it would turn "sign in with Google" into a way
            // around 2FA for anyone who got into the Google account.
            if (Boolean.TRUE.equals(student.getTwoFactorEnabled())) {
                return twoFactorChallenge(
                        student.getEmail(), student.getStudentId(), Role.STUDENT);
            }

            student.setLastLoginAt(LocalDateTime.now());
            studentRepository.save(student);
            return studentResponse(student);
        }

        var trainerOpt = trainerRepository.findByEmail(email);
        if (trainerOpt.isPresent()) {
            Trainer trainer = trainerOpt.get();
            if (!Boolean.TRUE.equals(trainer.getIsActive())) {
                throw new RuntimeException("ACCOUNT_DISABLED");
            }
            trainer.setIsVerified(true);
            String approval = trainer.getApprovalStatus() == null ? "PENDING" : trainer.getApprovalStatus();
            // Same rule as the password path: PENDING only blocks once
            // there is a submitted profile to review.
            if ("PENDING".equalsIgnoreCase(approval) && trainer.isProfileComplete()) {
                throw new RuntimeException("TRAINER_PENDING_APPROVAL");
            }
            if ("REJECTED".equalsIgnoreCase(approval)) {
                throw new RuntimeException("TRAINER_REJECTED");
            }

            // Second factor applies to provider sign-in too; see the
            // student branch above for why.
            if (Boolean.TRUE.equals(trainer.getTwoFactorEnabled())) {
                return twoFactorChallenge(
                        trainer.getEmail(), trainer.getTrainerId(), Role.TRAINER);
            }

            trainer.setLastLoginAt(LocalDateTime.now());
            trainerRepository.save(trainer);
            return trainerResponse(trainer);
        }

        // First time: create the account the caller asked for.
        String name = identity.name() == null || identity.name().isBlank()
                ? email.substring(0, email.indexOf('@'))
                : identity.name();
        // There is no password to sign in with; the provider is the only
        // way into this account until the user sets one through the
        // forgot-password flow.
        String unusablePassword = passwordEncoder.encode(UUID.randomUUID().toString());

        if ("TRAINER".equalsIgnoreCase(userType)) {
            Trainer trainer = new Trainer();
            trainer.setTrainerId("TRN_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
            trainer.setName(name);
            trainer.setEmail(email);
            trainer.setPasswordHash(unusablePassword);
            trainer.setIsActive(true);
            trainer.setIsVerified(true);
            trainer.setIsAvailable(true);
            trainer.setApprovalStatus("PENDING");
            trainer = trainerRepository.save(trainer);
            log.info("Trainer account created via {} for {}", identity.provider(), email);
            return trainerResponse(trainer);
        }

        Student student = new Student();
        student.setStudentId("STU_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        student.setName(name);
        student.setEmail(email);
        student.setPasswordHash(unusablePassword);
        student.setIsActive(true);
        student.setIsVerified(true);
        student = studentRepository.save(student);
        log.info("Student account created via {} for {}", identity.provider(), email);
        return studentResponse(student);
    }

    private AuthResponse studentResponse(Student student) {
        return AuthResponse.builder()
                .token(jwtService.generateToken(student.getEmail(), student.getStudentId(), Role.STUDENT.name()))
                .refreshToken(jwtService.generateRefreshToken(student.getEmail(), student.getStudentId(), Role.STUDENT.name()))
                .userId(student.getStudentId())
                .email(student.getEmail())
                .name(student.getName())
                .role(Role.STUDENT)
                .onboardingComplete(student.isOnboardingComplete())
                .build();
    }

    private AuthResponse trainerResponse(Trainer trainer) {
        return AuthResponse.builder()
                .token(jwtService.generateToken(trainer.getEmail(), trainer.getTrainerId(), Role.TRAINER.name()))
                .refreshToken(jwtService.generateRefreshToken(trainer.getEmail(), trainer.getTrainerId(), Role.TRAINER.name()))
                .userId(trainer.getTrainerId())
                .email(trainer.getEmail())
                .name(trainer.getName())
                .role(Role.TRAINER)
                .onboardingComplete(trainer.isProfileComplete())
                .build();
    }

    /**
     * The answer to a correct password on an account with 2FA enabled.
     *
     * Carries no access or refresh token on purpose: everything the
     * client needs to continue is the challenge, and anything else here
     * would be a way around the second factor.
     */
    private AuthResponse twoFactorChallenge(String email, String userId, Role role) {
        return AuthResponse.builder()
                .twoFactorRequired(true)
                .challengeToken(jwtService.generateTwoFactorChallenge(email, userId, role.name()))
                .email(email)
                .role(role)
                .build();
    }

    /**
     * Second half of a two-factor sign-in: exchange the challenge and a
     * code for real tokens.
     *
     * The challenge proves the password was right, and is checked for
     * both its signature and its type — a refresh or access token
     * presented here is refused, so this cannot be used as a way to mint
     * fresh credentials from an existing session.
     */
    @Transactional
    public AuthResponse completeTwoFactor(String challengeToken, String code) {
        if (challengeToken == null || !jwtService.isValidTwoFactorChallenge(challengeToken)) {
            throw new RuntimeException("CHALLENGE_EXPIRED");
        }
        String email = jwtService.extractUsername(challengeToken);
        if (email == null || !twoFactorService.verifyChallenge(email, code)) {
            throw new RuntimeException("INVALID_CODE");
        }

        var studentOpt = studentRepository.findByEmail(email);
        if (studentOpt.isPresent()) {
            Student student = studentOpt.get();
            if (!Boolean.TRUE.equals(student.getIsActive())) {
                throw new RuntimeException("ACCOUNT_DISABLED");
            }
            student.setLastLoginAt(LocalDateTime.now());
            studentRepository.save(student);
            return studentResponse(student);
        }

        Trainer trainer = trainerRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("ACCOUNT_NOT_FOUND"));
        if (!Boolean.TRUE.equals(trainer.getIsActive())) {
            throw new RuntimeException("ACCOUNT_DISABLED");
        }
        trainer.setLastLoginAt(LocalDateTime.now());
        trainerRepository.save(trainer);
        return trainerResponse(trainer);
    }

    @Transactional
    public AuthResponse registerStudent(RegisterStudentRequest request) {
        // Check if email already exists
        if (studentRepository.existsByEmail(request.getEmail()) ||
                trainerRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("Email already registered");
        }

        // Create student
        Student student = new Student();
        student.setStudentId("STU_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        student.setName(request.getName());
        student.setEmail(request.getEmail());
        student.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        student.setIsActive(true);
        student.setIsVerified(false);

        student = studentRepository.save(student);

        // Fire off the verification email. Async — the response is
        // returned to the client before the SMTP round-trip completes.
        sendVerificationEmail(student.getEmail(), student.getName());

        // No token: the address has to be confirmed first. Registration
        // used to sign the user straight in, which made the verification
        // link optional in practice — the account was already usable. The
        // client shows "check your inbox" and the user signs in once the
        // link is clicked, at which point login issues the tokens.
        return AuthResponse.builder()
                .userId(student.getStudentId())
                .email(student.getEmail())
                .name(student.getName())
                .role(Role.STUDENT)
                .onboardingComplete(student.isOnboardingComplete())
                .build();
    }

    @Transactional
    public AuthResponse registerTrainer(RegisterTrainerRequest request) {
        // Check if email already exists
        if (studentRepository.existsByEmail(request.getEmail()) ||
                trainerRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("Email already registered");
        }

        // Create trainer
        Trainer trainer = new Trainer();
        trainer.setTrainerId("TRN_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        trainer.setName(request.getName());
        trainer.setEmail(request.getEmail());
        trainer.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        trainer.setIsActive(true);
        trainer.setIsVerified(false);
        trainer.setIsAvailable(true);
        // New trainers always start as PENDING — admin reviews their
        // onboarding submission (see AdminController.approveTrainer /
        // rejectTrainer). Defaults to PENDING via the entity, set
        // explicitly here for readability.
        trainer.setApprovalStatus("PENDING");

        trainer = trainerRepository.save(trainer);

        // Fire off the verification email — same async flow as student signup.
        sendVerificationEmail(trainer.getEmail(), trainer.getName());

        // No token, for the same reason as student signup: the address is
        // confirmed before the account can be used. A trainer then still
        // faces the approval gate at login, after verification.
        return AuthResponse.builder()
                .userId(trainer.getTrainerId())
                .email(trainer.getEmail())
                .name(trainer.getName())
                .role(Role.TRAINER)
                .onboardingComplete(trainer.isProfileComplete())
                .build();
    }

    public AuthResponse login(LoginRequest request) {
        // Try to find student.
        //
        // NOTE: the password check is part of the guard, not a throw inside
        // the block. One email can legitimately exist in more than one table
        // — promoting a student/trainer to admin creates an Admin row while
        // leaving the original row intact. Throwing on the first mismatch
        // meant a promoted user could never sign in with their admin
        // password, because the student lookup matched the email, failed the
        // password, and aborted before the admin branch ran. Falling through
        // lets each account type be tried in turn.
        var studentOpt = studentRepository.findByEmail(request.getEmail());
        if (studentOpt.isPresent()
                && passwordEncoder.matches(request.getPassword(), studentOpt.get().getPasswordHash())) {
            Student student = studentOpt.get();

            // Verification gate. isVerified was written at registration and
            // flipped by /auth/verify-email, but nothing ever read it, so a
            // confirmation link was decorative: an unverified address could
            // sign in exactly like a verified one. Surfaced as a specific
            // error string so the login screen can offer to resend the mail
            // instead of showing "invalid credentials".
            if (!Boolean.TRUE.equals(student.getIsVerified())) {
                throw new RuntimeException("EMAIL_NOT_VERIFIED");
            }

            // Second factor, if this account enrolled one. No access or
            // refresh token is minted here — only a short-lived challenge
            // the caller exchanges at /api/auth/2fa/verify once they have
            // supplied a code. lastLoginAt is left alone too: the sign-in
            // has not happened yet.
            if (Boolean.TRUE.equals(student.getTwoFactorEnabled())) {
                return twoFactorChallenge(
                        student.getEmail(), student.getStudentId(), Role.STUDENT);
            }

            // Update last login
            student.setLastLoginAt(LocalDateTime.now());
            studentRepository.save(student);

            // Generate tokens
            String token = jwtService.generateToken(
                    student.getEmail(),
                    student.getStudentId(),
                    Role.STUDENT.name()
            );
            String refreshToken = jwtService.generateRefreshToken(student.getEmail(), student.getStudentId(), Role.STUDENT.name());

            return AuthResponse.builder()
                    .token(token)
                    .refreshToken(refreshToken)
                    .userId(student.getStudentId())
                    .email(student.getEmail())
                    .name(student.getName())
                    .role(Role.STUDENT)
                    .onboardingComplete(student.isOnboardingComplete())
                    .build();
        }

        // Try to find trainer. Same fall-through rule as the student branch
        // above — the approval gate below still throws, but only *after* the
        // password has actually matched.
        var trainerOpt = trainerRepository.findByEmail(request.getEmail());
        if (trainerOpt.isPresent()
                && passwordEncoder.matches(request.getPassword(), trainerOpt.get().getPasswordHash())) {
            Trainer trainer = trainerOpt.get();

            // Same verification gate as the student branch, checked before
            // the approval one: an unverified address should be told to
            // confirm its email rather than to wait for an administrator.
            if (!Boolean.TRUE.equals(trainer.getIsVerified())) {
                throw new RuntimeException("EMAIL_NOT_VERIFIED");
            }

            // Approval gate — trainers can't sign in until an admin
            // has reviewed their onboarding submission and approved
            // them. Surfaced as a specific error string so the mobile
            // login screen can show a friendly explanation instead of
            // a generic "invalid credentials" alert.
            String approval = trainer.getApprovalStatus();
            if (approval == null) approval = "PENDING";
            // PENDING blocks the platform, not onboarding. A trainer who
            // has not finished their profile has nothing for an
            // administrator to review yet, and signup no longer hands out
            // a token (the address is verified first), so refusing them
            // here would leave them unable to ever submit an application.
            // They sign in, complete onboarding, and are blocked from then
            // on until a decision is made.
            if ("PENDING".equalsIgnoreCase(approval) && trainer.isProfileComplete()) {
                throw new RuntimeException("TRAINER_PENDING_APPROVAL");
            }
            if ("REJECTED".equalsIgnoreCase(approval)) {
                throw new RuntimeException("TRAINER_REJECTED");
            }

            // Second factor, as in the student branch above.
            if (Boolean.TRUE.equals(trainer.getTwoFactorEnabled())) {
                return twoFactorChallenge(
                        trainer.getEmail(), trainer.getTrainerId(), Role.TRAINER);
            }

            // Update last login
            trainer.setLastLoginAt(LocalDateTime.now());
            trainerRepository.save(trainer);

            // Generate tokens
            String token = jwtService.generateToken(
                    trainer.getEmail(),
                    trainer.getTrainerId(),
                    Role.TRAINER.name()
            );
            String refreshToken = jwtService.generateRefreshToken(trainer.getEmail(), trainer.getTrainerId(), Role.TRAINER.name());

            return AuthResponse.builder()
                    .token(token)
                    .refreshToken(refreshToken)
                    .userId(trainer.getTrainerId())
                    .email(trainer.getEmail())
                    .name(trainer.getName())
                    .role(Role.TRAINER)
                    .onboardingComplete(trainer.isProfileComplete())
                    .build();
        }

        // Try to find admin. Last in the chain, so a promoted user whose
        // student/trainer password didn't match still lands here and can
        // sign in with their admin (temporary) password.
        var adminOpt = adminRepository.findByEmail(request.getEmail());
        if (adminOpt.isPresent()
                && passwordEncoder.matches(request.getPassword(), adminOpt.get().getPasswordHash())) {
            Admin admin = adminOpt.get();

            // Update last login
            admin.setLastLoginAt(LocalDateTime.now());
            adminRepository.save(admin);

            // Generate tokens
            String token = jwtService.generateToken(
                    admin.getEmail(),
                    admin.getAdminId(),
                    Role.ADMIN.name()
            );
            String refreshToken = jwtService.generateRefreshToken(admin.getEmail(), admin.getAdminId(), Role.ADMIN.name());

            return AuthResponse.builder()
                    .token(token)
                    .refreshToken(refreshToken)
                    .userId(admin.getAdminId())
                    .email(admin.getEmail())
                    .name(admin.getName())
                    .role(Role.ADMIN)
                    .onboardingComplete(true)
                    .build();
        }

        throw new BadCredentialsException("Invalid email or password");
    }

    /**
     * Change the password of the currently-authenticated user.
     * Looks up the account by email (the JWT subject), verifies the current
     * password, then hashes and stores the new one. Works for students,
     * trainers, and admins — whichever table the email lives in.
     */
    @Transactional
    /**
     * Exchange a valid refresh token for a fresh access token.
     *
     * Access tokens are deliberately short-lived (one hour), which is only
     * workable if the client can renew them silently — otherwise a user is
     * signed out mid-session every hour. The refresh token carries the
     * same identity claims, so the replacement access token is issued for
     * exactly the account the session began with.
     *
     * The refresh token itself is returned unchanged rather than rotated:
     * rotation needs server-side state to detect replay, which this
     * stateless design does not have. Revocation today means changing
     * jwt.secret, which invalidates every token at once.
     */
    public AuthResponse refreshAccessToken(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new BadCredentialsException("Refresh token is required");
        }

        final String email;
        try {
            if (jwtService.isTokenExpired(refreshToken)) {
                throw new BadCredentialsException("Refresh token has expired");
            }
            email = jwtService.extractUsername(refreshToken);
        } catch (BadCredentialsException e) {
            throw e;
        } catch (Exception e) {
            // Malformed or wrong signature — do not echo the parser detail.
            throw new BadCredentialsException("Invalid refresh token");
        }

        String role = jwtService.extractRole(refreshToken);

        // Resolve the account, preferring the role recorded in the token so
        // a user who exists in more than one table keeps the same session
        // identity. Tokens issued before the claims existed fall back to a
        // lookup by email.
        if (role == null || "STUDENT".equalsIgnoreCase(role)) {
            var s = studentRepository.findByEmail(email).orElse(null);
            if (s != null) {
                return AuthResponse.builder()
                        .token(jwtService.generateToken(s.getEmail(), s.getStudentId(), Role.STUDENT.name()))
                        .refreshToken(refreshToken)
                        .userId(s.getStudentId())
                        .email(s.getEmail())
                        .name(s.getName())
                        .role(Role.STUDENT)
                        .onboardingComplete(s.isOnboardingComplete())
                        .build();
            }
        }

        if (role == null || "TRAINER".equalsIgnoreCase(role)) {
            var t = trainerRepository.findByEmail(email).orElse(null);
            if (t != null) {
                // Re-check the approval gate: an administrator may have
                // suspended this trainer since the session started.
                String approval = t.getApprovalStatus() == null ? "PENDING" : t.getApprovalStatus();
                if (!"APPROVED".equalsIgnoreCase(approval)) {
                    throw new BadCredentialsException("Account is not approved");
                }
                return AuthResponse.builder()
                        .token(jwtService.generateToken(t.getEmail(), t.getTrainerId(), Role.TRAINER.name()))
                        .refreshToken(refreshToken)
                        .userId(t.getTrainerId())
                        .email(t.getEmail())
                        .name(t.getName())
                        .role(Role.TRAINER)
                        .onboardingComplete(t.isProfileComplete())
                        .build();
            }
        }

        if (role == null || "ADMIN".equalsIgnoreCase(role)) {
            var a = adminRepository.findByEmail(email).orElse(null);
            if (a != null) {
                return AuthResponse.builder()
                        .token(jwtService.generateToken(a.getEmail(), a.getAdminId(), Role.ADMIN.name()))
                        .refreshToken(refreshToken)
                        .userId(a.getAdminId())
                        .email(a.getEmail())
                        .name(a.getName())
                        .role(Role.ADMIN)
                        .onboardingComplete(true)
                        .build();
            }
        }

        throw new BadCredentialsException("Account not found");
    }

    @Transactional
    public void changePassword(String email, String role, String currentPassword, String newPassword) {
        // Role-first, because one email can exist in more than one table:
        // promoting a student/trainer to admin creates an Admin row and
        // leaves the original intact. Scanning student-then-trainer-then-
        // admin would let an admin "change their password" in the admin
        // dashboard and silently rewrite their old student password
        // instead — the caller's JWT role tells us which account they are
        // actually signed in as.
        String r = role == null ? "" : role.trim().toUpperCase();

        if ("ADMIN".equals(r)) {
            Admin a = adminRepository.findByEmail(email)
                    .orElseThrow(() -> new RuntimeException("Account not found"));
            requireCurrentPassword(currentPassword, a.getPasswordHash());
            a.setPasswordHash(passwordEncoder.encode(newPassword));
            adminRepository.save(a);
            return;
        }

        if ("TRAINER".equals(r)) {
            Trainer t = trainerRepository.findByEmail(email)
                    .orElseThrow(() -> new RuntimeException("Account not found"));
            requireCurrentPassword(currentPassword, t.getPasswordHash());
            t.setPasswordHash(passwordEncoder.encode(newPassword));
            trainerRepository.save(t);
            return;
        }

        if ("STUDENT".equals(r)) {
            Student s = studentRepository.findByEmail(email)
                    .orElseThrow(() -> new RuntimeException("Account not found"));
            requireCurrentPassword(currentPassword, s.getPasswordHash());
            s.setPasswordHash(passwordEncoder.encode(newPassword));
            studentRepository.save(s);
            return;
        }

        // No usable role on the token — fall back to the historical scan
        // so an older client can still change a password.
        var studentOpt = studentRepository.findByEmail(email);
        if (studentOpt.isPresent()) {
            Student s = studentOpt.get();
            requireCurrentPassword(currentPassword, s.getPasswordHash());
            s.setPasswordHash(passwordEncoder.encode(newPassword));
            studentRepository.save(s);
            return;
        }

        var trainerOpt = trainerRepository.findByEmail(email);
        if (trainerOpt.isPresent()) {
            Trainer t = trainerOpt.get();
            requireCurrentPassword(currentPassword, t.getPasswordHash());
            t.setPasswordHash(passwordEncoder.encode(newPassword));
            trainerRepository.save(t);
            return;
        }

        var adminOpt = adminRepository.findByEmail(email);
        if (adminOpt.isPresent()) {
            Admin a = adminOpt.get();
            requireCurrentPassword(currentPassword, a.getPasswordHash());
            a.setPasswordHash(passwordEncoder.encode(newPassword));
            adminRepository.save(a);
            return;
        }

        throw new RuntimeException("Account not found");
    }

    private void requireCurrentPassword(String supplied, String storedHash) {
        if (!passwordEncoder.matches(supplied, storedHash)) {
            throw new BadCredentialsException("Current password is incorrect");
        }
    }

    // ── Email verification ────────────────────────────────────────────────

    /**
     * Issue a fresh verification token and email it. Called from
     * signup and from the "resend verification" endpoint.
     */
    @Transactional
    public void sendVerificationEmail(String email, String name) {
        String token = issueToken(email, VerificationToken.Purpose.EMAIL_VERIFY, 24 * 60);
        String link = appUrl + "/verify-email?token=" + token;
        emailService.sendVerificationEmail(email, name == null ? "there" : name, link);
    }

    /** Resend handler that looks up the user's name first. Returns
     *  silently for unknown emails so we don't leak account existence
     *  via the resend endpoint. */
    @Transactional
    public void resendVerification(String email) {
        var studentOpt = studentRepository.findByEmail(email);
        if (studentOpt.isPresent()) {
            Student s = studentOpt.get();
            if (Boolean.TRUE.equals(s.getIsVerified())) return; // already verified
            sendVerificationEmail(s.getEmail(), s.getName());
            return;
        }
        var trainerOpt = trainerRepository.findByEmail(email);
        if (trainerOpt.isPresent()) {
            Trainer t = trainerOpt.get();
            if (Boolean.TRUE.equals(t.getIsVerified())) return;
            sendVerificationEmail(t.getEmail(), t.getName());
        }
        // Silent on unknown email — see note above.
    }

    /**
     * Consume an EMAIL_VERIFY token and flip the matching user's
     * isVerified flag. Throws if the token is missing, expired, used,
     * or of the wrong purpose. Tokens are single-use even if the
     * verification ultimately failed — we don't replay them.
     */
    @Transactional
    public void verifyEmail(String tokenValue) {
        VerificationToken token = verificationTokenRepository.findByToken(tokenValue)
                .orElseThrow(() -> new RuntimeException("Invalid or expired link"));
        if (token.getPurpose() != VerificationToken.Purpose.EMAIL_VERIFY) {
            throw new RuntimeException("Invalid link");
        }
        if (Boolean.TRUE.equals(token.getUsed())) {
            throw new RuntimeException("This link has already been used");
        }
        if (token.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("This link has expired. Please request a new one.");
        }

        // Flip the verified flag on whichever account this email belongs to.
        var studentOpt = studentRepository.findByEmail(token.getEmail());
        if (studentOpt.isPresent()) {
            Student s = studentOpt.get();
            s.setIsVerified(true);
            studentRepository.save(s);
        } else {
            var trainerOpt = trainerRepository.findByEmail(token.getEmail());
            if (trainerOpt.isPresent()) {
                Trainer t = trainerOpt.get();
                t.setIsVerified(true);
                trainerRepository.save(t);
            } else {
                throw new RuntimeException("Account not found");
            }
        }

        token.setUsed(true);
        token.setUsedAt(LocalDateTime.now());
        verificationTokenRepository.save(token);
    }

    // ── Password reset ────────────────────────────────────────────────────

    /**
     * Issue a reset token and email it. Silently does nothing for
     * unknown emails so the endpoint can't be used to enumerate
     * accounts. Caller always sees a success response either way.
     */
    @Transactional
    public void forgotPassword(String email) {
        String name = null;
        var studentOpt = studentRepository.findByEmail(email);
        if (studentOpt.isPresent()) {
            name = studentOpt.get().getName();
        } else {
            var trainerOpt = trainerRepository.findByEmail(email);
            if (trainerOpt.isPresent()) name = trainerOpt.get().getName();
        }
        if (name == null) {
            // Unknown email — drop on the floor. See javadoc.
            return;
        }

        String token = issueToken(email, VerificationToken.Purpose.PASSWORD_RESET, 15);
        String link = appUrl + "/reset-password?token=" + token;
        emailService.sendPasswordResetEmail(email, name, link);
    }

    /**
     * Consume a PASSWORD_RESET token and set a new password for the
     * associated account. Like email verification: token is one-use,
     * expired tokens reject, wrong purpose rejects.
     */
    @Transactional
    public void resetPassword(String tokenValue, String newPassword) {
        if (newPassword == null || newPassword.length() < 8) {
            throw new RuntimeException("Password must be at least 8 characters");
        }
        VerificationToken token = verificationTokenRepository.findByToken(tokenValue)
                .orElseThrow(() -> new RuntimeException("Invalid or expired link"));
        if (token.getPurpose() != VerificationToken.Purpose.PASSWORD_RESET) {
            throw new RuntimeException("Invalid link");
        }
        if (Boolean.TRUE.equals(token.getUsed())) {
            throw new RuntimeException("This link has already been used");
        }
        if (token.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("This link has expired. Please request a new one.");
        }

        String email = token.getEmail();
        String hash = passwordEncoder.encode(newPassword);

        var studentOpt = studentRepository.findByEmail(email);
        if (studentOpt.isPresent()) {
            Student s = studentOpt.get();
            s.setPasswordHash(hash);
            studentRepository.save(s);
        } else {
            var trainerOpt = trainerRepository.findByEmail(email);
            if (trainerOpt.isPresent()) {
                Trainer t = trainerOpt.get();
                t.setPasswordHash(hash);
                trainerRepository.save(t);
            } else {
                throw new RuntimeException("Account not found");
            }
        }

        token.setUsed(true);
        token.setUsedAt(LocalDateTime.now());
        verificationTokenRepository.save(token);
    }
}