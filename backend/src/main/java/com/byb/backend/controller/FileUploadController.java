package com.byb.backend.controller;

import com.byb.backend.service.FileStorageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/files")
@RequiredArgsConstructor
@Tag(name = "File Upload", description = "File upload and download endpoints")
public class FileUploadController {

    private final FileStorageService fileStorageService;

    /**
     * Upload profile picture
     */
    @PostMapping("/upload/profile-picture")
    @Operation(summary = "Upload profile picture")
    public ResponseEntity<Map<String, String>> uploadProfilePicture(
            @RequestParam("file") MultipartFile file,
            @RequestParam("userId") String userId,
            @RequestParam("userType") String userType
    ) {
        String filePath = fileStorageService.storeProfilePicture(file, userId, userType);

        Map<String, String> response = new HashMap<>();
        response.put("message", "Profile picture uploaded successfully");
        response.put("filePath", filePath);
        response.put("fileUrl", "/api/files/download/" + filePath.replace("/", "$"));

        return ResponseEntity.ok(response);
    }

    /**
     * Upload CV/Resume
     */
    @PostMapping("/upload/cv")
    @Operation(summary = "Upload CV/Resume (trainers only)")
    public ResponseEntity<Map<String, String>> uploadCv(
            @RequestParam("file") MultipartFile file,
            @RequestParam("trainerId") String trainerId
    ) {
        String filePath = fileStorageService.storeCv(file, trainerId);

        Map<String, String> response = new HashMap<>();
        response.put("message", "CV uploaded successfully");
        response.put("filePath", filePath);
        response.put("fileUrl", "/api/files/download/" + filePath.replace("/", "$"));

        return ResponseEntity.ok(response);
    }

    /**
     * Upload certificate
     */
    @PostMapping("/upload/certificate")
    @Operation(summary = "Upload certificate (trainers only)")
    public ResponseEntity<Map<String, String>> uploadCertificate(
            @RequestParam("file") MultipartFile file,
            @RequestParam("trainerId") String trainerId
    ) {
        String filePath = fileStorageService.storeCertificate(file, trainerId);

        Map<String, String> response = new HashMap<>();
        response.put("message", "Certificate uploaded successfully");
        response.put("filePath", filePath);
        response.put("fileUrl", "/api/files/download/" + filePath.replace("/", "$"));

        return ResponseEntity.ok(response);
    }

    /**
     * Upload course material
     */
    @PostMapping("/upload/course-material")
    @Operation(summary = "Upload course material")
    public ResponseEntity<Map<String, String>> uploadCourseMaterial(
            @RequestParam("file") MultipartFile file,
            @RequestParam("courseId") String courseId
    ) {
        String filePath = fileStorageService.storeCourseMaterial(file, courseId);

        Map<String, String> response = new HashMap<>();
        response.put("message", "Course material uploaded successfully");
        response.put("filePath", filePath);
        response.put("fileUrl", "/api/files/download/" + filePath.replace("/", "$"));

        return ResponseEntity.ok(response);
    }

    /**
     * Upload message attachment
     */
    @PostMapping("/upload/message-attachment")
    @Operation(summary = "Upload message attachment")
    public ResponseEntity<Map<String, String>> uploadMessageAttachment(
            @RequestParam("file") MultipartFile file,
            @RequestParam("messageId") String messageId
    ) {
        String filePath = fileStorageService.storeMessageAttachment(file, messageId);

        Map<String, String> response = new HashMap<>();
        response.put("message", "Attachment uploaded successfully");
        response.put("filePath", filePath);
        response.put("fileUrl", "/api/files/download/" + filePath.replace("/", "$"));

        return ResponseEntity.ok(response);
    }

    /**
     * Download/view file
     */
    @GetMapping("/download/{encodedFilePath}")
    @Operation(summary = "Download or view file")
    public ResponseEntity<Resource> downloadFile(
            @PathVariable String encodedFilePath,
            HttpServletRequest request
    ) {
        // Decode file path (replace $ with /)
        String filePath = encodedFilePath.replace("$", "/");

        // Load file as Resource
        Resource resource = fileStorageService.loadFileAsResource(filePath);

        // Determine content type
        String contentType = null;
        try {
            contentType = request.getServletContext().getMimeType(resource.getFile().getAbsolutePath());
        } catch (IOException ex) {
            contentType = "application/octet-stream";
        }

        if (contentType == null) {
            contentType = "application/octet-stream";
        }

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + resource.getFilename() + "\"")
                .body(resource);
    }

    /**
     * Delete file
     */
    @DeleteMapping("/delete")
    @Operation(summary = "Delete file")
    public ResponseEntity<Map<String, String>> deleteFile(@RequestParam String filePath) {
        fileStorageService.deleteFile(filePath);

        Map<String, String> response = new HashMap<>();
        response.put("message", "File deleted successfully");

        return ResponseEntity.ok(response);
    }
}