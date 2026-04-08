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

    private final TrainerRepository trainerRepository;

    public TrainerProfileResponse getProfile(String trainerId) {
        Trainer trainer = trainerRepository.findByTrainerId(trainerId)
                .orElseThrow(() -> new RuntimeException("Trainer not found"));

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
        trainer.setProfessionalExperience(request.getProfessionalExperience());
        trainer.setSpecializations(request.getSpecializations());
        trainer.setExperienceYears(request.getExperienceYears());
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

        trainer.setProfilePictureUrl(request.getProfilePictureUrl());
        trainer.setBio(request.getBio());

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
                .build();
    }
}