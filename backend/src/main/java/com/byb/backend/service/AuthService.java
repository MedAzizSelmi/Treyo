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
@RequiredArgsConstructor
public class AuthService {

    private final StudentRepository studentRepository;
    private final TrainerRepository trainerRepository;
    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final VerificationTokenRepository verificationTokenRepository;
    private final EmailService emailService;

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

        // Generate tokens
        String token = jwtService.generateToken(
                student.getEmail(),
                student.getStudentId(),
                Role.STUDENT.name()
        );
        String refreshToken = jwtService.generateRefreshToken(student.getEmail());

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

        // Generate tokens
        String token = jwtService.generateToken(
                trainer.getEmail(),
                trainer.getTrainerId(),
                Role.TRAINER.name()
        );
        String refreshToken = jwtService.generateRefreshToken(trainer.getEmail());

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

    public AuthResponse login(LoginRequest request) {
        // Try to find student
        var studentOpt = studentRepository.findByEmail(request.getEmail());
        if (studentOpt.isPresent()) {
            Student student = studentOpt.get();

            if (!passwordEncoder.matches(request.getPassword(), student.getPasswordHash())) {
                throw new BadCredentialsException("Invalid email or password");
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
            String refreshToken = jwtService.generateRefreshToken(student.getEmail());

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

        // Try to find trainer
        var trainerOpt = trainerRepository.findByEmail(request.getEmail());
        if (trainerOpt.isPresent()) {
            Trainer trainer = trainerOpt.get();

            if (!passwordEncoder.matches(request.getPassword(), trainer.getPasswordHash())) {
                throw new BadCredentialsException("Invalid email or password");
            }

            // Approval gate — trainers can't sign in until an admin
            // has reviewed their onboarding submission and approved
            // them. Surfaced as a specific error string so the mobile
            // login screen can show a friendly explanation instead of
            // a generic "invalid credentials" alert.
            String approval = trainer.getApprovalStatus();
            if (approval == null) approval = "PENDING";
            if ("PENDING".equalsIgnoreCase(approval)) {
                throw new RuntimeException("TRAINER_PENDING_APPROVAL");
            }
            if ("REJECTED".equalsIgnoreCase(approval)) {
                throw new RuntimeException("TRAINER_REJECTED");
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
            String refreshToken = jwtService.generateRefreshToken(trainer.getEmail());

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

        // Try to find admin
        var adminOpt = adminRepository.findByEmail(request.getEmail());
        if (adminOpt.isPresent()) {
            Admin admin = adminOpt.get();

            if (!passwordEncoder.matches(request.getPassword(), admin.getPasswordHash())) {
                throw new BadCredentialsException("Invalid email or password");
            }

            // Update last login
            admin.setLastLoginAt(LocalDateTime.now());
            adminRepository.save(admin);

            // Generate tokens
            String token = jwtService.generateToken(
                    admin.getEmail(),
                    admin.getAdminId(),
                    Role.ADMIN.name()
            );
            String refreshToken = jwtService.generateRefreshToken(admin.getEmail());

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
    public void changePassword(String email, String currentPassword, String newPassword) {
        // Student
        var studentOpt = studentRepository.findByEmail(email);
        if (studentOpt.isPresent()) {
            Student s = studentOpt.get();
            if (!passwordEncoder.matches(currentPassword, s.getPasswordHash())) {
                throw new BadCredentialsException("Current password is incorrect");
            }
            s.setPasswordHash(passwordEncoder.encode(newPassword));
            studentRepository.save(s);
            return;
        }

        // Trainer
        var trainerOpt = trainerRepository.findByEmail(email);
        if (trainerOpt.isPresent()) {
            Trainer t = trainerOpt.get();
            if (!passwordEncoder.matches(currentPassword, t.getPasswordHash())) {
                throw new BadCredentialsException("Current password is incorrect");
            }
            t.setPasswordHash(passwordEncoder.encode(newPassword));
            trainerRepository.save(t);
            return;
        }

        // Admin
        var adminOpt = adminRepository.findByEmail(email);
        if (adminOpt.isPresent()) {
            Admin a = adminOpt.get();
            if (!passwordEncoder.matches(currentPassword, a.getPasswordHash())) {
                throw new BadCredentialsException("Current password is incorrect");
            }
            a.setPasswordHash(passwordEncoder.encode(newPassword));
            adminRepository.save(a);
            return;
        }

        throw new RuntimeException("Account not found");
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
        // Pass the token as the in-email code too — see EmailService
        // for why we surface it twice (button + copyable code).
        emailService.sendVerificationEmail(email, name == null ? "there" : name, link, token);
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
        emailService.sendPasswordResetEmail(email, name, link, token);
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