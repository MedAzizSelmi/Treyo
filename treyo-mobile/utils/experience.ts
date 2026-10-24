/**
 * Professional experience as entries — organisation, position, from, to —
 * rather than a paragraph to write (October 2026). The server stores them
 * and keeps a readable text made from them for older screens
 * (backend ExperienceEntries).
 *
 * Months are "YYYY-MM"; `to` is null while the position is current.
 */
export type ExperienceEntry = { organization: string; position: string; from: string; to: string | null };

export const emptyEntry = (): ExperienceEntry => ({ organization: '', position: '', from: '', to: null });

const MAX = 20;

/** "2021-03-15" or "2021-03" → "2021-03"; anything else → ''. */
function toMonth(v: any): string {
    const m = /^(\d{4})-(\d{2})/.exec(String(v || ''));
    return m ? `${m[1]}-${m[2]}` : '';
}

/**
 * Affinda's work history as entries. Whatever Affinda could not read is left
 * empty for the person to fill in, rather than the entry being dropped.
 */
export function fromAffinda(work: any[] | undefined | null): ExperienceEntry[] {
    if (!Array.isArray(work)) return [];
    return work
        .map(w => {
            const dates = w?.dates || {};
            const current = !!dates.isCurrent;
            return {
                organization: String(w?.organization || '').trim().slice(0, 100),
                position: String(w?.jobTitle || '').trim().slice(0, 100),
                from: toMonth(dates.startDate || w?.startDate),
                to: current ? null : (toMonth(dates.endDate || w?.endDate) || null),
            };
        })
        .filter(e => e.organization || e.position)
        .slice(0, MAX);
}

/** The first thing missing or wrong in an entry, as a translation key; null when it is complete. */
export function entryProblem(e: ExperienceEntry): string | null {
    if (!e.organization.trim()) return 'experience.needOrganization';
    if (!e.position.trim()) return 'experience.needPosition';
    if (!e.from) return 'experience.needFrom';
    if (e.to && e.to < e.from) return 'experience.endBeforeStart';
    return null;
}

/** "03/2021" — short enough to sit beside the organisation's name. */
export function shortMonth(ym: string): string {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    return m ? `${m[2]}/${m[1]}` : '';
}

/** "Mar 2021" / "mars 2021" / "مارس 2021", for reading. */
export function longMonth(ym: string, language?: string): string {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) return '';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    try {
        return d.toLocaleDateString(language || undefined, { month: 'short', year: 'numeric' });
    } catch {
        return shortMonth(ym);
    }
}

export function currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
