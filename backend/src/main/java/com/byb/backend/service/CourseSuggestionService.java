package com.byb.backend.service;

import com.byb.backend.model.*;
import com.byb.backend.repository.*;
import com.byb.backend.util.TextMatch;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Courses learners asked for and did not find, so administrators can look
 * for a trainer who can teach them.
 *
 * Nonsense is handled in layers rather than detected, since no rule tells
 * "SAP FICO" or "C#" from gibberish: light checks on the form, at most
 * {@link #MAX_OPEN_PER_LEARNER} open suggestions per learner, and nothing a
 * learner typed is shown to other learners ("me too") until an
 * administrator has accepted it. Administrators close noise as
 * {@code rejected}, which tells nobody.
 *
 * When an administrator links the course that answers a suggestion, every
 * supporter is told by notification, push and email, and their request for
 * the course is registered — so the automated group flow opens a group as
 * soon as enough of them are asking.
 *
 * Beside the suggestions, administrators see the searches that found
 * nothing, grouped the way {@link TextMatch} matches, and only once at
 * least two different learners made them.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CourseSuggestionService {

    public static final int MAX_OPEN_PER_LEARNER = 3;
    static final int MISSED_SEARCH_DAYS = 90;
    static final int MISSED_SEARCH_MIN_LEARNERS = 2;

    static final Set<String> OPEN = Set.of("new", "searching");
    /** What an administrator may set by hand; published and merged have their own actions. */
    static final Set<String> SETTABLE = Set.of("new", "searching", "declined", "rejected");

    private final CourseSuggestionRepository suggestionRepository;
    private final CourseSuggestionSupporterRepository supporterRepository;
    private final HiddenSearchTermRepository hiddenTermRepository;
    private final SearchLogRepository searchLogRepository;
    private final StudentRepository studentRepository;
    private final AdminRepository adminRepository;
    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final InteractionService interactionService;
    private final NotificationService notificationService;
    private final EmailService emailService;

    /** A refusal the app can translate: {@code code} names it, the message explains it in English. */
    public static class SuggestionException extends RuntimeException {
        private final String code;

        public SuggestionException(String code, String message) {
            super(message);
            this.code = code;
        }

        public String getCode() {
            return code;
        }
    }

    public record SuggestionRequest(String topic, String details, String domain, String level,
                                    String format, String language, String city) {}

    // ── Learners ────────────────────────────────────────────────────────

    @Transactional
    public CourseSuggestion create(String studentId, SuggestionRequest r) {
        String topic = clean(r.topic(), 120);
        String details = clean(r.details(), 1000);
        // A letter or digit, and not one key held down. Nothing stricter:
        // "C#", "R" and "C++" are courses. The sentence below is the real
        // effort a learner has to make.
        String topicKey = TextMatch.key(topic);
        if (topic == null || topicKey.isEmpty()
                || (topicKey.length() >= 3 && topicKey.chars().distinct().count() == 1)) {
            throw new SuggestionException("TOPIC_INVALID", "Say which course you are looking for.");
        }
        if (details == null || details.length() < 10 || letters(details) < 5) {
            throw new SuggestionException("DETAILS_TOO_SHORT", "Describe in a sentence what you want to learn.");
        }
        if (suggestionRepository.countByStudentIdAndStatusIn(studentId, OPEN) >= MAX_OPEN_PER_LEARNER) {
            throw new SuggestionException("TOO_MANY_OPEN",
                    "You already have " + MAX_OPEN_PER_LEARNER + " suggestions waiting for an answer.");
        }

        CourseSuggestion s = new CourseSuggestion();
        s.setSuggestionId("SUG_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        s.setStudentId(studentId);
        s.setTopic(topic);
        s.setDetails(details);
        s.setDomain(clean(r.domain(), 100));
        s.setLevel(Levels.normalize(clean(r.level(), 30)));
        s.setFormat(clean(r.format(), 30));
        s.setLanguage(clean(r.language(), 10));
        s.setCity(clean(r.city(), 100));
        s.setStatus("new");
        s = suggestionRepository.save(s);
        addSupporter(s.getSuggestionId(), studentId);

        for (Admin a : adminRepository.findAll()) {
            notificationService.sendSuggestionToAdmin(a.getAdminId(), s.getSuggestionId(), topic);
        }
        return s;
    }

    /**
     * Accepted suggestions that match what the learner is typing, for "me
     * too". Only accepted ones: what other learners typed is never shown
     * before an administrator has read it.
     */
    public List<Map<String, Object>> similar(String studentId, String query) {
        if (TextMatch.key(query).length() < 2) return List.of();
        Set<String> supported = supporterRepository.findByStudentId(studentId).stream()
                .map(CourseSuggestionSupporter::getSuggestionId).collect(Collectors.toSet());
        return suggestionRepository.findByStatusIn(Set.of("searching")).stream()
                .filter(s -> TextMatch.matches(query, s.getTopic()) || TextMatch.matches(s.getTopic(), query))
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("suggestionId", s.getSuggestionId());
                    m.put("topic", s.getTopic());
                    m.put("domain", s.getDomain());
                    m.put("supporters", supporterRepository.countBySuggestionId(s.getSuggestionId()));
                    m.put("supported", supported.contains(s.getSuggestionId()));
                    return m;
                })
                .sorted(Comparator.comparing(m -> -((Number) m.get("supporters")).longValue()))
                .limit(5)
                .collect(Collectors.toList());
    }

    /** "Me too" — on accepted suggestions only. Saying it twice changes nothing. */
    @Transactional
    public long support(String studentId, String suggestionId) {
        CourseSuggestion s = find(suggestionId);
        if (!"searching".equals(s.getStatus())) {
            throw new SuggestionException("NOT_OPEN", "This suggestion is not open for support.");
        }
        addSupporter(suggestionId, studentId);
        return supporterRepository.countBySuggestionId(suggestionId);
    }

    /** Takes back a "me too". The author withdraws the suggestion instead. */
    @Transactional
    public void unsupport(String studentId, String suggestionId) {
        CourseSuggestion s = find(suggestionId);
        if (studentId.equals(s.getStudentId())) {
            throw new SuggestionException("AUTHOR", "Withdraw your suggestion instead.");
        }
        supporterRepository.findBySuggestionIdAndStudentId(suggestionId, studentId).ifPresent(supporterRepository::delete);
    }

    /** The author takes back a suggestion that is still open. */
    @Transactional
    public void withdraw(String studentId, String suggestionId) {
        CourseSuggestion s = find(suggestionId);
        if (!studentId.equals(s.getStudentId())) {
            throw new org.springframework.security.access.AccessDeniedException("Not your suggestion");
        }
        if (!OPEN.contains(s.getStatus())) {
            throw new SuggestionException("NOT_OPEN", "This suggestion has already been answered.");
        }
        close(s, "withdrawn");
    }

    /** What the learner suggested or backed, newest first. */
    public List<Map<String, Object>> mine(String studentId) {
        Set<String> ids = supporterRepository.findByStudentId(studentId).stream()
                .map(CourseSuggestionSupporter::getSuggestionId).collect(Collectors.toCollection(LinkedHashSet::new));
        suggestionRepository.findByStudentId(studentId).forEach(s -> ids.add(s.getSuggestionId()));
        return suggestionRepository.findAllById(ids).stream()
                .filter(s -> !"merged".equals(s.getStatus()))
                .sorted(Comparator.comparing(CourseSuggestion::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("suggestionId", s.getSuggestionId());
                    m.put("topic", s.getTopic());
                    m.put("details", s.getDetails());
                    // The app shows "rejected" as plain "Closed": nobody is
                    // notified about noise, but nor is an honest learner whose
                    // request was misread left believing it is still waiting.
                    m.put("status", s.getStatus());
                    m.put("mine", studentId.equals(s.getStudentId()));
                    m.put("supporters", supporterRepository.countBySuggestionId(s.getSuggestionId()));
                    m.put("courseId", s.getCourseId());
                    m.put("createdAt", s.getCreatedAt());
                    return m;
                })
                .collect(Collectors.toList());
    }

    // ── Administrators ──────────────────────────────────────────────────

    /** Every suggestion with its author and demand, the most wanted first. */
    public List<Map<String, Object>> listForAdmin(String status) {
        List<CourseSuggestion> all = status == null || status.isBlank() || "all".equals(status)
                ? suggestionRepository.findAll()
                : suggestionRepository.findByStatusIn(Set.of(status));
        return all.stream()
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("suggestionId", s.getSuggestionId());
                    m.put("topic", s.getTopic());
                    m.put("details", s.getDetails());
                    m.put("domain", s.getDomain());
                    m.put("level", s.getLevel());
                    m.put("format", s.getFormat());
                    m.put("language", s.getLanguage());
                    m.put("city", s.getCity());
                    m.put("status", s.getStatus());
                    m.put("adminNote", s.getAdminNote());
                    m.put("supporters", supporterRepository.countBySuggestionId(s.getSuggestionId()));
                    m.put("createdAt", s.getCreatedAt());
                    m.put("closedAt", s.getClosedAt());
                    m.put("mergedInto", s.getMergedInto());
                    m.put("courseId", s.getCourseId());
                    m.put("courseTitle", s.getCourseId() == null ? null
                            : courseRepository.findByCourseId(s.getCourseId()).map(Course::getTitle).orElse(null));
                    Student author = s.getStudentId() == null ? null
                            : studentRepository.findByStudentId(s.getStudentId()).orElse(null);
                    Map<String, Object> a = new LinkedHashMap<>();
                    a.put("studentId", s.getStudentId());
                    a.put("name", author == null ? "Deleted user" : author.getName());
                    a.put("email", author == null ? null : author.getEmail());
                    a.put("phone", author == null ? null : author.getPhone());
                    m.put("author", a);
                    m.put("learners", learners(s));
                    return m;
                })
                .sorted(Comparator.<Map<String, Object>>comparingLong(m -> -((Number) m.get("supporters")).longValue())
                        .thenComparing(m -> (LocalDateTime) m.get("createdAt"),
                                Comparator.nullsLast(Comparator.reverseOrder())))
                .collect(Collectors.toList());
    }

    /**
     * Accept (searching), decline (the supporters are told politely),
     * reject as not a course request (nobody is told), or put back to new.
     */
    @Transactional
    public CourseSuggestion setStatus(String suggestionId, String status, String note) {
        CourseSuggestion s = find(suggestionId);
        if (!SETTABLE.contains(status)) throw new SuggestionException("BAD_STATUS", "Unknown status: " + status);
        if (!SETTABLE.contains(s.getStatus())) {
            throw new SuggestionException("CLOSED", "This suggestion is " + s.getStatus() + " and can no longer change.");
        }
        if (note != null) s.setAdminNote(clean(note, 2000));
        if (status.equals(s.getStatus())) return suggestionRepository.save(s);

        boolean tell = "declined".equals(status);
        s.setStatus(status);
        s.setClosedAt("declined".equals(status) || "rejected".equals(status) ? LocalDateTime.now() : null);
        suggestionRepository.save(s);
        if (tell) {
            for (CourseSuggestionSupporter sup : supporterRepository.findBySuggestionId(suggestionId)) {
                notificationService.sendSuggestionDeclined(sup.getStudentId(), suggestionId, s.getTopic());
            }
        }
        return s;
    }

    @Transactional
    public CourseSuggestion setNote(String suggestionId, String note) {
        CourseSuggestion s = find(suggestionId);
        s.setAdminNote(clean(note, 2000));
        return suggestionRepository.save(s);
    }

    /** The same request twice: the second's supporters join the first. */
    @Transactional
    public CourseSuggestion merge(String suggestionId, String intoId) {
        if (suggestionId.equals(intoId)) throw new SuggestionException("SAME", "A suggestion cannot be merged into itself.");
        CourseSuggestion from = find(suggestionId);
        CourseSuggestion into = find(intoId);
        if (!OPEN.contains(from.getStatus()) || !OPEN.contains(into.getStatus())) {
            throw new SuggestionException("CLOSED", "Only open suggestions can be merged.");
        }
        for (CourseSuggestionSupporter sup : supporterRepository.findBySuggestionId(suggestionId)) {
            addSupporter(intoId, sup.getStudentId());
        }
        from.setMergedInto(intoId);
        close(from, "merged");
        return into;
    }

    /**
     * The course that answers the suggestion exists. Every supporter is
     * told — notification, push and email — and their request for the
     * course is registered, which lets the group flow open a group once
     * enough of them are asking.
     *
     * @return how many learners were told
     */
    @Transactional
    public int publish(String suggestionId, String courseId) {
        CourseSuggestion s = find(suggestionId);
        if (!OPEN.contains(s.getStatus())) {
            throw new SuggestionException("CLOSED", "This suggestion is " + s.getStatus() + " already.");
        }
        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new SuggestionException("NO_COURSE", "Course not found."));
        if (!Boolean.TRUE.equals(course.getIsPublished())
                || (course.getApprovalStatus() != null && !"APPROVED".equalsIgnoreCase(course.getApprovalStatus()))) {
            throw new SuggestionException("NOT_PUBLISHED", "Approve and publish the course first, so learners can open it.");
        }
        s.setCourseId(courseId);
        close(s, "published");

        int told = 0;
        for (CourseSuggestionSupporter sup : supporterRepository.findBySuggestionId(suggestionId)) {
            String sid = sup.getStudentId();
            Student student = studentRepository.findByStudentId(sid).orElse(null);
            if (student == null) continue;
            boolean enrolled = enrollmentRepository.findByStudentIdAndCourseId(sid, courseId).isPresent();
            if (!enrolled && !interactionService.hasExpressedInterest(sid, courseId)) {
                interactionService.trackInterest(sid, courseId);
            }
            notificationService.sendSuggestionPublished(sid, courseId, course.getTitle(), s.getTopic());
            if (student.getEmail() != null) {
                emailService.sendSuggestedCourseAvailableEmail(student.getEmail(), student.getName(), s.getTopic(), course.getTitle());
            }
            told++;
        }
        log.info("Suggestion {} answered by {}; {} learners told", suggestionId, courseId, told);
        return told;
    }

    /**
     * Searches that found nothing in the last {@value #MISSED_SEARCH_DAYS}
     * days, grouped by {@link TextMatch} — "powerbi", "Power BI" and "pwer bi"
     * are one line — and shown only once at least
     * {@value #MISSED_SEARCH_MIN_LEARNERS} different learners made them, so
     * one person's keyboard mashing never appears. Learners are counted,
     * not searches.
     */
    public List<Map<String, Object>> missedSearches(LocalDateTime now) {
        Set<String> hidden = hiddenTermRepository.findAll().stream()
                .map(HiddenSearchTerm::getTermKey).collect(Collectors.toSet());

        record Group(String key, Map<String, Integer> labels, Set<String> learners, int[] searches, LocalDateTime[] last) {}
        List<Group> groups = new ArrayList<>();
        List<SearchLog> logs = searchLogRepository.findByResultCountAndCreatedAtAfter(0, now.minusDays(MISSED_SEARCH_DAYS));
        // Most frequent spellings first, so a group is named and keyed by
        // the common one and typos fold into it.
        Map<String, Long> frequency = logs.stream().collect(Collectors.groupingBy(l -> TextMatch.key(l.getQuery()), Collectors.counting()));
        logs.sort(Comparator.comparing((SearchLog l) -> -frequency.getOrDefault(TextMatch.key(l.getQuery()), 0L)));

        for (SearchLog l : logs) {
            String key = TextMatch.key(l.getQuery());
            if (key.length() < 3) continue;
            Group g = groups.stream().filter(x -> TextMatch.sameKey(x.key(), key)).findFirst().orElse(null);
            if (g == null) {
                g = new Group(key, new HashMap<>(), new HashSet<>(), new int[]{0}, new LocalDateTime[]{null});
                groups.add(g);
            }
            g.labels().merge(l.getQuery().trim(), 1, Integer::sum);
            g.learners().add(l.getStudentId());
            g.searches()[0]++;
            if (l.getCreatedAt() != null && (g.last()[0] == null || l.getCreatedAt().isAfter(g.last()[0]))) {
                g.last()[0] = l.getCreatedAt();
            }
        }

        return groups.stream()
                .filter(g -> g.learners().size() >= MISSED_SEARCH_MIN_LEARNERS)
                .filter(g -> hidden.stream().noneMatch(h -> TextMatch.sameKey(h, g.key())))
                .sorted(Comparator.comparingInt((Group g) -> -g.learners().size()))
                .map(g -> {
                    List<String> spellings = g.labels().entrySet().stream()
                            .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                            .map(Map.Entry::getKey).limit(5).collect(Collectors.toList());
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("key", g.key());
                    m.put("label", spellings.get(0));
                    m.put("spellings", spellings);
                    m.put("learners", g.learners().size());
                    m.put("searches", g.searches()[0]);
                    m.put("lastSearchedAt", g.last()[0]);
                    return m;
                })
                .collect(Collectors.toList());
    }

    /** Hides a search from the list for good, with every spelling that matches it. */
    @Transactional
    public void hideSearch(String term, String adminId) {
        String key = TextMatch.key(term);
        if (key.isEmpty()) throw new SuggestionException("TOPIC_INVALID", "Nothing to hide.");
        HiddenSearchTerm h = new HiddenSearchTerm();
        h.setTermKey(key.length() > 200 ? key.substring(0, 200) : key);
        h.setLabel(clean(term, 200));
        h.setHiddenBy(adminId);
        hiddenTermRepository.save(h);
    }

    // ── Account deletion ────────────────────────────────────────────────

    /**
     * The learner's "me too"s go. Their own suggestions go too, unless other
     * learners back them — then the demand stays, without the author.
     */
    @Transactional
    public void forgetLearner(String studentId) {
        supporterRepository.deleteAll(supporterRepository.findByStudentId(studentId));
        for (CourseSuggestion s : suggestionRepository.findByStudentId(studentId)) {
            if (supporterRepository.countBySuggestionId(s.getSuggestionId()) == 0) {
                suggestionRepository.delete(s);
            } else {
                s.setStudentId(null);
                s.setCity(null);
                suggestionRepository.save(s);
            }
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    /**
     * Everyone behind a suggestion, its author first, then the "me too"s in
     * the order they joined — with what an administrator needs to call them.
     */
    private List<Map<String, Object>> learners(CourseSuggestion s) {
        List<CourseSuggestionSupporter> rows = new ArrayList<>(supporterRepository.findBySuggestionId(s.getSuggestionId()));
        rows.sort(Comparator.comparing((CourseSuggestionSupporter r) -> !r.getStudentId().equals(s.getStudentId()))
                .thenComparing(CourseSuggestionSupporter::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder())));
        List<Map<String, Object>> out = new ArrayList<>();
        for (CourseSuggestionSupporter r : rows) {
            Student st = studentRepository.findByStudentId(r.getStudentId()).orElse(null);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("studentId", r.getStudentId());
            m.put("name", st == null ? "Deleted user" : st.getName());
            m.put("email", st == null ? null : st.getEmail());
            m.put("phone", st == null || st.getPhone() == null || st.getPhone().isBlank() ? null : st.getPhone());
            m.put("author", r.getStudentId().equals(s.getStudentId()));
            m.put("since", r.getCreatedAt());
            out.add(m);
        }
        return out;
    }

    private CourseSuggestion find(String suggestionId) {
        return suggestionRepository.findById(suggestionId)
                .orElseThrow(() -> new SuggestionException("NOT_FOUND", "Suggestion not found."));
    }

    private void close(CourseSuggestion s, String status) {
        s.setStatus(status);
        s.setClosedAt(LocalDateTime.now());
        suggestionRepository.save(s);
    }

    private void addSupporter(String suggestionId, String studentId) {
        if (supporterRepository.findBySuggestionIdAndStudentId(suggestionId, studentId).isPresent()) return;
        CourseSuggestionSupporter sup = new CourseSuggestionSupporter();
        sup.setSupporterId("SUP_" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
        sup.setSuggestionId(suggestionId);
        sup.setStudentId(studentId);
        supporterRepository.save(sup);
    }

    private static String clean(String v, int max) {
        if (v == null) return null;
        String t = v.trim().replaceAll("\\s+", " ");
        if (t.isEmpty()) return null;
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static long letters(String s) {
        return s.codePoints().filter(Character::isLetter).count();
    }
}
