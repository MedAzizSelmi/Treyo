package com.byb.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * @EnableJpaAuditing activates the AuditingEntityListener registered on
 * BaseEntity so @CreatedDate / @LastModifiedDate fields auto-populate on
 * every INSERT/UPDATE. Without this, new entities (e.g. course_templates)
 * fail with NOT NULL violations on created_at. Pre-existing tables only
 * worked because of legacy PostgreSQL DEFAULT constraints from older
 * Hibernate-generated schemas.
 */
@SpringBootApplication
@EnableJpaAuditing
@EnableAsync // PushNotificationService.sendToUser is @Async — let the chat
              // POST return as soon as the message is saved, without
              // waiting on Expo's push API round-trip.
@EnableScheduling // FeedGenerationService.dailyJob runs at 06:00 server time
                  // to generate that day's AI feed posts via Gemini.
public class BackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }

}
