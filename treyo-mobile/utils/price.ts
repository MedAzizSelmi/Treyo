/**
 * Course prices are set before VAT (HT) and learners pay them plus VAT.
 *
 * The server sends the rate and the VAT-included total with every course
 * (vatRate, priceInclVat), so the total shown here is exactly what the
 * gateway will be asked for — never recomputed on the phone. With VAT
 * switched off on the server the rate is 0 and no HT label is shown.
 */

/** "100", "49.99", "53.55" — no trailing zeros, millimes when there are any. */
export function formatAmount(value: number): string {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** Whether this course's price is shown as before-VAT, with a total beside it. */
export function isPricedExclVat(course: { price?: any; vatRate?: any }): boolean {
    return Number(course?.price ?? 0) > 0 && Number(course?.vatRate ?? 0) > 0;
}
