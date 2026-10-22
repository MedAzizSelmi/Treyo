package com.byb.backend.service;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Course prices are HT and learners pay them plus VAT. The total charged
 * has to be exact to the millime, and the receipt — which works the HT
 * figure back out of what was charged — has to land on the price the
 * admin set.
 */
class VatPolicyTest {

    private static VatPolicy policy(boolean enabled, String rate) {
        VatPolicy p = new VatPolicy();
        ReflectionTestUtils.setField(p, "enabled", enabled);
        ReflectionTestUtils.setField(p, "rate", new BigDecimal(rate));
        return p;
    }

    @Test
    void addsVatToTheMillime() {
        VatPolicy vat = policy(true, "19");
        assertEquals(new BigDecimal("119.000"), vat.withVat(new BigDecimal("100")));
        assertEquals(new BigDecimal("53.550"), vat.withVat(new BigDecimal("45")));
        assertEquals(new BigDecimal("39.666"), vat.withVat(new BigDecimal("33.333")));
        assertEquals(new BigDecimal("19"), vat.rate());
    }

    @Test
    void freeStaysFreeAndMissingStaysMissing() {
        VatPolicy vat = policy(true, "19");
        assertEquals(0, vat.withVat(BigDecimal.ZERO).signum());
        assertNull(vat.withVat(null));
    }

    @Test
    void withVatSwitchedOffThePriceIsChargedAsItStands() {
        VatPolicy vat = policy(false, "19");
        assertEquals(0, vat.rate().signum());
        assertEquals(new BigDecimal("100.000"), vat.withVat(new BigDecimal("100")));
    }

    /**
     * ReceiptService derives HT as total / 1.19, rounded to the millime.
     * Rounding the total costs at most half a millime, and dividing by
     * 1.19 shrinks that, so the receipt always recovers the exact price.
     * Checked across every millime up to 1000 TND in steps that cover
     * each last digit.
     */
    @Test
    void theReceiptRecoversTheExactPrice() {
        VatPolicy vat = policy(true, "19");
        BigDecimal divisor = new BigDecimal("1.19");
        for (long millimes = 1; millimes <= 1_000_000; millimes += 997) {
            BigDecimal price = BigDecimal.valueOf(millimes, 3);
            BigDecimal charged = vat.withVat(price);
            BigDecimal ht = charged.divide(divisor, 3, RoundingMode.HALF_UP);
            assertEquals(price, ht, "price " + price + " charged " + charged);
        }
    }
}
