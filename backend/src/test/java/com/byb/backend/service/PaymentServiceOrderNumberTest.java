package com.byb.backend.service;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The orderNumber ClicToPay stores has two hard constraints from the
 * spec (CTP-API-BASIC-01 §4): it is AN..32, and it must be unique per
 * merchant — a repeat is rejected with errorCode 1, which would break
 * every retry after a refused card.
 *
 * These run without a Spring context: the repositories and WebClient are
 * never touched by the composition logic.
 */
class PaymentServiceOrderNumberTest {

    private final PaymentService service = new PaymentService(null, null, null, null);

    private String compose(String studentId, String courseId, String groupId) throws Exception {
        Method m = PaymentService.class.getDeclaredMethod(
                "composeOrderId", String.class, String.class, String.class);
        m.setAccessible(true);
        return (String) m.invoke(service, studentId, courseId, groupId);
    }

    @Test
    void fitsThe32CharacterLimitWithAGroup() throws Exception {
        String order = compose("STU_1A2B3C4D", "CRS_EEAF0596", "GRP_9F8E7D6C");
        assertTrue(order.length() <= 32, "orderNumber too long: " + order);
    }

    @Test
    void roundTripsBackToTheOriginalIdentifiers() throws Exception {
        String order = compose("STU_1A2B3C4D", "CRS_EEAF0596", "GRP_9F8E7D6C");
        PaymentService.OrderId parsed = service.parseOrderId(order);
        assertNotNull(parsed);
        assertEquals("STU_1A2B3C4D", parsed.studentId());
        assertEquals("CRS_EEAF0596", parsed.courseId());
        assertEquals("GRP_9F8E7D6C", parsed.groupId());
    }

    @Test
    void roundTripsWithoutAGroup() throws Exception {
        String order = compose("STU_1A2B3C4D", "CRS_EEAF0596", null);
        PaymentService.OrderId parsed = service.parseOrderId(order);
        assertNotNull(parsed);
        assertEquals("STU_1A2B3C4D", parsed.studentId());
        assertEquals("CRS_EEAF0596", parsed.courseId());
        assertNull(parsed.groupId());
    }

    @Test
    void everyAttemptProducesADistinctOrderNumber() throws Exception {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 500; i++) {
            seen.add(compose("STU_1A2B3C4D", "CRS_EEAF0596", "GRP_9F8E7D6C"));
        }
        // Retrying a refused payment must not reuse a rejected orderNumber.
        assertTrue(seen.size() > 490, "nonce collides too often: " + seen.size() + "/500");
    }

    @Test
    void matchesOnlyTheStudentAndCourseThatPaid() throws Exception {
        String order = compose("STU_1A2B3C4D", "CRS_CHEAP001", "GRP_9F8E7D6C");
        assertTrue(service.matches(order, "STU_1A2B3C4D", "CRS_CHEAP001"));
        // The replay the identity check exists to stop: a genuine payment
        // for a cheap course, presented to unlock an expensive one.
        assertFalse(service.matches(order, "STU_1A2B3C4D", "CRS_EXPENS1"));
        // And another learner's reference.
        assertFalse(service.matches(order, "STU_OTHER12", "CRS_CHEAP001"));
    }

    @Test
    void rejectsMalformedOrderNumbers() {
        assertNull(service.parseOrderId(null));
        assertNull(service.parseOrderId("not-an-order"));
        assertNull(service.parseOrderId("1A2B3C4D:EEAF0596"));
    }
}
