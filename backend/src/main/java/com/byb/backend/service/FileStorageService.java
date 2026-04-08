package com.byb.backend.service;

import com.byb.backend.config.FileStorageProperties;
import com.byb.backend.exception.FileNotFoundException;
import com.byb.backend.exception.FileStorageException;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FileStorageService {

    private final FileStorageProperties fileStorageProperties;

    /**
     * Store a profile picture
     */
    public String storeProfilePicture(MultipartFile file, String userId, String userType) {
        validateImage(file, fileStorageProperties.getMaxProfilePictureSize());

        String subdirectory = userType.equalsIgnoreCase("student") ? "profiles/students" : "profiles/trainers";
        String filename = userId + "_profile_" + getFileExtension(file);

        return storeFile(file, subdirectory, filename, true);
    }

    /**
     * Store a CV/resume
     */
    public String storeCv(MultipartFile file, String trainerId) {
        validateDocument(file, fileStorageProperties.getMaxDocumentSize());

        String filename = trainerId + "_cv_" + System.currentTimeMillis() + getFileExtension(file);

        return storeFile(file, "documents/cvs", filename, true);
    }

    /**
     * Store a certificate
     */
    public String storeCertificate(MultipartFile file, String trainerId) {
        validateDocument(file, fileStorageProperties.getMaxDocumentSize());

        String filename = trainerId + "_cert_" + UUID.randomUUID().toString().substring(0, 8) + getFileExtension(file);

        return storeFile(file, "documents/certificates", filename, false);
    }

    /**
     * Store course material
     */
    public String storeCourseMaterial(MultipartFile file, String courseId) {
        validateFile(file, fileStorageProperties.getMaxDocumentSize());

        String originalFilename = StringUtils.cleanPath(file.getOriginalFilename());
        String safeFilename = sanitizeFilename(originalFilename);

        return storeFile(file, "courses/" + courseId, safeFilename, false);
    }

    /**
     * Store message attachment
     */
    public String storeMessageAttachment(MultipartFile file, String messageId) {
        validateFile(file, fileStorageProperties.getMaxFileSize());

        String filename = messageId + "_" + System.currentTimeMillis() + getFileExtension(file);

        return storeFile(file, "messages", filename, false);
    }

    /**
     * Generic file storage method
     */
    private String storeFile(MultipartFile file, String subdirectory, String filename, boolean replaceExisting) {
        try {
            if (file.isEmpty()) {
                throw new FileStorageException("Failed to store empty file");
            }

            // Create directory structure
            Path uploadPath = Paths.get(fileStorageProperties.getUploadDir()).resolve(subdirectory);
            Files.createDirectories(uploadPath);

            // If replaceExisting, delete old files with same prefix
            if (replaceExisting) {
                deleteOldFiles(uploadPath, filename.split("_")[0]);
            }

            // Store file
            Path targetLocation = uploadPath.resolve(filename);
            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);

            // Return relative path
            return subdirectory + "/" + filename;

        } catch (IOException ex) {
            throw new FileStorageException("Could not store file " + filename, ex);
        }
    }

    /**
     * Load file as Resource
     */
    public Resource loadFileAsResource(String filePath) {
        try {
            Path file = Paths.get(fileStorageProperties.getUploadDir()).resolve(filePath).normalize();
            Resource resource = new UrlResource(file.toUri());

            if (resource.exists() && resource.isReadable()) {
                return resource;
            } else {
                throw new FileNotFoundException("File not found: " + filePath);
            }
        } catch (MalformedURLException ex) {
            throw new FileNotFoundException("File not found: " + filePath, ex);
        }
    }

    /**
     * Delete a file
     */
    public void deleteFile(String filePath) {
        try {
            Path file = Paths.get(fileStorageProperties.getUploadDir()).resolve(filePath).normalize();
            Files.deleteIfExists(file);
        } catch (IOException ex) {
            throw new FileStorageException("Could not delete file: " + filePath, ex);
        }
    }

    /**
     * Delete old files with same prefix (for profile picture updates)
     */
    private void deleteOldFiles(Path directory, String prefix) {
        try {
            Files.list(directory)
                    .filter(path -> path.getFileName().toString().startsWith(prefix))
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException e) {
                            // Log but don't fail
                            System.err.println("Could not delete old file: " + path);
                        }
                    });
        } catch (IOException ex) {
            // Log but don't fail upload
            System.err.println("Could not list directory for cleanup: " + directory);
        }
    }

    /**
     * Validate image file
     */
    private void validateImage(MultipartFile file, long maxSize) {
        if (file.getSize() > maxSize) {
            throw new FileStorageException("File size exceeds maximum allowed size: " + (maxSize / 1048576) + "MB");
        }

        String contentType = file.getContentType();
        if (contentType == null || !Arrays.asList(fileStorageProperties.getAllowedImageTypes()).contains(contentType)) {
            throw new FileStorageException("Invalid file type. Only images are allowed (JPEG, PNG, GIF, WebP)");
        }
    }

    /**
     * Validate document file
     */
    private void validateDocument(MultipartFile file, long maxSize) {
        if (file.getSize() > maxSize) {
            throw new FileStorageException("File size exceeds maximum allowed size: " + (maxSize / 1048576) + "MB");
        }

        String contentType = file.getContentType();
        if (contentType == null || !Arrays.asList(fileStorageProperties.getAllowedDocumentTypes()).contains(contentType)) {
            throw new FileStorageException("Invalid file type. Only PDF, DOC, DOCX, XLS, XLSX, TXT are allowed");
        }
    }

    /**
     * Validate any file (image, document, or archive)
     */
    private void validateFile(MultipartFile file, long maxSize) {
        if (file.getSize() > maxSize) {
            throw new FileStorageException("File size exceeds maximum allowed size: " + (maxSize / 1048576) + "MB");
        }

        String contentType = file.getContentType();
        if (contentType == null) {
            throw new FileStorageException("Could not determine file type");
        }

        boolean isValidType = Arrays.asList(fileStorageProperties.getAllowedImageTypes()).contains(contentType) ||
                Arrays.asList(fileStorageProperties.getAllowedDocumentTypes()).contains(contentType) ||
                Arrays.asList(fileStorageProperties.getAllowedArchiveTypes()).contains(contentType);

        if (!isValidType) {
            throw new FileStorageException("Invalid file type. Allowed: images, documents (PDF, DOC, DOCX), archives (ZIP)");
        }
    }

    /**
     * Get file extension
     */
    private String getFileExtension(MultipartFile file) {
        String originalFilename = file.getOriginalFilename();
        if (originalFilename != null && originalFilename.contains(".")) {
            return originalFilename.substring(originalFilename.lastIndexOf("."));
        }

        // Fallback based on content type
        String contentType = file.getContentType();
        if (contentType != null) {
            if (contentType.contains("jpeg") || contentType.contains("jpg")) return ".jpg";
            if (contentType.contains("png")) return ".png";
            if (contentType.contains("gif")) return ".gif";
            if (contentType.contains("webp")) return ".webp";
            if (contentType.contains("pdf")) return ".pdf";
        }

        return ".dat";
    }

    /**
     * Sanitize filename to prevent directory traversal
     */
    private String sanitizeFilename(String filename) {
        // Remove path characters
        filename = filename.replaceAll("[/\\\\]", "_");
        // Remove special characters
        filename = filename.replaceAll("[^a-zA-Z0-9._-]", "_");
        // Limit length
        if (filename.length() > 100) {
            String extension = getFileExtension(filename);
            filename = filename.substring(0, 100 - extension.length()) + extension;
        }
        return filename;
    }

    private String getFileExtension(String filename) {
        if (filename != null && filename.contains(".")) {
            return filename.substring(filename.lastIndexOf("."));
        }
        return "";
    }
}