package com.byb.backend.repository;

import com.byb.backend.model.DeviceToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DeviceTokenRepository extends JpaRepository<DeviceToken, String> {

    Optional<DeviceToken> findByToken(String token);

    List<DeviceToken> findByUserId(String userId);

    void deleteByToken(String token);
}
