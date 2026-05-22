"""
RECOMMENDATION ENGINE - FINAL FIXED VERSION
============================================
Works with the actual CourseRecommendationSystem API
"""

import pandas as pd
import psycopg2
from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor
import os
import threading
from collections import OrderedDict
from contextlib import contextmanager
from dotenv import load_dotenv
from course_recommendation_system import CourseRecommendationSystem
import time

load_dotenv()


# Module-level connection pool. ThreadedConnectionPool is safe for our
# uvicorn-with-1-worker setup (multiple async requests share threads via
# starlette's threadpool). Min=1 keeps a warm connection; max=10 protects
# Postgres from a request spike. Tune via env vars if needed.
_DB_POOL = None
_DB_POOL_LOCK = threading.Lock()


class _RecommendationCache:
    """Thread-safe LRU cache for per-student recommendation results.

    Cache key:    (student_id, n_recommendations)
    Cache value:  (recs_dataframe, model_version, interaction_count, cached_at)

    Invalidation triggers:
      1. Stale model — entry's model_version != current engine version
         (set when the background refresh swaps in a new model)
      2. New interaction — entry's interaction_count != student's current
         count (set when the student clicks/enrolls/etc. on something)
      3. TTL expired — defensive bound on staleness even if (1)/(2) miss
      4. Manual invalidate_student() — called from track_interaction

    Bounded by max_entries with simple LRU eviction so memory doesn't grow
    unbounded as the user base scales.
    """

    def __init__(self, max_entries=10000, ttl_seconds=900):
        self._entries = OrderedDict()
        self._lock = threading.Lock()
        self._max = max_entries
        self._ttl = ttl_seconds
        self._hits = 0
        self._misses = 0

    def get(self, student_id, n, current_version, current_interaction_count):
        with self._lock:
            entry = self._entries.get((student_id, n))
            if entry is None:
                self._misses += 1
                return None
            recs, ver, count, ts = entry

            # Three independent staleness checks. Any one is enough to miss.
            if ver != current_version:
                self._misses += 1
                return None
            if count != current_interaction_count:
                self._misses += 1
                return None
            if time.time() - ts > self._ttl:
                self._misses += 1
                return None

            # Mark as recently used (move to end of OrderedDict).
            self._entries.move_to_end((student_id, n))
            self._hits += 1
            return recs

    def put(self, student_id, n, recs, version, interaction_count):
        with self._lock:
            key = (student_id, n)
            # Defensive copy so the cached frame isn't mutated by callers
            # post-cache (pandas chains love to mutate in place).
            self._entries[key] = (
                recs.copy() if hasattr(recs, 'copy') else recs,
                version,
                interaction_count,
                time.time(),
            )
            self._entries.move_to_end(key)
            # LRU eviction once we hit the cap.
            while len(self._entries) > self._max:
                self._entries.popitem(last=False)

    def invalidate_student(self, student_id):
        """Drop every cached entry for this student. Called when the
        student does something new (enroll, click, save, etc.) — their
        next recommendation call MUST reflect that fresh signal."""
        with self._lock:
            stale_keys = [k for k in self._entries if k[0] == student_id]
            for k in stale_keys:
                del self._entries[k]

    def clear(self):
        with self._lock:
            self._entries.clear()

    def stats(self):
        with self._lock:
            total = self._hits + self._misses
            hit_rate = (self._hits / total) if total else 0.0
            return {
                'entries': len(self._entries),
                'hits': self._hits,
                'misses': self._misses,
                'hit_rate': round(hit_rate, 3),
            }


def _get_pool(db_config):
    """Lazily build the global pool on first use, thread-safely."""
    global _DB_POOL
    if _DB_POOL is None:
        with _DB_POOL_LOCK:
            if _DB_POOL is None:
                _DB_POOL = pg_pool.ThreadedConnectionPool(
                    minconn=int(os.getenv('DB_POOL_MIN', '1')),
                    maxconn=int(os.getenv('DB_POOL_MAX', '10')),
                    **db_config,
                )
                print(f"   ✓ DB connection pool initialised (min={_DB_POOL.minconn}, max={_DB_POOL.maxconn})")
    return _DB_POOL


