package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * Generic key-value store for admin-tunable settings that don't
 * warrant their own dedicated column somewhere. Kept intentionally
 * shallow — one row per setting, string value. Callers deserialize.
 *
 * Current users: revenue currency code (key = "revenue.currency").
 */
@Entity
@Table(name = "system_settings")
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class SystemSetting extends BaseEntity {

    @Id
    @Column(name = "setting_key", length = 80)
    private String key;

    @Column(name = "setting_value", length = 500)
    private String value;
}
