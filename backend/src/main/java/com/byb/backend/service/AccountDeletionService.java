package com.byb.backend.service;

import com.byb.backend.model.*;
import com.byb.backend.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Account deletion, as required by the app stores (Google Play mandates
 * an in-app route and a web-accessible one) and by any sane reading of
 * data-protection law.
 *
 * ── Why the row survives ────────────────────────────────────────────
 * Deleting it is not an option: enrollments are financial records,
 * reviews carry ratings that other people's averages depend on, and
 * group messages belong to conversations other members can still read.
 * All of them reference the account by id, so removing the row would
 * either cascade away other people's data or break referential
 * integrity.
 *
 * So the personal data is erased and the shell is kept:
 *
 *   deleted outright  device tokens, verification tokens, notifications,
 *                     search history, feed reactions, interactions
 *   anonymised        name, email, phone, address, photo, bio, CV and
 *                     every profile field; review free text
 *   kept              enrollments and payments (accounting), review
 *                     ratings (other people's averages), messages
 *                     (other members' conversations)
 *
 * The account cannot be signed into afterwards: the password hash is
 * replaced with a random value nobody holds, and isActive goes false.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AccountDeletionService {

    private final StudentRepository studentRepository;
    private final TrainerRepository trainerRepository;
    private final DeviceTokenRepository deviceTokenRepository;
    private final NotificationRepository notificationRepository;
    private final SearchLogRepository searchLogRepository;
    private final FeedReactionRepository feedReactionRepository;
    private final InteractionRepository interactionRepository;
    private final ReviewRepository reviewRepository;
    private final CourseRepository courseRepository;

    /** Marker put in place of a name, so the UI has something to show. */
    private static final String ANON_NAME = "Deleted user";

    @Transactional
    public void deleteStudent(String studentId) {
        Student student = studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new IllegalArgumentException("Account not found"));

        purgeCommon(studentId);
        searchLogRepository.deleteAll(searchLogRepository.findByStudentId(studentId));
        interactionRepository.deleteAll(interactionRepository.findByStudentId(studentId));

        // Reviews: the scores stay (course and trainer averages are built
        // from them and belong to the courses, not to the author), the
        // free text goes — that is the part that is personal.
        List<Review> reviews = reviewRepository.findByStudentId(studentId);
        reviews.forEach(r -> {
            r.setCourseFeedback(null);
            r.setTrainerFeedback(null);
        });
        reviewRepository.saveAll(reviews);

        student.setName(ANON_NAME);
        student.setEmail(deletedEmail(studentId));
        student.setPhone(null);
        student.setAddress(null);
        student.setCity(null);
        student.setState(null);
        student.setPostalCode(null);
        student.setProfilePictureUrl(null);
        student.setBio(null);
        student.setCvUrl(null);
        student.setLinkedinUrl(null);
        student.setPortfolioUrl(null);
        student.setProfessionalExperience(null);
        student.setPrimaryDomains(new String[0]);
        student.setSpecificInterests(new String[0]);
        student.setKeySkills(new String[0]);
        student.setEducationLevel(null);
        student.setTrainingDomain(null);
        student.setExperienceLevel(null);
        student.setEngagementType(null);
        lockOut(student::setPasswordHash, student::setIsActive, student::setIsVerified);
        studentRepository.save(student);

        log.info("Student account {} deleted (personal data erased)", studentId);
    }

    @Transactional
    public void deleteTrainer(String trainerId) {
        Trainer trainer = trainerRepository.findByTrainerId(trainerId)
                .orElseThrow(() -> new IllegalArgumentException("Account not found"));

        purgeCommon(trainerId);

        // Their courses stop being offered. Groups already running are
        // left alone on purpose: learners paid for them, and an
        // administrator has to reassign or close them deliberately.
        List<Course> courses = courseRepository.findByTrainerId(trainerId);
        courses.forEach(c -> {
            c.setIsActive(false);
            c.setIsPublished(false);
        });
        courseRepository.saveAll(courses);

        List<Review> reviews = reviewRepository.findByTrainerId(trainerId);
        reviews.forEach(r -> r.setTrainerFeedback(null));
        reviewRepository.saveAll(reviews);

        trainer.setName(ANON_NAME);
        trainer.setEmail(deletedEmail(trainerId));
        trainer.setPhone(null);
        trainer.setAddress(null);
        trainer.setCity(null);
        trainer.setState(null);
        trainer.setPostalCode(null);
        trainer.setProfilePictureUrl(null);
        trainer.setBio(null);
        trainer.setCvUrl(null);
        trainer.setLinkedinUrl(null);
        trainer.setGithubUrl(null);
        trainer.setPortfolioUrl(null);
        trainer.setProfessionalExperience(null);
        trainer.setEducation(null);
        trainer.setSpecializations(new String[0]);
        trainer.setSkills(new String[0]);
        trainer.setIsAvailable(false);
        lockOut(trainer::setPasswordHash, trainer::setIsActive, trainer::setIsVerified);
        trainerRepository.save(trainer);

        log.info("Trainer account {} deleted (personal data erased, {} course(s) withdrawn)",
                trainerId, courses.size());
    }

    /** Rows that are purely personal and belong to nobody else. */
    private void purgeCommon(String userId) {
        deviceTokenRepository.deleteAll(deviceTokenRepository.findByUserId(userId));
        notificationRepository.deleteAll(notificationRepository.findByUserId(userId));
        feedReactionRepository.deleteAll(feedReactionRepository.findByUserId(userId));
    }

    /**
     * An address nobody can receive mail at, unique so the column's
     * uniqueness constraint still holds if several accounts are deleted.
     */
    private String deletedEmail(String id) {
        return "deleted+" + id.toLowerCase() + "@treyo.invalid";
    }

    /** Make the account unusable: no password anyone knows, inactive. */
    private void lockOut(java.util.function.Consumer<String> setHash,
                         java.util.function.Consumer<Boolean> setActive,
                         java.util.function.Consumer<Boolean> setVerified) {
        // Not a hash of anything: a random string in the hash column can
        // never match a BCrypt comparison, so sign-in is impossible.
        setHash.accept("deleted-" + UUID.randomUUID());
        setActive.accept(false);
        setVerified.accept(false);
    }

    /** Timestamp helper kept for callers that log the event. */
    public LocalDateTime now() {
        return LocalDateTime.now();
    }
}
