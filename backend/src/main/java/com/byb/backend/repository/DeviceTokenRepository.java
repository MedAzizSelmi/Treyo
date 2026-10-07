package com.byb.backend.repository;

import com.byb.backend.model.DeviceToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
public interface DeviceTokenRepository extends JpaRepository<DeviceToken, String> {

    Optional<DeviceToken> findByToken(String token);

    List<DeviceToken> findByUserId(String userId);

    /**
     * Carries its own transaction so it works from anywhere — the logout
     * endpoint has one, but the push sender runs @Async with none, and a
     * derived delete without a transaction just throws.
     */
    @Modifying
    @Transactional
    void deleteByToken(String token);
}
