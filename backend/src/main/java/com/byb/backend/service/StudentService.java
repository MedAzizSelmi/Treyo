package com.byb.backend.service;

import com.byb.backend.model.Levels;
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
    private final SkillOptionService skillOptionService;

    public StudentProfileResponse getProfile(String studentId) {
        Student student = studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found"));

        return mapToProfileResponse(student);
    }

    /**
     * Returns only the fields that are safe to expose to other users
     * (e.g. group-chat members tapping an avatar). NO email / phone /
     * address — those stay on /me and never leak through this endpoint.
     */
    public java.util.Map<String, Object> getPublicProfile(String studentId) {
        Student s = studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found: " + studentId));

        java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("studentId", s.getStudentId());
        m.put("name", s.getName());
        m.put("profilePictureUrl", s.getProfilePictureUrl());
        m.put("bio", s.getBio());
        m.put("primaryDomains", s.getPrimaryDomains());
        m.put("specificInterests", s.getSpecificInterests());
        m.put("experienceLevel", s.getExperienceLevel());
        return m;
    }

    @Transactional
    public StudentProfileResponse updateInterests(String studentId, UpdateInterestsRequest request) {
        Student student = studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found"));

        // Only fields and skills from the administrators' list: the skills
        // show on the learner's public profile, so free text would be shown
        // to everyone.
        String[] skills = skillOptionService.checkChoices(request.getPrimaryDomains(), request.getSpecificInterests());
        student.setPrimaryDomains(request.getPrimaryDomains());
        student.setSpecificInterests(skills);
        student.setExperienceLevel(Levels.normalize(request.getExperienceLevel()));

        student = studentRepository.save(student);

        return mapToProfileResponse(student);
    }

    @Transactional
    public StudentProfileResponse updateProfileByEmail(String email, UpdateStudentProfileRequest request) {
        Student student = studentRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Student not found"));

        student.setCvUrl(request.getCvUrl());
        if (request.getExperienceEntries() != null) {
            // Entries, as the onboarding CV screen and edit profile build
            // them; the text is made from them so older readers still work.
            var entries = com.byb.backend.util.ExperienceEntries.clean(request.getExperienceEntries(), java.time.YearMonth.now());
            student.setExperienceEntries(com.byb.backend.util.ExperienceEntries.toJson(entries));
            student.setProfessionalExperience(com.byb.backend.util.ExperienceEntries.toText(entries));
        } else if (request.getProfessionalExperience() != null) {
            // Text from an older app: it replaces the entries it no longer matches.
            student.setProfessionalExperience(request.getProfessionalExperience());
            student.setExperienceEntries(null);
        }
        // Neither sent: the experience is left as it is — edit profile only
        // sends it when it was changed.
        student.setKeySkills(request.getKeySkills());
        student.setEducationLevel(request.getEducationLevel());
        student.setTrainingDomain(request.getTrainingDomain());
        student.setLinkedinUrl(request.getLinkedinUrl());
        student.setPortfolioUrl(request.getPortfolioUrl());

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
                .experienceEntries(com.byb.backend.util.ExperienceEntries.fromJson(student.getExperienceEntries()))
                .keySkills(student.getKeySkills())
                .educationLevel(student.getEducationLevel())
                .trainingDomain(student.getTrainingDomain())
                .totalCoursesEnrolled(student.getTotalCoursesEnrolled())
                .totalCoursesCompleted(student.getTotalCoursesCompleted())
                .isOnboardingComplete(student.isOnboardingComplete())
                .linkedinUrl(student.getLinkedinUrl())
                .portfolioUrl(student.getPortfolioUrl())
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

    /** Onboarding's contact step, the same one trainers have. */
    @Transactional
    public StudentProfileResponse updateContactByEmail(String email,
                                                       com.byb.backend.dto.student.UpdateContactRequest request) {
        Student student = studentRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Student not found"));
        student.setPhone(request.getPhone().trim());
        student.setAddress(request.getAddress().trim());
        student.setCity(request.getCity().trim());
        student.setState(request.getState().trim());
        student.setPostalCode(request.getPostalCode().trim());
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

        // Only fields and skills from the administrators' list: the skills
        // show on the learner's public profile, so free text would be shown
        // to everyone.
        String[] skills = skillOptionService.checkChoices(request.getPrimaryDomains(), request.getSpecificInterests());
        student.setPrimaryDomains(request.getPrimaryDomains());
        student.setSpecificInterests(skills);
        student.setExperienceLevel(Levels.normalize(request.getExperienceLevel()));

        student = studentRepository.save(student);

        return mapToProfileResponse(student);
    }
}