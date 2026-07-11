# ML Recommendation Model — Changes & Design

Reference document for the report. Covers every change made to the
recommendation engine, why it was made, and how it works.

Files involved:
- `course_recommendation_system.py` — core scoring / ranking algorithms
- `recommendation_engine.py` — orchestration, DB access, caching, concurrency
- `main.py` — FastAPI endpoints + background scheduler

---

## 1. Starting problem

The recommender was surfacing courses from **highly-rated trainers even
when the course had nothing to do with the student's domain or
interests**. A student who chose "informatique" could see a 5-star
marketing course ranked first.

Root cause: the scoring formula gave too much weight to course rating.
A 5-star course (`rating_score ≈ 1.0`) contributed more to the final
score than a genuine-but-weaker domain match.

---

## 2. Fix Part 1 — Domain-match multiplier

Added a **hard domain-match multiplier** so a course outside the
student's declared domain is penalised regardless of its rating.

New helpers in `course_recommendation_system.py`:

- `_get_student_domains(student_row)` — parses the student's
  `primary_domains` field into a normalised lowercase set.
- `_domain_multiplier(student_domains)` — returns a per-course
  multiplier array:
  - **in-domain course → × 1.0**
  - **out-of-domain course → × 0.4**
  - if the student has no declared domains → flat × 1.0 (no gating)

Re-weighted the scoring formulas:

| Ranker | Content/Interest | Rating | Popularity |
|--------|------------------|--------|------------|
| `content_based_recommendations` (1–5 interactions) | 65 % | 15 % | 20 % |
| `cold_start_recommendations` (0 interactions)      | 70 % | 15 % | 15 % |

Rating weight dropped from ~30 % to 15 %, so within a domain it acts as
a tiebreaker, not the dominant factor.

`popularity_based_recommendations` was also fixed: it now restricts to
**all** of the student's domains (previously only the first one), and
its internal score is 50 % popularity / 50 % rating.

---

## 3. Fix Part 2 — Strict domain priority (two-level sort)

The multiplier was a *soft* prior — a strong enough out-of-domain score
could still slip past a weak in-domain one. It also didn't cover the
**collaborative** and **search** rankers, which don't see the student's
domain at all. ("Behaviourally similar" students may have explored
unrelated fields — that's no guarantee THIS student wants them.)

Solution: a **strict two-level sort** applied after scoring:

```
sort key = (is_in_domain DESC, final_score DESC)
```

This **guarantees** no out-of-domain course can ever rank above an
in-domain one. Within each group, the normal score ordering applies.
Applied in all three rankers: `cold_start_recommendations`,
`content_based_recommendations`, and `hybrid_recommendations`.

Design principle: **domain is the student's explicit preference;
collaborative similarity is an inferred one — explicit wins.**

---

## 4. How the recommender works (strategy tiers)

`recommendation_engine.get_recommendations()` picks a strategy based on
how many interactions the student has:

| Interactions | Strategy | Signal used |
|--------------|----------|-------------|
| **0** | `cold_start_recommendations` | Onboarding domains + interests (TF-IDF), domain-gated |
| **1–5** | `content_based_recommendations` | TF-IDF over course content, domain-gated |
| **6+** | `hybrid_recommendations` | Weighted blend (below) |

Hybrid source weights:

| Source | Weight | What it captures |
|--------|--------|------------------|
| Content-based | 45 % | Domain + interest match |
| Collaborative | 35 % | What behaviourally-similar students engaged with |
| Search history | 15 % | What the student searched for |
| Popularity | 5 % | Highly-rated trainers in the same domain (tiebreaker) |

### Content matching (TF-IDF + FAISS)

Course text (title + description + domain + topic + level) is vectorised
with TF-IDF. Similarity between a student's interest vector and all
courses is computed. The old code also built an O(N²) course-to-course
similarity matrix that was never used — it was removed. A **FAISS**
`IndexFlatIP` over L2-normalised vectors now backs similarity search
(O(log N) instead of O(N), with a scikit-learn fallback if FAISS
isn't installed).

### Collaborative filtering

Builds a user–item matrix from interactions, each interaction type
weighted (`viewed`=1, `clicked_interested`=2, `saved`=2, `enrolled`=5,
`completed`=10, `rated`=3, `dropped`=-2). Finds the 20 most similar
students by cosine similarity on that matrix, then recommends courses
those peers engaged with that the student hasn't seen.

> "Similar students" = students whose pattern of course interactions
> (clicks, saves, enrolls, completions) is most parallel to yours.
> It uses **behaviour only** — never demographics or profile fields.

---

## 5. Production-readiness fixes (8 issues)

Made the ML service safe to run for real users:

1. **New users/courses visibility** — previously the model only saw
   data loaded at startup. Solved by the refresh scheduler (#4 below).
2. **Background model refresh** — `APScheduler` rebuilds the model from
   the DB every 30 min (env-configurable). New `rebuild_models()` builds
   into local vars then atomically swaps; if a rebuild fails, the old
   model keeps serving (no downtime).
3. **O(N²) similarity removed** — replaced the unused N×N matrix with a
   FAISS index (see §4).
4. **Per-student recommendation cache** — `_RecommendationCache`, a
   bounded thread-safe LRU. Invalidates on: model-version change,
   interaction-count change, or TTL (15 min default).
5. **Concurrency safety** — `threading.RLock` + atomic-snapshot pattern.
   Recommendation calls snapshot all model state once at the top, so a
   background refresh can swap a new model in without tearing an
   in-flight request.
6. **Spring↔FastAPI field mismatch** — the Spring backend's cold-start
   call sent `interests`/`level`; FastAPI expected
   `student_interests`/`student_level`. Fixed (would have 422'd).
7. **DB connection pooling** — replaced per-call `psycopg2.connect()`
   with a module-level `ThreadedConnectionPool` (1–10 connections) and
   a `db_conn()` context manager so connections are always returned.
8. **Engagement feedback loop** — new interactions (incl. "saved" from
   the favourites feature) are picked up on the next scheduled refresh,
   so the model learns from production behaviour.

### Monitoring

A `/health` endpoint exposes model version, scheduler status, cache hit
rate, dataset sizes, and (via `psutil`) process CPU/memory + uptime. The
admin dashboard has a "System Health" page that polls it and renders
live cards + rolling sparklines.

---

## 6. Known limitation (not done)

The service runs as a **single uvicorn worker**. Horizontal scaling
(multiple workers / containers) would need a shared model store
(e.g. Redis) or a separate batch-trainer process — deferred until
traffic actually requires it. Single-worker is fine for launch scale.

---

## 7. Summary for the report

The recommendation model was changed from a rating-dominated ranker
into a **domain-first** one. The student's chosen domain is now a hard
gate: in-domain courses always rank above out-of-domain ones. Within a
domain, a hybrid of content similarity (TF-IDF), collaborative
filtering (behavioural peers), search history, and popularity decides
the order. The service was also hardened for production: it
self-refreshes, caches per-student results, pools DB connections, is
concurrency-safe, and is observable via a health endpoint.
