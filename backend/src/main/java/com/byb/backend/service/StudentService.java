package com.byb.backend.service;

import com.byb.backend.dto.student.StudentProfileResponse;
import com.byb.backend.dto.student.UpdateBasicProfileRequest;
import com.byb.backend.dto.student.UpdateInterestsRequest;
import com.byb.backend.dto.student.UpdateStudentProfileRequest;
import com.byb.backend.model.Student;
import com.byb.backend.repository.StudentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class StudentService {

    private final StudentRepository studentRepository;

    public StudentProfileResponse getProfile(String studentId) {
        Student student = studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found"));

        return mapToProfileResponse(student);
    }

    @Transactional
    public StudentProfileResponse updateInterests(String studentId, UpdateInterestsRequest request) {
        Student student = studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found"));

        student.setPrimaryDomains(request.getPrimaryDomains());
        student.setSpecificInterests(request.getSpecificInterests());
        student.setExperienceLevel(request.getExperienceLevel());

        student = studentRepository.save(student);

        return mapToProfileResponse(student);
    }

    @Transactional
    public StudentProfileResponse updateProfileByEmail(String email, UpdateStudentProfileRequest request) {
        Student student = studentRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Student not found"));

        student.setCvUrl(request.getCvUrl());
        student.setProfessionalExperience(request.getProfessionalExperience());
        student.setKeySkills(request.getKeySkills());
        student.setEducationLevel(request.getEducationLevel());
        student.setTrainingDomain(request.getTrainingDomain());

        student = studentRepository.save(student);
        return mapToProfileResponse(student);
    }

    private StudentProfileResponse mapToProfileResponse(Student student) {
        return StudentProfileResponse.builder()
                .studentId(student.getStudentId())
                .name(student.getName())
                .email(student.getEmail())
                .phone(student.getPhone())
                .address(student.getAddress())
                .city(student.getCity())
                .state(student.getState())
                .postalCode(student.getPostalCode())
                .profilePictureUrl(student.getProfilePictureUrl())
                .bio(student.getBio())
                .primaryDomains(student.getPrimaryDomains())
                .specificInterests(student.getSpecificInterests())
                .experienceLevel(student.getExperienceLevel())
                .cvUrl(student.getCvUrl())
                .professionalExperience(student.getProfessionalExperience())
                .keySkills(student.getKeySkills())
                .educationLevel(student.getEducationLevel())
                .trainingDomain(student.getTrainingDomain())
                .totalCoursesEnrolled(student.getTotalCoursesEnrolled())
                .totalCoursesCompleted(student.getTotalCoursesCompleted())
                .isOnboardingComplete(student.isOnboardingComplete())
                .build();
    }

    public StudentProfileResponse getProfileByEmail(String email) {
        Student student = studentRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Student not found"));
        return mapToProfileResponse(student);
    }

    @Transactional
    public StudentProfileResponse updateBasicProfileByEmail(String email, UpdateBasicProfileRequest request) {
        Student student = studentRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Student not found"));

        if (request.getName() != null && !request.getName().isBlank()) {
            student.setName(request.getName());
        }
        student.setBio(request.getBio());

        student = studentRepository.save(student);
        return mapToProfileResponse(student);
    }

    @Transactional
    public StudentProfileResponse updateProfilePictureByEmail(String email, String profilePictureUrl) {
        Student student = studentRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Student not found"));

        student.setProfilePictureUrl(profilePictureUrl);

        student = studentRepository.save(student);
        return mapToProfileResponse(student);
    }

    @Transactional
    public StudentProfileResponse updateInterestsByEmail(String email, UpdateInterestsRequest request) {
        Student student = studentRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Student not found"));

        student.setPrimaryDomains(request.getPrimaryDomains());
        student.setSpecificInterests(request.getSpecificInterests());
        student.setExperienceLevel(request.getExperienceLevel());

        student = studentRepository.save(student);

        return mapToProfileResponse(student);
    }
}