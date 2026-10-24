package com.byb.backend.service;

import com.byb.backend.model.SkillOption;
import com.byb.backend.repository.SkillOptionRepository;
import com.byb.backend.util.TextMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * The skills learners can choose to develop at onboarding, managed by
 * administrators since October 2026. The list used to be written into the
 * app (onboarding step 2), so a field like IT could never gain a skill
 * without a new release. 2026-10-25_skill_options.sql moved that list here.
 *
 * Learners' profiles store a skill's {@link SkillOption#getName() name},
 * as they always did, and only names from this list are accepted — they
 * are shown on the learner's public profile, so free text would be shown
 * to everyone.
 */
@Service
@RequiredArgsConstructor
public class SkillOptionService {

    /**
     * The onboarding fields, in the order the app lists them, with the
     * dashboard's English name. Their keys are what learners' profiles
     * store (students.primary_domains); the app translates them
     * (interestFields.* in its locales).
     */
    public static final Map<String, String> FIELDS = new LinkedHashMap<>();
    static {
        FIELDS.put("informatique", "Computer Science");
        FIELDS.put("electronique", "Electronics");
        FIELDS.put("marketing", "Marketing");
        FIELDS.put("design", "Design");
        FIELDS.put("business", "Business");
        FIELDS.put("langues", "Languages");
        FIELDS.put("sante", "Health");
        FIELDS.put("finance", "Finance");
    }

    /**
     * Skills that are not something to develop under a field — Communication,
     * C#, Excel — and only complete what people type into the CV screen's
     * skills box. Never offered at onboarding step 2.
     */
    public static final String GENERAL = "general";

    /** Every group an administrator can file a skill under. */
    public static final Map<String, String> ALL_FIELDS = new LinkedHashMap<>(FIELDS);
    static {
        ALL_FIELDS.put(GENERAL, "General (CV skills only)");
    }

    private final SkillOptionRepository repository;

    /** A refusal the dashboard can show as it is. */
    public static class SkillException extends RuntimeException {
        private final String code;

        public SkillException(String code, String message) {
            super(message);
            this.code = code;
        }

        public String getCode() {
            return code;
        }
    }

    public record SkillRequest(String field, String name, String nameFr, String nameAr, String nameEs, Boolean isActive) {}

    private static final Comparator<SkillOption> ORDER = Comparator
            .comparing((SkillOption s) -> new ArrayList<>(ALL_FIELDS.keySet()).indexOf(s.getField()))
            .thenComparing(s -> s.getSortOrder() == null ? Integer.MAX_VALUE : s.getSortOrder())
            .thenComparing(SkillOption::getName, String.CASE_INSENSITIVE_ORDER);

    // ── Learners ────────────────────────────────────────────────────────

    /** The skills offered under these fields, as the app shows them. */
    public List<Map<String, Object>> forLearner(Collection<String> fields) {
        return repository.findByFieldInAndIsActiveTrue(fields).stream()
                .sorted(ORDER)
                .map(this::toMap)
                .collect(Collectors.toList());
    }

    /**
     * Every offered skill, whatever its group, for the suggestions under the
     * CV screen's skills box: someone typing "c" sees Communication,
     * Creativity, C#, C++. Only the administrators' list — nothing another
     * user typed is suggested to anyone.
     */
    public List<Map<String, Object>> suggestions() {
        return repository.findByIsActiveTrue().stream()
                .sorted(Comparator.comparing(SkillOption::getName, String.CASE_INSENSITIVE_ORDER))
                .map(this::toMap)
                .collect(Collectors.toList());
    }

    /**
     * Checks a learner's onboarding choices against the list: known fields,
     * and skills that are offered under them.
     *
     * @return the skills as the list names them, whatever case the app sent
     */
    public String[] checkChoices(String[] fields, String[] skills) {
        for (String f : fields) {
            if (!FIELDS.containsKey(f)) throw new IllegalArgumentException("Unknown field: " + f);
        }
        Map<String, String> offered = new HashMap<>();
        for (SkillOption s : repository.findByFieldInAndIsActiveTrue(Arrays.asList(fields))) {
            offered.put(s.getName().toLowerCase(Locale.ROOT), s.getName());
        }
        LinkedHashSet<String> chosen = new LinkedHashSet<>();
        for (String raw : skills) {
            String name = raw == null ? null : offered.get(raw.trim().toLowerCase(Locale.ROOT));
            if (name == null) throw new IllegalArgumentException("Unknown skill: " + raw);
            chosen.add(name);
        }
        return chosen.toArray(String[]::new);
    }

    // ── Administrators ──────────────────────────────────────────────────

    /** Every skill, hidden ones included, with how many learners chose it. */
    public Map<String, Object> listForAdmin() {
        Map<String, Long> used = usage();
        List<Map<String, Object>> skills = repository.findAll().stream()
                .sorted(ORDER)
                .map(s -> {
                    Map<String, Object> m = toMap(s);
                    m.put("isActive", Boolean.TRUE.equals(s.getIsActive()));
                    m.put("learners", used.getOrDefault(s.getName().toLowerCase(Locale.ROOT), 0L));
                    return m;
                })
                .collect(Collectors.toList());
        List<Map<String, String>> fields = ALL_FIELDS.entrySet().stream()
                .map(e -> Map.of("key", e.getKey(), "label", e.getValue()))
                .collect(Collectors.toList());
        return Map.of("fields", fields, "skills", skills);
    }

    @Transactional
    public SkillOption create(SkillRequest r) {
        String field = r.field();
        if (field == null || !ALL_FIELDS.containsKey(field)) throw new SkillException("BAD_FIELD", "Choose a field.");
        String name = clean(r.name());
        if (name == null) throw new SkillException("NAME_REQUIRED", "The skill needs a name.");
        checkUnique(field, name, null);

        SkillOption s = new SkillOption();
        s.setSkillId("SKL_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        s.setField(field);
        s.setName(name);
        s.setNameFr(clean(r.nameFr()));
        s.setNameAr(clean(r.nameAr()));
        s.setNameEs(clean(r.nameEs()));
        s.setIsActive(r.isActive() == null || r.isActive());
        s.setSortOrder(repository.findByField(field).stream()
                .map(SkillOption::getSortOrder).filter(Objects::nonNull)
                .max(Integer::compare).orElse(0) + 1);
        return repository.save(s);
    }

    /**
     * Edits a skill. Renaming one learners already chose leaves their
     * profiles with the old name, so the dashboard warns before it.
     */
    @Transactional
    public SkillOption update(String skillId, SkillRequest r) {
        SkillOption s = find(skillId);
        String field = r.field() == null ? s.getField() : r.field();
        if (!ALL_FIELDS.containsKey(field)) throw new SkillException("BAD_FIELD", "Choose a field.");
        String name = r.name() == null ? s.getName() : clean(r.name());
        if (name == null) throw new SkillException("NAME_REQUIRED", "The skill needs a name.");
        checkUnique(field, name, skillId);
        s.setField(field);
        s.setName(name);
        if (r.nameFr() != null) s.setNameFr(clean(r.nameFr()));
        if (r.nameAr() != null) s.setNameAr(clean(r.nameAr()));
        if (r.nameEs() != null) s.setNameEs(clean(r.nameEs()));
        if (r.isActive() != null) s.setIsActive(r.isActive());
        return repository.save(s);
    }

    /** Only a skill nobody chose; the others are hidden instead. */
    @Transactional
    public void delete(String skillId) {
        SkillOption s = find(skillId);
        long learners = usage().getOrDefault(s.getName().toLowerCase(Locale.ROOT), 0L);
        if (learners > 0) {
            throw new SkillException("IN_USE", learners + " learner(s) chose this skill. Hide it instead, so their profiles keep it.");
        }
        repository.delete(s);
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    /** "Power BI" and "powerbi" in the same field are the same skill. */
    private void checkUnique(String field, String name, String exceptId) {
        String key = TextMatch.key(name);
        boolean taken = repository.findByField(field).stream()
                .anyMatch(o -> !o.getSkillId().equals(exceptId) && TextMatch.key(o.getName()).equals(key));
        if (taken) throw new SkillException("DUPLICATE", "\"" + name + "\" is already in " + ALL_FIELDS.get(field) + ".");
    }

    private Map<String, Long> usage() {
        Map<String, Long> m = new HashMap<>();
        for (Object[] row : repository.countLearnersBySkill()) {
            if (row[0] == null) continue;
            m.merge(String.valueOf(row[0]).toLowerCase(Locale.ROOT), ((Number) row[1]).longValue(), Long::sum);
        }
        return m;
    }

    private SkillOption find(String skillId) {
        return repository.findById(skillId)
                .orElseThrow(() -> new SkillException("NOT_FOUND", "Skill not found."));
    }

    private Map<String, Object> toMap(SkillOption s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("skillId", s.getSkillId());
        m.put("field", s.getField());
        m.put("name", s.getName());
        m.put("nameFr", s.getNameFr());
        m.put("nameAr", s.getNameAr());
        m.put("nameEs", s.getNameEs());
        return m;
    }

    private static String clean(String v) {
        if (v == null) return null;
        String t = v.trim().replaceAll("\\s+", " ");
        if (t.isEmpty()) return null;
        return t.length() > 100 ? t.substring(0, 100) : t;
    }
}
