package com.byb.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Course prices are set before VAT, and the learner pays them plus VAT.
 *
 * That is a business decision taken in October 2026: the app labels every
 * price "HT" (excl. VAT), so the card has to be charged the price with VAT
 * on top or the label and the bank statement would disagree. Before, the
 * listed price was charged as it stood and the receipt worked the VAT out
 * of it.
 *
 * One place for the rule, so the amount the gateway is asked for and the
 * total the app shows before payment cannot drift apart. ReceiptService
 * derives its HT/TVA breakdown from the amount actually charged, which
 * stays right either way.
 *
 * Read from the same settings the receipt uses. Whether these sales carry
 * VAT at all is still LeanConsulting's accountant's call: with
 * receipt.vat.enabled=false the rate is zero, the price is charged as it
 * stands, and the app drops the HT label.
 */
@Component
public class VatPolicy {

    @Value("${receipt.vat.enabled:true}")
    private boolean enabled;

    @Value("${receipt.vat.rate:19}")
    private BigDecimal rate;

    /** The VAT rate in percent, or zero when VAT is not applied. */
    public BigDecimal rate() {
        return enabled && rate != null && rate.signum() > 0 ? rate : BigDecimal.ZERO;
    }

    /**
     * What the learner pays for a price set before VAT, to the millime —
     * the gateway's smallest unit. Null and zero stay as they are.
     */
    public BigDecimal withVat(BigDecimal priceExclVat) {
        if (priceExclVat == null) return null;
        BigDecimal multiplier = BigDecimal.ONE.add(rate().movePointLeft(2));
        return priceExclVat.multiply(multiplier).setScale(3, RoundingMode.HALF_UP);
    }
}
