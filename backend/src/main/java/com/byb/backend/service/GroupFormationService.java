package com.byb.backend.service;

import com.byb.backend.model.Course;
import com.byb.backend.model.Group;
import com.byb.backend.model.Interaction;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.GroupRepository;
import com.byb.backend.repository.InteractionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class GroupFormationService {

    private final GroupRepository groupRepository;
    private final CourseRepository courseRepository;
    private final InteractionRepository interactionRepository;
    private final NotificationService notificationService;

    @Transactional
    public void checkAndFormGroup(String courseId) {
        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new RuntimeException("Course not found"));

        // Get interested students count
        long interestedCount = interactionRepository.countInterestedStudents(courseId);

        // Check if minimum students reached
        if (interestedCount >= course.getMinStudentsRequired()) {
            // Check if there's already a forming group
            var existingGroup = groupRepository.findFormingGroupByCourse(courseId);

            if (existingGroup.isEmpty()) {
                // Create new group
                createFormingGroup(course, (int) interestedCount);

                // Notify all interested students
                notifyInterestedStudents(courseId, (int) interestedCount);
            }
        }
    }

    @Transactional
    public Group createFormingGroup(Course course, int interestedCount) {
        Group group = new Group();
        group.setGroupId("GRP_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        group.setCourseId(course.getCourseId());
        group.setTrainerId(course.getTrainerId());
        group.setGroupName(course.getTitle() + " - Group 1");
        group.setCurrentSize(0); // Will be updated as students confirm
        group.setMaxSize(course.getMaxStudentsPerGroup());
        group.setGroupStatus("forming");
        group.setIsOnline(course.getFormat() != null &&
                course.getFormat().toLowerCase().contains("online"));

        return groupRepository.save(group);
    }

    private void notifyInterestedStudents(String courseId, int interestedCount) {
        // Get all students who clicked "interested"
        List<Interaction> interactions = interactionRepository.findByCourseId(courseId)
                .stream()
                .filter(i -> "clicked_interested".equals(i.getInteractionType()))
                .collect(Collectors.toList());

        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new RuntimeException("Course not found"));

        // Send notification to each interested student
        for (Interaction interaction : interactions) {
            notificationService.sendGroupFormingNotification(
                    interaction.getStudentId(),
                    courseId,
                    course.getTitle(),
                    interestedCount,
                    course.getMinStudentsRequired()
            );
        }

        // Notify trainer too
        notificationService.sendGroupFormingNotificationToTrainer(
                course.getTrainerId(),
                courseId,
                course.getTitle(),
                interestedCount
        );
    }

    @Transactional
    public void activateGroup(String groupId) {
        Group group = groupRepository.findByGroupId(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));

        group.setGroupStatus("active");
        group.setStartDate(LocalDateTime.now());

        groupRepository.save(group);
    }
}