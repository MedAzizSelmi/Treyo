package com.byb.backend.service;

import com.byb.backend.dto.trainer.*;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class TrainerService {

    /** The shortest bio a trainer may have; raised from 50 to 100 in October 2026. */
    public static final int BIO_MIN = 100;


    private final TrainerRepository trainerRepository;

    public TrainerProfileResponse getProfile(String trainerId) {
        Trainer trainer = trainerRepository.findByTrainerId(trainerId)
                .orElseThrow(() -> new RuntimeException("Trainer not found"));

        return mapToProfileResponse(trainer);
    }

    /**
     * Lookup variant used by the /me endpoints. The JWT carries the user's
     * email as its subject, so the controller can resolve "current user"
     * without needing a trainerId query param.
     */
    public TrainerProfileResponse getProfileByEmail(String email) {
        Trainer trainer = trainerRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Trainer not found: " + email));
        return mapToProfileResponse(trainer);
    }

    @Transactional
    public TrainerProfileResponse updateProfilePage1(String trainerId, TrainerProfilePage1Request request) {
        Trainer trainer = trainerRepository.findByTrainerId(trainerId)
                .orElseThrow(() -> new RuntimeException("Trainer not found"));

        trainer.setPhone(request.getPhone());
        trainer.setAddress(request.getAddress());
        trainer.setCity(request.getCity());
        trainer.setState(request.getState());
        trainer.setPostalCode(request.getPostalCode());

        trainer = trainerRepository.save(trainer);
        return mapToProfileResponse(trainer);
    }

    @Transactional
    public TrainerProfileResponse updateProfilePage2(String trainerId, TrainerProfilePage2Request request) {
        Trainer trainer = trainerRepository.findByTrainerId(trainerId)
                .orElseThrow(() -> new RuntimeException("Trainer not found"));

        trainer.setCvUrl(request.getCvUrl());
        if (request.getExperienceEntries() != null) {
            // Entries, as the onboarding CV screen builds them: the text and
            // the years of experience are made from them.
            var now = java.time.YearMonth.now();
            var entries = com.byb.backend.util.ExperienceEntries.clean(request.getExperienceEntries(), now);
            trainer.setExperienceEntries(com.byb.backend.util.ExperienceEntries.toJson(entries));
            trainer.setProfessionalExperience(com.byb.backend.util.ExperienceEntries.toText(entries));
            trainer.setExperienceYears(com.byb.backend.util.ExperienceEntries.years(entries, now));
        } else {
            trainer.setProfessionalExperience(request.getProfessionalExperience());
            trainer.setExperienceYears(request.getExperienceYears());
        }
        trainer.setSpecializations(request.getSpecializations());
        trainer.setEducation(request.getEducation());
        trainer.setSkills(request.getSkills());
        trainer.setLinkedinUrl(request.getLinkedinUrl());
        trainer.setGithubUrl(request.getGithubUrl());
        trainer.setPortfolioUrl(request.getPortfolioUrl());

        trainer = trainerRepository.save(trainer);
        return mapToProfileResponse(trainer);
    }

    @Transactional
    public TrainerProfileResponse updateProfilePage3(String trainerId, TrainerProfilePage3Request request) {
        Trainer trainer = trainerRepository.findByTrainerId(trainerId)
                .orElseThrow(() -> new RuntimeException("Trainer not found"));

        // The same minimum the app asks for, on onboarding and in edit
        // profile (treyo-mobile constants/profile.ts).
        String bio = request.getBio() == null ? "" : request.getBio().trim();
        if (bio.length() < BIO_MIN) {
            throw new IllegalArgumentException("The bio needs at least " + BIO_MIN + " characters.");
        }
        trainer.setProfilePictureUrl(request.getProfilePictureUrl());
        trainer.setBio(bio);

        trainer = trainerRepository.save(trainer);
        return mapToProfileResponse(trainer);
    }

    /**
     * Trainer's self-controlled availability + capacity. Partial
     * update — only the fields present in the body get applied.
     */
    @Transactional
    public TrainerProfileResponse updateAvailability(String trainerId, java.util.Map<String, Object> body) {
        Trainer trainer = trainerRepository.findByTrainerId(trainerId)
                .orElseThrow(() -> new RuntimeException("Trainer not found"));

        if (body.containsKey("isActive")) {
            Object v = body.get("isActive");
            if (v instanceof Boolean b) {
                trainer.setIsActive(b);
            } else if (v != null) {
                trainer.setIsActive(Boolean.parseBoolean(String.valueOf(v)));
            }
        }
        if (body.containsKey("maxConcurrentGroups")) {
            Object v = body.get("maxConcurrentGroups");
            int parsed;
            if (v instanceof Number n) parsed = n.intValue();
            else { try { parsed = Integer.parseInt(String.valueOf(v).trim()); } catch (Exception e) { parsed = 3; } }
            // Clamp to a sane range. 1..20 covers anyone running a
            // legit training operation without letting someone set a
            // ridiculous cap.
            parsed = Math.max(1, Math.min(20, parsed));
            trainer.setMaxConcurrentGroups(parsed);
        }

        trainer = trainerRepository.save(trainer);
        return mapToProfileResponse(trainer);
    }

    private TrainerProfileResponse mapToProfileResponse(Trainer trainer) {
        // Calculate profile completion status
        boolean page1 = trainer.getPhone() != null && trainer.getAddress() != null;
        boolean page2 = trainer.getSpecializations() != null && trainer.getExperienceYears() != null;
        boolean page3 = trainer.getProfilePictureUrl() != null && trainer.getBio() != null;

        TrainerProfileResponse.ProfileCompletionStatus status =
                TrainerProfileResponse.ProfileCompletionStatus.builder()
                        .page1Complete(page1)
                        .page2Complete(page2)
                        .page3Complete(page3)
                        .allComplete(page1 && page2 && page3)
                        .build();

        return TrainerProfileResponse.builder()
                .trainerId(trainer.getTrainerId())
                .name(trainer.getName())
                .email(trainer.getEmail())
                .phone(trainer.getPhone())
                .address(trainer.getAddress())
                .city(trainer.getCity())
                .state(trainer.getState())
                .postalCode(trainer.getPostalCode())
                .profilePictureUrl(trainer.getProfilePictureUrl())
                .bio(trainer.getBio())
                .cvUrl(trainer.getCvUrl())
                .professionalExperience(trainer.getProfessionalExperience())
                .experienceEntries(com.byb.backend.util.ExperienceEntries.fromJson(trainer.getExperienceEntries()))
                .specializations(trainer.getSpecializations())
                .skills(trainer.getSkills())
                .experienceYears(trainer.getExperienceYears())
                .education(trainer.getEducation())
                .linkedinUrl(trainer.getLinkedinUrl())
                .githubUrl(trainer.getGithubUrl())
                .portfolioUrl(trainer.getPortfolioUrl())
                .maxConcurrentGroups(trainer.getMaxConcurrentGroups())
                .hourlyRate(trainer.getHourlyRate())
                .averageRating(trainer.getAverageRating())
                .totalStudentsTaught(trainer.getTotalStudentsTaught())
                .isProfileComplete(trainer.isProfileComplete())
                .profileCompletionStatus(status)
                .isActive(trainer.getIsActive())
                .build();
    }
}