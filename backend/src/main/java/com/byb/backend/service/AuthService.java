package com.byb.backend.service;

import com.byb.backend.dto.auth.*;
import com.byb.backend.model.Admin;
import com.byb.backend.model.Role;
import com.byb.backend.model.Student;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.AdminRepository;
import com.byb.backend.repository.StudentRepository;
import com.byb.backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final StudentRepository studentRepository;
    private final TrainerRepository trainerRepository;
    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

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

        trainer = trainerRepository.save(trainer);

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
}