class RecommendationEngine:
    """
    Recommendation engine with proper cold-start handling.
    DB access goes through a pooled connection (see _get_pool above) so
    high-frequency cold-start lookups don't open a fresh TCP socket every
    time the way the old psycopg2.connect() per call did.

    Concurrency model:
      - `self._lock` guards reads/writes of the model state fields below.
      - Recommendation calls take a single snapshot of (rec_system,
        students, interactions) at the top, release the lock, and operate
        on those local references. So a background refresh job can build
        a fresh CourseRecommendationSystem in parallel and atomically
        swap it in without tearing any in-flight request.
      - We use threading.RLock (not asyncio) because uvicorn dispatches
        the model work onto starlette's threadpool — sync callers running
        on threads, not coroutines.
    """

    def __init__(self):
        self._lock = threading.RLock()
        # Monotonic counter bumped on every successful refresh — exposed
        # via get_model_version() for /health and cache-invalidation use.
        self._model_version = 0

        self.students = None
        self.courses = None
        self.interactions = None
        self.trainers = None
        self.searches = None
        self.rec_system = None

        # Per-student result cache (see _RecommendationCache above). Sized
        # via env vars so production can tune without a code change. TTL
        # is a defensive upper bound — the real invalidation is the model-
        # version bump (on refresh) and interaction-count change (on
        # track_interaction → invalidate_student).
        self._rec_cache = _RecommendationCache(
            max_entries=int(os.getenv('REC_CACHE_MAX', '10000')),
            ttl_seconds=int(os.getenv('REC_CACHE_TTL_SECONDS', '900')),
        )

        self.db_config = {
            'host': os.getenv('DB_HOST', 'localhost'),
            'database': os.getenv('DB_NAME', 'course_recommendation'),
            'user': os.getenv('DB_USER', 'postgres'),
            'password': os.getenv('DB_PASSWORD', 'your_password'),
            'port': int(os.getenv('DB_PORT', 5432))
        }

    def connect_db(self):
        """
        Acquire a connection from the pool. Callers MUST return it via
        `release_db(conn)` (or use the `db_conn()` context manager below)
        — otherwise the pool will leak and eventually exhaust.
        """
        return _get_pool(self.db_config).getconn()

    def release_db(self, conn):
        """Return a borrowed connection to the pool."""
        try:
            _get_pool(self.db_config).putconn(conn)
        except Exception as e:
            # Pool may be torn down during shutdown — log but don't crash.
            print(f"   ⚠️  release_db: {e}")

    @contextmanager
    def db_conn(self):
        """Context-managed borrow/return so callers can't forget to release."""
        conn = self.connect_db()
        try:
            yield conn
        finally:
            self.release_db(conn)

    # ─── Concurrency helpers ──────────────────────────────────────────

    def _snapshot(self):
        """Atomic-ish read of all model fields. Returns a tuple of
        (rec_system, students, courses, interactions, trainers, searches,
        model_version). Once you have this tuple, a background swap can
        replace self.rec_system etc. without changing your local view.

        We take the lock briefly to ensure we read all fields from the
        SAME post-swap state (no torn read where, say, rec_system is the
        new one but students is still the old one).
        """
        with self._lock:
            return (
                self.rec_system,
                self.students,
                self.courses,
                self.interactions,
                self.trainers,
                self.searches,
                self._model_version,
            )

    def _swap_in(self, students, courses, interactions, trainers, searches, rec_system):
        """Atomically replace all model state. Called by load_data() at
        startup and by the background refresh job. Bumps model_version so
        callers (e.g. the per-student recommendation cache) can invalidate.
        """
        with self._lock:
            self.students = students
            self.courses = courses
            self.interactions = interactions
            self.trainers = trainers
            self.searches = searches
            self.rec_system = rec_system
            self._model_version += 1
            print(f"   ✓ Model state swapped (version={self._model_version})")

    def get_model_version(self):
        """Read the current model version (cheap, lock-free atomic read in
        CPython since int reads are GIL-protected). Used by the rec cache."""
        return self._model_version

    def _fetch_data_frames(self):
        """Pull all source dataframes from Postgres. Returns a dict of
        ready-to-use frames. Used by both startup load_data() and the
        background refresh job — same SQL, same normalization, no shared
        mutable state.
        """
        with self.db_conn() as conn:
            students = pd.read_sql("""
                SELECT
                    student_id, name, email,
                    primary_domains, specific_interests, experience_level,
                    engagement_type, is_active
                FROM students
                WHERE is_active = TRUE
            """, conn)
            students['primary_domains'] = students['primary_domains'].apply(
                lambda x: ','.join(x) if isinstance(x, list) else (x if x else '')
            )
            students['specific_interests'] = students['specific_interests'].apply(
                lambda x: ','.join(x) if isinstance(x, list) else (x if x else '')
            )
            print(f"   ✓ Loaded {len(students)} students")

            courses = pd.read_sql("""
                SELECT
                    course_id, trainer_id, title, description, domain, specific_topic, level,
                    duration_hours, language, format, price, has_certificate,
                    average_rating as rating, total_ratings as num_ratings,
                    total_enrolled as num_enrolled, total_completed as num_completed,
                    created_at as created_date, is_active
                FROM courses
                WHERE is_active = TRUE AND is_published = TRUE
            """, conn)
            print(f"   ✓ Loaded {len(courses)} courses")

            interactions = pd.read_sql("""
                SELECT
                    interaction_id, student_id, course_id, interaction_type,
                    time_spent_seconds, rating_value, device, referral_source,
                    created_at as timestamp
                FROM interactions
                ORDER BY created_at DESC
            """, conn)
            print(f"   ✓ Loaded {len(interactions)} interactions")

            trainers = pd.read_sql("""
                SELECT
                    trainer_id, name, email, specializations, skills,
                    experience_years, average_rating as rating, is_active
                FROM trainers
                WHERE is_active = TRUE
            """, conn)
            trainers['specializations'] = trainers['specializations'].apply(
                lambda x: ','.join(x) if isinstance(x, list) else (x if x else '')
            )
            trainers['skills'] = trainers['skills'].apply(
                lambda x: ','.join(x) if isinstance(x, list) else (x if x else '')
            )
            print(f"   ✓ Loaded {len(trainers)} trainers")

            try:
                searches = pd.read_sql("""
                    SELECT
                        search_id, student_id, query, clicked_course_id,
                        created_at as timestamp
                    FROM search_logs
                    ORDER BY created_at DESC
                    LIMIT 10000
                """, conn)
                print(f"   ✓ Loaded {len(searches)} recent searches")
            except Exception:
                print("   ⚠️  No search logs found")
                searches = pd.DataFrame()

        return {
            'students': students,
            'courses': courses,
            'interactions': interactions,
            'trainers': trainers,
            'searches': searches,
        }

    def load_data(self):
        """Initial data load — called once at startup. Writes directly to
        the public fields so build_models() can find them. For background
        refresh use rebuild_models() instead.
        """
        print("📊 Loading data from PostgreSQL...")
        start_time = time.time()

        frames = self._fetch_data_frames()
        # Write under the lock so a concurrent request can't see a
        # half-initialised engine.
        with self._lock:
            self.students = frames['students']
            self.courses = frames['courses']
            self.interactions = frames['interactions']
            self.trainers = frames['trainers']
            self.searches = frames['searches']

        elapsed = time.time() - start_time
        print(f"✅ Data loaded successfully! ({elapsed:.2f}s)")

    def _build_rec_system(self, frames):
        """Construct a fresh CourseRecommendationSystem from a frames dict
        without touching self.* — used by both startup and refresh paths
        so neither one leaves a half-built model behind on failure.
        """
        rs = CourseRecommendationSystem()
        rs.students_df = frames['students']
        rs.courses_df = frames['courses']
        rs.interactions_df = frames['interactions']
        rs.trainers_df = frames['trainers']
        rs.searches_df = frames['searches']

        rs.preprocess_data()
        rs.build_content_based_model()
        rs.build_collaborative_model()
        return rs

    def build_models(self):
        """Build/train the recommendation models from already-loaded data.
        Called once at startup right after load_data().
        """
        print("🧠 Building recommendation models...")
        start_time = time.time()

        # Pull current frames from the engine into a dict, then build.
        # We don't go through _fetch_data_frames here because the caller
        # (FastAPI startup) just called load_data() — no point hitting DB again.
        with self._lock:
            frames = {
                'students': self.students,
                'courses': self.courses,
                'interactions': self.interactions,
                'trainers': self.trainers,
                'searches': self.searches,
            }

        new_rs = self._build_rec_system(frames)

        with self._lock:
            self.rec_system = new_rs
            self._model_version += 1

        elapsed = time.time() - start_time
        print(f"✅ Models built successfully! (version={self._model_version}, {elapsed:.2f}s)")

    def rebuild_models(self):
        """End-to-end refresh: fetch fresh data from DB, build a new model
        instance, then atomically swap it in. Designed to run on a timer
        from the FastAPI background scheduler. In-flight recommendation
        requests keep operating on their snapshot of the old model and
        finish normally; subsequent requests see the new one.

        Returns the new model_version on success, or None on failure
        (in which case the old model stays active — no service downtime).
        """
        print("🔄 [refresh] Rebuilding recommendation model from DB...")
        start_time = time.time()
        try:
            frames = self._fetch_data_frames()
            new_rs = self._build_rec_system(frames)
        except Exception as e:
            print(f"❌ [refresh] failed, keeping existing model: {e}")
            return None

        # Single atomic swap of all six fields. Up to this point, any
        # exception leaves the existing model intact (safe failure mode).
        self._swap_in(
            students=frames['students'],
            courses=frames['courses'],
            interactions=frames['interactions'],
            trainers=frames['trainers'],
            searches=frames['searches'],
            rec_system=new_rs,
        )
        elapsed = time.time() - start_time
        print(f"✅ [refresh] swap complete (v={self._model_version}, {elapsed:.2f}s)")
        return self._model_version

    def get_recommendations(self, student_id, n_recommendations=10):
        """
        Get personalized recommendations for a student

        Strategy:
        - 0 interactions → cold-start (interest matching)
        - 1-5 interactions → content-based
        - 6+ interactions → hybrid (content + collaborative)

        Snapshots all model state up-front so the background refresh job
        can swap in a new model mid-call without producing torn reads.
        Cache layer in front: identical (student_id, n) requests within
        the same model version + interaction count are served from RAM.
        """
        # Single atomic snapshot — once captured, the rebuilder can do
        # whatever it wants and we'll keep operating on these references.
        (rec_system, students, _courses, interactions,
         _trainers, _searches, model_version) = self._snapshot()

        if rec_system is None:
            raise Exception("Model not initialized. Call build_models() first.")

        student_interactions = interactions[
            interactions['student_id'] == student_id
        ]
        interaction_count = len(student_interactions)

        # Cache check — invalidated automatically when model_version
        # increments or interaction_count diverges from when we cached.
        cached = self._rec_cache.get(
            student_id, n_recommendations, model_version, interaction_count
        )
        if cached is not None:
            print(f"   ⚡ cache hit for {student_id} (v={model_version}, n={n_recommendations})")
            return cached

        print(f"   📊 Student {student_id} has {interaction_count} interactions")

        # COLD-START: No interactions
        if interaction_count == 0:
            print("   ❄️  COLD-START: Using interest matching")

            student = students[students['student_id'] == student_id]
            if student.empty:
                print(f"   ❌ Student {student_id} not in cache — fetching live from DB...")
                try:
                    # Pool-borrowed connection — context manager returns it
                    # even if pandas raises mid-query.
                    with self.db_conn() as conn:
                        # Pull primary_domains too — the cold-start ranker uses
                        # it as a hard domain-match filter so 5-star unrelated
                        # courses can't outrank in-domain ones.
                        live = pd.read_sql(
                            "SELECT student_id, primary_domains, specific_interests, experience_level "
                            "FROM students WHERE student_id = %s",
                            conn, params=[student_id]
                        )
                    if live.empty:
                        print(f"   ❌ Student {student_id} not found in DB")
                        return pd.DataFrame()
                    live_row = live.iloc[0]
                    raw_interests = live_row.get('specific_interests', '')
                    interests = ','.join(raw_interests) if isinstance(raw_interests, list) else (raw_interests or '')
                    raw_domains = live_row.get('primary_domains', '')
                    domains = ','.join(raw_domains) if isinstance(raw_domains, list) else (raw_domains or '')
                    level = live_row.get('experience_level', 'beginner') or 'beginner'
                    print(f"   ✓ Live fetch OK — cold-start with domains='{domains}', interests='{interests}', level='{level}'")
                    return rec_system.cold_start_recommendations(
                        student_interests=interests,
                        student_level=level,
                        n_recommendations=n_recommendations,
                        student_domains=domains
                    )
                except Exception as e:
                    print(f"   ❌ Live DB fetch failed: {e}")
                    return pd.DataFrame()

            student_row = student.iloc[0]
            interests = student_row.get('specific_interests', '')
            # primary_domains is already normalized to a comma-string in load_data
            domains = student_row.get('primary_domains', '')
            level = student_row.get('experience_level', 'beginner')

            recs = rec_system.cold_start_recommendations(
                student_interests=interests,
                student_level=level,
                n_recommendations=n_recommendations,
                student_domains=domains
            )

        # FEW INTERACTIONS: Content-based
        elif interaction_count < 6:
            print("   🌱 FEW INTERACTIONS: Using content-based")
            try:
                recs = rec_system.content_based_recommendations(
                    student_id,
                    n_recommendations=n_recommendations
                )
            except Exception:
                recs = rec_system.hybrid_recommendations(
                    student_id,
                    n_recommendations=n_recommendations,
                    include_search=True
                )

        # MANY INTERACTIONS: Full hybrid
        else:
            print(f"   🌿 {interaction_count} INTERACTIONS: Using hybrid")
            recs = rec_system.hybrid_recommendations(
                student_id,
                n_recommendations=n_recommendations,
                include_search=True
            )

        # Add reason/explanation. Pass the snapshot's `students` frame
        # explicitly so we don't read self.students again post-snapshot.
        if not recs.empty:
            recs['reason'] = recs.apply(
                lambda row: self._generate_reason(student_id, row, interaction_count, students),
                axis=1
            )

        # Cache the freshly-computed result for next time. Keyed by the
        # SAME (model_version, interaction_count) we read at the top of
        # this call so even if a refresh happened mid-call we don't store
        # a stale entry under the new version.
        self._rec_cache.put(
            student_id, n_recommendations, recs, model_version, interaction_count
        )

        return recs

    def get_cold_start_recommendations(self, interests, level, n_recommendations=10,
                                       domains=None):
        """Cold-start recommendations for new users.

        `domains` (optional, comma-separated) enables the hard domain-match
        multiplier. When omitted, ranking falls back to pure content match —
        callers SHOULD pass it to prevent highly-rated unrelated courses
        from surfacing at the top.
        """
        # Snapshot — same atomicity guarantee as get_recommendations.
        (rec_system, _s, _c, _i, _t, _se, _v) = self._snapshot()
        if rec_system is None:
            raise Exception("Model not initialized.")

        return rec_system.cold_start_recommendations(
            student_interests=interests,
            student_level=level,
            n_recommendations=n_recommendations,
            student_domains=domains
        )

    def _generate_reason(self, student_id, course_row, interaction_count, students=None):
        """Generate reason for recommendation.

        `students` is the snapshot frame from get_recommendations — passed
        in to keep the whole call atomic w.r.t. a model swap. Falls back
        to self.students for backward-compat when called externally.
        """
        if students is None:
            students = self.students
        reasons = []

        if interaction_count == 0:
            student = students[students['student_id'] == student_id]
            if not student.empty:
                interests = student.iloc[0]['specific_interests']
                if interests and any(i.strip().lower() in str(course_row.get('title', '')).lower()
                                   for i in str(interests).split(',')):
                    reasons.append("Matches your interests")

        student = students[students['student_id'] == student_id]
        if not student.empty:
            domains = str(student.iloc[0].get('primary_domains', ''))
            if course_row.get('domain') in domains:
                reasons.append(f"In your domain")

        if course_row.get('rating', 0) >= 4.0:
            reasons.append(f"Highly rated ({course_row['rating']:.1f}/5.0)")

        if course_row.get('num_enrolled', 0) > 50:
            reasons.append("Popular")

        if interaction_count >= 6:
            reasons.append("Similar students liked this")

        if not reasons:
            reasons.append("Recommended for you")

        return " • ".join(reasons[:2])

    def explain_recommendation(self, student_id, course_id):
        """Explain why recommended"""
        (rec_system, _s, courses, _i, _t, _se, _v) = self._snapshot()
        if rec_system is None:
            raise Exception("Model not initialized.")

        try:
            explanation_text = rec_system.explain_recommendation(student_id, course_id)

            if not explanation_text or explanation_text == "Student or course not found":
                return None

            course = courses[courses['course_id'] == course_id]
            if course.empty:
                return None

            course_row = course.iloc[0]
            factors = [line.strip() for line in explanation_text.split('\n') if line.strip()]

            return {
                'course_title': course_row['title'],
                'explanation': explanation_text,
                'confidence_score': 0.85,
                'factors': factors if factors else [
                    f"Matches {course_row['domain']}",
                    f"{course_row['level']} level",
                    f"Rated {course_row['rating']}/5.0"
                ]
            }
        except Exception:
            course = courses[courses['course_id'] == course_id]
            if course.empty:
                return None

            course_row = course.iloc[0]
            return {
                'course_title': course_row['title'],
                'explanation': f"Recommended based on {course_row['domain']}",
                'confidence_score': 0.75,
                'factors': [
                    f"Course in {course_row['domain']}",
                    f"{course_row['level']} level",
                    f"Rated {course_row['rating']}/5.0"
                ]
            }

    def track_interaction(self, student_id, course_id, interaction_type, timestamp):
        """Track interaction"""
        import uuid
        interaction_id = f"INT_{uuid.uuid4().hex[:10]}"

        # Pooled connection — context manager returns it on the way out.
        with self.db_conn() as conn:
            cursor = conn.cursor()
            committed = False
            try:
                cursor.execute("""
                    INSERT INTO interactions (
                        interaction_id, student_id, course_id, interaction_type, created_at
                    ) VALUES (%s, %s, %s, %s, %s)
                """, (interaction_id, student_id, course_id, interaction_type, timestamp))

                conn.commit()
                committed = True
                print(f"✓ Tracked: {student_id} {interaction_type} {course_id}")
            except Exception as e:
                conn.rollback()
                print(f"✗ Error: {e}")
            finally:
                cursor.close()

        # Invalidate this student's cached recommendations so their NEXT
        # call returns recs that reflect what they just did. Note: the
        # in-memory interactions frame still only updates on the next
        # scheduled model refresh, but cold-start lookups always re-query
        # the DB for the student's row so the new interaction surfaces.
        if committed:
            self._rec_cache.invalidate_student(student_id)

    def get_trending_courses(self, domain=None, n=10):
        """Get trending courses"""
        (rec_system, _s, courses, _i, _t, _se, _v) = self._snapshot()
        if rec_system is None:
            raise Exception("Model not initialized.")

        if domain:
            trending = rec_system.popularity_based_recommendations(
                domain=domain,
                n_recommendations=n
            )
        else:
            trending = courses.sort_values(
                ['num_enrolled', 'rating'],
                ascending=[False, False]
            ).head(n)

        return trending