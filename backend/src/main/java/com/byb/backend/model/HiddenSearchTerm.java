package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * A search an administrator hid from the "searches that found nothing"
 * list — noise, or something already handled. Stored by its matching key
 * (TextMatch.key), so "Power BI" and "powerbi" stay hidden together.
 */
@Entity
@Table(name = "hidden_search_terms")
@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class HiddenSearchTerm extends BaseEntity {

    @Id
    @Column(name = "term_key", length = 200)
    private String termKey;

    /** The search as it was shown when hidden, for reference. */
    @Column(name = "label", length = 200)
    private String label;

    @Column(name = "hidden_by", length = 50)
    private String hiddenBy;
}
