package com.byb.backend.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.ThreadPoolExecutor;

/**
 * The thread pool behind every {@code @Async} method.
 *
 * Without this bean the application logged, on the first async call:
 *
 *   More than one TaskExecutor bean found within the context, and none
 *   is named 'taskExecutor' … [clientInboundChannelExecutor,
 *   clientOutboundChannelExecutor, brokerChannelExecutor]
 *
 * Those three belong to the STOMP/WebSocket machinery. Spring could not
 * choose between them, so it fell back to SimpleAsyncTaskExecutor, which
 * starts a brand new thread per invocation and pools nothing. Since every
 * notification fires a push through {@code @Async}, that meant a thread
 * per notification — fine for one admin test, not for a broadcast to
 * every student at once.
 *
 * The work here is I/O bound (an HTTP round-trip to Expo), so threads
 * spend their time waiting rather than computing, and a small pool with a
 * generous queue fits better than one thread per core.
 */
@Configuration
@Slf4j
public class AsyncConfig {

    /**
     * Named "taskExecutor" deliberately: that is the name Spring looks
     * for when several TaskExecutor beans exist, and it is what silences
     * the warning above rather than merely hiding it.
     */
    @Bean("taskExecutor")
    public TaskExecutor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(16);
        executor.setQueueCapacity(500);
        executor.setThreadNamePrefix("async-");
        // If the queue ever fills, run the task on the calling thread
        // instead of discarding it. A slower request is a better outcome
        // than a notification that silently never goes out.
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        // Let in-flight pushes finish on shutdown rather than vanishing.
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(20);
        executor.initialize();
        return executor;
    }
}
