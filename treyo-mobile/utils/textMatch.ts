/**
 * Forgiving text matching for what learners type: case, accents, spacing,
 * punctuation and small typos do not matter. "powerbi" finds "Power BI",
 * "excél" finds "Excel", "pyhton" finds "Python".
 *
 * The same rules as the server's TextMatch.java, which groups course
 * suggestions and the searches that found nothing — keep the two in step,
 * so what a learner fails to find here is grouped there the way they
 * would expect.
 */

// Punctuation and symbols, Latin and Arabic. Written out rather than as
// \p{…} classes, which the phone's JavaScript engine may not support;
// letters of every script, Arabic included, are kept.
const SEPARATORS = /[\s!-/:-@[-`{-~ -¿ -⁯،؛؟٪-٭۔]+/g;

/** Lower case, no accents, letters and digits only, single spaces. */
export function normalize(s?: string | null): string {
    if (!s) return '';
    const decomposed = typeof s.normalize === 'function' ? s.normalize('NFD') : s;
    return decomposed
        // Latin accents, and Arabic short vowels, as the server's \p{M} does.
        .replace(/[̀-ًͯ-ٰٟ]/g, '')
        .toLowerCase()
        .replace(SEPARATORS, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

/** The normalised text without spaces: "power bi" and "powerbi" share it. */
export function key(s?: string | null): string {
    return normalize(s).replace(/ /g, '');
}

export function words(s?: string | null): string[] {
    const n = normalize(s);
    return n ? n.split(' ') : [];
}

/** Typos allowed for a word of this length: none up to 3, one up to 6, then two. */
export function tolerance(length: number): number {
    return length <= 3 ? 0 : length <= 6 ? 1 : 2;
}

/**
 * Edit distance where swapping two neighbouring letters is one typo, not
 * two, giving up (returning max + 1) once it exceeds max.
 */
export function distance(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let before = new Array(b.length + 1).fill(0);
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    let cur = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
        cur[0] = i;
        let rowMin = cur[0];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let d = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d = Math.min(d, before[j - 2] + 1);
            }
            cur[j] = d;
            rowMin = Math.min(rowMin, d);
        }
        if (rowMin > max) return max + 1;
        [before, prev, cur] = [prev, cur, before];
    }
    return prev[b.length];
}

/**
 * Whether the query finds the text: the text contains it once spaces are
 * ignored, or every word of the query starts, or nearly matches, a word of
 * the text.
 */
export function matches(query: string, text: string): boolean {
    const qKey = key(query);
    if (!qKey) return false;
    if (key(text).includes(qKey)) return true;
    const textWords = words(text);
    return words(query).every(q =>
        textWords.some(w => w.startsWith(q) || distance(q, w, tolerance(q.length)) <= tolerance(q.length)));
}

/** Text normalised once, to be matched against many times. */
export type Prepared = { key: string; words: string[] };

export function prepare(text?: string | null): Prepared {
    return { key: key(text), words: Array.from(new Set(words(text))) };
}

/**
 * matches(), for text prepared in advance — what a search over every
 * course on each keystroke needs. Normalising every description on every
 * keystroke is what made search slow. `strong` (title, domain, topic,
 * trainer) allows typos; `loose` (the description, long and full of
 * ordinary words) matches only by the start of a word, which is both
 * cheaper and less noisy.
 */
export function matchesPrepared(q: Prepared, strong: Prepared, loose?: Prepared): boolean {
    if (!q.key) return false;
    if (strong.key.includes(q.key) || (loose && loose.key.includes(q.key))) return true;
    return q.words.every(w => {
        const tol = tolerance(w.length);
        if (strong.words.some(x => x.startsWith(w) || distance(w, x, tol) <= tol)) return true;
        return !!loose && loose.words.some(x => x.startsWith(w));
    });
}

/**
 * The title closest to what was typed, for "Did you mean…?" when nothing
 * matched — near enough to be a misspelling, not just any course.
 */
export function closest(query: string, titles: { title: string; prepared: Prepared }[]): string | null {
    const q = key(query);
    if (q.length < 3) return null;
    const allowed = tolerance(q.length) + 1;
    let best: string | null = null;
    let bestScore = allowed + 1;
    for (const { title, prepared } of titles) {
        const candidates = [prepared.key, ...prepared.words];
        for (const c of candidates) {
            const score = distance(q, c.slice(0, Math.max(q.length, Math.min(c.length, q.length + allowed))), allowed);
            if (score < bestScore) {
                bestScore = score;
                best = title;
            }
        }
    }
    return bestScore <= allowed ? best : null;
}
