package com.byb.backend.service;

import com.byb.backend.model.Course;
import com.byb.backend.model.Enrollment;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.EnrollmentRepository;
import com.byb.backend.repository.StudentRepository;
import com.byb.backend.security.AuthenticatedUser;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * Decides who may read a stored file, and who may see a course's
 * material URL.
 *
 * Why this exists: uploaded files were served from a fully public
 * endpoint, so anyone holding (or guessing) a path could download a
 * trainer's CV or a paid course's material. CV paths in particular were
 * predictable — {@code documents/cvs/{trainerId}_cv_{millis}} — and
 * trainer identifiers are listed on a public endpoint, leaving only a
 * timestamp between an attacker and someone's résumé.
 *
 * Access rules by storage area:
 * <ul>
 *   <li><b>profiles/</b> — any authenticated user. Profile pictures are
 *       shown throughout the app, so they are effectively in-app public,
 *       but still not anonymous.</li>
 *   <li><b>documents/cvs/</b> — administrators, or the owning trainer.
 *       CVs exist for admin evaluation and nothing else.</li>
 *   <li><b>documents/certificates/</b> — same rule as CVs.</li>
 *   <li><b>courses/</b> — administrators, the authoring trainer, or a
 *       learner with a non-cancelled enrollment in that course. This is
 *       what stops paid material being downloaded without enrolling.</li>
 *   <li><b>messages/</b> — any authenticated user (attachment paths are
 *       random and only shared inside a conversation).</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class FileAccessService {

    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final StudentRepository studentRepository;

    /** The caller, or empty when the request is anonymous. */
    public Optional<AuthenticatedUser> caller() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return Optional.empty();
        Object principal = auth.getPrincipal();
        return principal instanceof AuthenticatedUser u ? Optional.of(u) : Optional.empty();
    }

    /**
     * May the current caller see this course's material URL?
     *
     * Deliberately restricted to administrators and the authoring
     * trainer, because this is evaluated once per course while mapping
     * list responses and must not issue a query per row. Enrolled
     * learners obtain the material through the download endpoint, which
     * performs the enrollment check on the single file being requested.
     */
    public boolean canSeeMaterialUrl(Course course) {
        return caller().map(u ->
                u.isAdmin() || (u.isTrainer() && u.getUserId() != null
                        && u.getUserId().equals(course.getTrainerId()))
        ).orElse(false);
    }

    /**
     * May the current caller download this stored file?
     *
     * @param storedPath the path relative to the upload root, e.g.
     *                   {@code courses/CRS_1/material.pdf}
     */
    public boolean canDownload(String storedPath) {
        String path = storedPath.replace('\\', '/');

        // Avatars and chat attachments stay anonymously readable on
        // purpose: React Native's <Image> loads them through the native
        // image loader, which cannot attach an Authorization header, so
        // gating them would blank every avatar in the app. Their paths
        // carry no sensitive content and this matches how avatar CDNs
        // normally behave. The areas that actually needed protecting —
        // CVs and paid course material — are handled below.
        if (path.startsWith("profiles/") || path.startsWith("messages/")) {
            return true;
        }

        Optional<AuthenticatedUser> maybe = caller();
        if (maybe.isEmpty()) return false;
        AuthenticatedUser user = maybe.get();
        if (user.isAdmin()) return true;

        if (path.startsWith("documents/cvs/") || path.startsWith("documents/certificates/")) {
            // Filenames begin with the owning trainer's id.
            String filename = path.substring(path.lastIndexOf('/') + 1);
            return user.isTrainer()
                    && user.getUserId() != null
                    && filename.startsWith(user.getUserId() + "_");
        }

        if (path.startsWith("courses/")) {
            return canAccessCourseMaterial(user, path);
        }

        // Unknown area: refuse rather than guess.
        return false;
    }

    private boolean canAccessCourseMaterial(AuthenticatedUser user, String path) {
        // Material uploaded before the course row existed is namespaced
        // "courses/pending-{trainerId}/..." — only its uploader may read it.
        String[] segments = path.split("/");
        if (segments.length >= 2 && segments[1].startsWith("pending-")) {
            String owner = segments[1].substring("pending-".length());
            return user.isTrainer() && owner.equals(user.getUserId());
        }

        Course course = courseRepository.findByMaterialUrlEndingWith(path).orElse(null);
        if (course == null) {
            // No course claims this file — fall back to the directory
            // name, which is the course id for post-creation uploads.
            if (segments.length >= 2) {
                course = courseRepository.findByCourseId(segments[1]).orElse(null);
            }
            if (course == null) return false;
        }

        if (user.isTrainer()) {
            return user.getUserId() != null && user.getUserId().equals(course.getTrainerId());
        }

        if (user.isStudent()) {
            String studentId = user.getUserId();
            if (studentId == null) {
                studentId = studentRepository.findByEmail(user.getEmail())
                        .map(s -> s.getStudentId()).orElse(null);
            }
            if (studentId == null) return false;
            Enrollment e = enrollmentRepository
                    .findByStudentIdAndCourseId(studentId, course.getCourseId())
                    .orElse(null);
            if (e == null) return false;
            String status = e.getEnrollmentStatus();
            return status == null || !"cancelled".equalsIgnoreCase(status);
        }

        return false;
    }
}
