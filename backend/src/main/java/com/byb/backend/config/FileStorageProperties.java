package com.byb.backend.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "file.storage")
@Data
public class FileStorageProperties {

    private String uploadDir = "uploads";
    private long maxFileSize = 10485760; // 10MB in bytes
    private long maxProfilePictureSize = 5242880; // 5MB
    private long maxDocumentSize = 20971520; // 20MB

    private String[] allowedImageTypes = {
            "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"
    };

    private String[] allowedDocumentTypes = {
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
            "text/plain"
    };

    private String[] allowedArchiveTypes = {
            "application/zip",
            "application/x-zip-compressed",
            "application/x-rar-compressed"
    };
}