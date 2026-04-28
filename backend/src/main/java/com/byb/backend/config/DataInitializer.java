package com.byb.backend.config;

import com.byb.backend.model.Admin;
import com.byb.backend.repository.AdminRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer implements CommandLineRunner {

    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        // Create default admin if none exists
        if (adminRepository.count() == 0) {
            Admin admin = new Admin();
            admin.setAdminId("ADM_00000001");
            admin.setName("Admin");
            admin.setEmail("admin@treyo.com");
            admin.setPasswordHash(passwordEncoder.encode("admin123"));
            admin.setIsActive(true);
            admin.setCreatedAt(java.time.LocalDateTime.now());
            admin.setUpdatedAt(java.time.LocalDateTime.now());
            adminRepository.save(admin);
            log.info("Default admin created: admin@treyo.com / admin123");
        }
    }
}
