/**
 * Picks the LinkedIn and portfolio links out of an Affinda resume.
 *
 * Affinda returns a `linkedin` field and a `websites` list, but a CV
 * that writes its links as plain text can leave both empty, so the raw
 * text is scanned as a fallback. A link the CV does not contain comes
 * back as '' — both fields are optional in onboarding.
 */

// Profiles that are not a portfolio even though they are websites.
const NOT_PORTFOLIO = /(^|\.)(linkedin|facebook|instagram|twitter|x|tiktok|youtube)\.com$/i;

const URL_IN_TEXT = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s,;)<>"']*)?/gi;

function normalize(raw: string): string {
    const url = raw.trim().replace(/[.,;:)]+$/, '');
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function hostOf(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return '';
    }
}

export function extractCvLinks(parsed: any): { linkedin: string; portfolio: string } {
    const candidates: string[] = [];
    if (typeof parsed?.linkedin === 'string') candidates.push(parsed.linkedin);
    if (Array.isArray(parsed?.websites)) {
        candidates.push(...parsed.websites.filter((w: any) => typeof w === 'string'));
    }
    if (candidates.length === 0 && typeof parsed?.rawText === 'string') {
        // Only what is unmistakably a link: words such as "Node.js" or
        // "ASP.NET" look like domain names too.
        const matches: string[] = parsed.rawText.match(URL_IN_TEXT) || [];
        candidates.push(...matches.filter(m =>
            /^(https?:\/\/|www\.)/i.test(m) || /(linkedin|github)\.com\//i.test(m)));
    }

    const urls = candidates
        .filter(c => c && !c.includes('@')) // skip email addresses
        .map(normalize)
        .filter(u => hostOf(u).includes('.'));

    const linkedin = urls.find(u => hostOf(u).endsWith('linkedin.com')) || '';

    // Prefer a personal site; fall back to GitHub, which many trainers use
    // as their portfolio.
    const sites = urls.filter(u => !NOT_PORTFOLIO.test(hostOf(u)));
    const portfolio = sites.find(u => !hostOf(u).endsWith('github.com')) || sites[0] || '';

    return { linkedin, portfolio };
}
