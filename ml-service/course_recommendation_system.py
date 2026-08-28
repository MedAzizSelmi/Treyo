"""
COURSE RECOMMENDATION SYSTEM - FIXED
=====================================
Fixed cold_start_recommendations to prioritize interest matching over ratings
"""

import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import MinMaxScaler, LabelEncoder, normalize
from scipy.sparse import csr_matrix
import warnings
warnings.filterwarnings('ignore')

# FAISS is the production-grade ANN library used for top-k similarity
# search. We import it optionally so the service still boots on machines
# where the wheel isn't installed (falls back to sklearn brute force).
try:
    import faiss
    _FAISS_AVAILABLE = True
except ImportError:
    _FAISS_AVAILABLE = False
    print("⚠️  faiss not installed — falling back to sklearn cosine_similarity (slow at >10k courses)")

class CourseRecommendationSystem:
    """
    Hybrid recommendation system combining multiple approaches
    """

    def __init__(self):
        self.students_df = None
        self.courses_df = None
        self.interactions_df = None
        self.trainers_df = None
        self.searches_df = None

        # Models
        self.tfidf_vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
        self.scaler = MinMaxScaler()
        self.label_encoder = LabelEncoder()

        # Matrices
        self.course_content_matrix = None      # sparse TF-IDF, shape (N_courses, V)
        self.user_item_matrix = None            # dense pivot of interactions
        # NOTE: course_similarity_matrix was a precomputed N×N cosine matrix
        # that was never read elsewhere — pure O(N²) dead memory. Removed.
        # All content similarity now goes through self._faiss_index (or
        # the sklearn fallback when FAISS isn't installed).
        self._faiss_index = None                # IndexFlatIP over L2-normalized content vectors
        self._content_matrix_normalised = None  # numpy float32, kept for the sklearn fallback path
        # False until build_content_based_model() has actually fitted the
        # vectorizer. A fresh deployment has no courses to fit on, and
        # querying an unfitted TfidfVectorizer raises — so the scorers
        # check this flag instead of assuming a model exists.
        self._content_model_ready = False

        print("✅ Course Recommendation System initialized")

    def load_data(self, students_path, courses_path, interactions_path,
                  trainers_path=None, searches_path=None):
        """Load all datasets"""
        print("\n📂 Loading datasets...")

        self.students_df = pd.read_csv(students_path)
        self.courses_df = pd.read_csv(courses_path)
        self.interactions_df = pd.read_csv(interactions_path)

        if trainers_path:
            self.trainers_df = pd.read_csv(trainers_path)
        if searches_path:
            self.searches_df = pd.read_csv(searches_path)

        print(f"   Students: {len(self.students_df)}")
        print(f"   Courses: {len(self.courses_df)}")
        print(f"   Interactions: {len(self.interactions_df)}")
        if trainers_path:
            print(f"   Trainers: {len(self.trainers_df)}")
        if searches_path:
            print(f"   Searches: {len(self.searches_df)}")

        return self

    def preprocess_data(self):
        """Preprocess and engineer features"""
        print("\n🔧 Preprocessing data...")

        # A freshly deployed instance starts with an empty catalogue. The
        # sklearn scaler and encoder below both raise ValueError on zero-row
        # input, so those steps are skipped and their columns filled with
        # empty series instead. Every column still exists afterwards, so
        # downstream code can index by name without knowing which path ran.
        no_courses = self.courses_df is None or self.courses_df.empty

        # 1. Create course content features
        self.courses_df['content_text'] = (
            self.courses_df['title'].fillna('') + ' ' +
            self.courses_df['description'].fillna('') + ' ' +
            self.courses_df['domain'].fillna('') + ' ' +
            self.courses_df['specific_topic'].fillna('') + ' ' +
            self.courses_df['level'].fillna('')
        )

        # 2. Normalize ratings
        if no_courses:
            self.courses_df['rating_normalized'] = pd.Series(dtype='float64')
        else:
            self.courses_df['rating_normalized'] = self.scaler.fit_transform(
                self.courses_df[['rating']]
            )

        # 3. Calculate course popularity
        course_interactions = self.interactions_df.groupby('course_id').size().reset_index(name='popularity')
        self.courses_df = self.courses_df.merge(course_interactions, on='course_id', how='left')
        self.courses_df['popularity'] = self.courses_df['popularity'].fillna(0)
        if no_courses:
            self.courses_df['popularity_normalized'] = pd.Series(dtype='float64')
        else:
            self.courses_df['popularity_normalized'] = self.scaler.fit_transform(
                self.courses_df[['popularity']]
            )

        # 4. Encode difficulty level
        if no_courses:
            self.courses_df['level_encoded'] = pd.Series(dtype='int64')
        else:
            self.courses_df['level_encoded'] = self.label_encoder.fit_transform(
                self.courses_df['level']
            )

        # 5. Create student interest profiles
        self.students_df['interest_text'] = (
            self.students_df['primary_domains'].fillna('') + ' ' +
            self.students_df['specific_interests'].fillna('')
        )

        print("   ⚠️  Empty catalogue — numeric features skipped"
              if no_courses else "   ✓ Features engineered")
        return self

    def build_content_based_model(self):
        """Build content-based filtering using TF-IDF + a FAISS index.

        Two changes from the old version:
          1. We no longer materialize the N×N course-to-course similarity
             matrix. It was unused dead memory (O(N²) growth).
          2. We build a FAISS IndexFlatIP over the L2-normalized TF-IDF
             rows. Inner product on unit vectors = cosine similarity, so
             a FAISS top-k search returns the same neighbours sklearn's
             cosine_similarity would, in O(log N) instead of O(N).
        """
        print("\n🧠 Building Content-Based Model...")

        # A freshly deployed instance has no catalogue to fit on, and
        # TfidfVectorizer raises "empty vocabulary" on zero documents.
        # Leave the model unbuilt and flagged: _content_scores() returns
        # zeros in that state, so every ranker still runs to completion and
        # simply produces nothing. The scheduled refresh builds the real
        # model as soon as the first courses are published.
        if self.courses_df is None or self.courses_df.empty:
            self._reset_content_model("empty catalogue")
            return self

        # 1. TF-IDF matrix (sparse, kept for backwards-compat with any
        # caller that still expects course_content_matrix).
        try:
            self.course_content_matrix = self.tfidf_vectorizer.fit_transform(
                self.courses_df['content_text']
            )
        except ValueError as e:
            # Reachable with a tiny catalogue whose every document reduces
            # to stop words — same "no vocabulary" failure, same handling.
            self._reset_content_model(str(e))
            return self

        print(f"   ✓ Content matrix shape: {self.course_content_matrix.shape}")

        # 2. L2-normalize the rows so dot product == cosine similarity.
        # We must densify for FAISS — but only to float32 of (N, V), which
        # is much smaller than the old (N, N) matrix once N > V.
        dense = self.course_content_matrix.toarray().astype('float32')
        # normalize() handles zero rows safely (returns zeros).
        self._content_matrix_normalised = normalize(dense, norm='l2', axis=1)

        if _FAISS_AVAILABLE:
            d = self._content_matrix_normalised.shape[1]
            # IndexFlatIP = exact (not approximate) inner-product search.
            # For our scale (≤ a few hundred thousand courses) the exact
            # index is plenty fast and gives identical results to sklearn.
            # When N grows past ~1M, swap for IndexIVFFlat with training.
            self._faiss_index = faiss.IndexFlatIP(d)
            self._faiss_index.add(self._content_matrix_normalised)
            print(f"   ✓ FAISS index built (d={d}, ntotal={self._faiss_index.ntotal})")
        else:
            self._faiss_index = None
            print("   ⚠️  Skipping FAISS index — sklearn fallback will be used")

        self._content_model_ready = True
        return self

    def _reset_content_model(self, reason):
        """Put the content model back into its unbuilt state.

        Called when there is nothing to fit on. Clearing every artefact
        together means no ranker can find a half-built model — either all
        of them are present or none are.
        """
        self.course_content_matrix = None
        self._content_matrix_normalised = None
        self._faiss_index = None
        self._content_model_ready = False
        print(f"   ⚠️  Content model not built ({reason})")

    def _content_scores(self, query_text):
        """Compute cosine similarity between a free-text query and every
        course. Returns a numpy array of length N_courses aligned with
        self.courses_df row order. Uses FAISS when available (fast at
        scale) or sklearn cosine_similarity as a fallback.

        Why we return the full N-array rather than top-K: the rankers
        combine content_score with rating + popularity + level boost and
        only then take the top N, so they need all scores to do the math.
        For very large N this should be replaced with a true top-K
        candidate-generation pattern; see the docstring on
        _topk_candidates() below.
        """
        # No fitted model (empty catalogue) — every course scores zero.
        # Returning a correctly-sized array rather than raising keeps the
        # callers' arithmetic valid; they go on to produce an empty top-N.
        if not self._content_model_ready:
            return np.zeros(0 if self.courses_df is None else len(self.courses_df),
                            dtype='float32')

        # TF-IDF transform → sparse row vector
        q_sparse = self.tfidf_vectorizer.transform([query_text])
        # Densify + normalize so FAISS or sklearn both see the same shape.
        q_dense = normalize(q_sparse.toarray().astype('float32'), norm='l2', axis=1)

        if self._faiss_index is not None:
            # FAISS doesn't have a "score everything" mode, but searching
            # for k = ntotal returns all neighbours sorted. We then reorder
            # back to the original row order so callers can keep indexing
            # by self.courses_df position.
            n = self._faiss_index.ntotal
            scores, idx = self._faiss_index.search(q_dense, n)
            out = np.zeros(n, dtype='float32')
            out[idx[0]] = scores[0]
            return out

        # Fallback: sklearn brute force on the normalized matrix.
        return cosine_similarity(q_dense, self._content_matrix_normalised)[0]

    def _topk_candidates(self, query_text, k):
        """Top-K nearest courses for the query text, as (indices, scores).
        Indices are positions in self.courses_df. This is the path to use
        when N >> n_recommendations — avoids scoring the long tail. Not
        currently wired into the rankers (which need full scores for the
        rating/popularity mix); kept here for future "candidate generation
        → reranking" refactors when course catalogue grows beyond ~100k.
        """
        if not self._content_model_ready:
            return np.array([], dtype='int64'), np.array([], dtype='float32')

        q_sparse = self.tfidf_vectorizer.transform([query_text])
        q_dense = normalize(q_sparse.toarray().astype('float32'), norm='l2', axis=1)
        if self._faiss_index is not None:
            k = min(k, self._faiss_index.ntotal)
            scores, idx = self._faiss_index.search(q_dense, k)
            return idx[0], scores[0]
        # Fallback: brute force then take top-K via argpartition.
        all_scores = cosine_similarity(q_dense, self._content_matrix_normalised)[0]
        top_idx = np.argpartition(-all_scores, min(k, len(all_scores) - 1))[:k]
        # Sort the top-K so the caller sees descending scores.
        top_idx = top_idx[np.argsort(-all_scores[top_idx])]
        return top_idx, all_scores[top_idx]

    def build_collaborative_model(self):
        """Build collaborative filtering using user-item interactions"""
        print("\n👥 Building Collaborative Filtering Model...")

        # Create user-item interaction matrix
        # Weight different interactions differently
        interaction_weights = {
            'viewed': 1,
            'clicked_interested': 2,
            'saved': 2,
            'enrolled': 5,
            'completed': 10,
            'rated': 3,
            'dropped': -2
        }

        # Add weights to interactions
        self.interactions_df['weight'] = self.interactions_df['interaction_type'].map(
            interaction_weights
        ).fillna(1)

        # Aggregate interactions per student-course pair
        user_item_df = self.interactions_df.groupby(
            ['student_id', 'course_id']
        )['weight'].sum().reset_index()

        # No interactions yet — a real state for a fresh deployment, and
        # for any instance whose first users haven't engaged with anything.
        # An empty frame is the right answer: collaborative_recommendations()
        # tests membership in .index, which is simply False for everyone.
        if user_item_df.empty:
            self.user_item_matrix = pd.DataFrame()
            print("   ⚠️  No interactions — collaborative model is empty")
            return self

        # Create pivot table (user-item matrix)
        self.user_item_matrix = user_item_df.pivot_table(
            index='student_id',
            columns='course_id',
            values='weight',
            fill_value=0
        )

        print(f"   ✓ User-Item matrix shape: {self.user_item_matrix.shape}")
        # Sparsity is undefined on a zero-cell matrix — guard the division
        # rather than letting a fresh instance die on ZeroDivisionError.
        n_cells = self.user_item_matrix.shape[0] * self.user_item_matrix.shape[1]
        if n_cells:
            filled = (self.user_item_matrix > 0).sum().sum()
            print(f"   ✓ Sparsity: {(1 - filled / n_cells) * 100:.2f}%")

        return self

    def _get_student_domains(self, student_row):
        """Parse the student's primary_domains into a normalized lowercase set.

        Used by the rankers below to apply a hard domain-match multiplier so
        a highly-rated trainer in an unrelated domain can't outrank a weaker
        match in the student's own field. Returns an empty set when the
        student hasn't picked any domains — callers should treat that as
        "no domain filter" and rank purely on content / interaction signals.
        """
        domains_raw = student_row.get('primary_domains', '') or ''
        return {
            d.strip().lower()
            for d in str(domains_raw).split(',')
            if d.strip()
        }

    def _domain_multiplier(self, student_domains, in_domain_weight=1.0,
                           out_domain_weight=0.4):
        """Return a per-course multiplier array that boosts in-domain courses.

        - in-domain  → 1.0   (full score)
        - out-of-domain → 0.4 (heavy penalty — can still surface if it has
          overwhelming content/collab signal, but ratings alone can't push
          an unrelated course past in-domain ones)
        If the student has no declared domains we return a flat 1.0 array so
        ranking falls back to pure content/rating/popularity scoring.
        """
        if not student_domains:
            return np.ones(len(self.courses_df))
        course_domains_lower = self.courses_df['domain'].fillna('').str.lower()
        return np.where(
            course_domains_lower.isin(student_domains),
            in_domain_weight,
            out_domain_weight,
        )

    def content_based_recommendations(self, student_id, n_recommendations=10):
        """
        Generate recommendations based on student interests and course content.

        Scoring now uses a hard domain-match multiplier so a highly-rated
        course outside the student's domain can't outrank a weaker match
        inside it. Ratings still order results within the student's domain.
        """
        # Get student data
        student = self.students_df[self.students_df['student_id'] == student_id]

        if student.empty:
            print(f"⚠️  Student {student_id} not found")
            return pd.DataFrame()

        student_row = student.iloc[0]
        student_interests = student_row['interest_text']

        # FAISS-backed similarity (sklearn fallback when faiss is missing).
        course_scores = self._content_scores(student_interests)

        # Get student's experience level
        student_level = student_row['experience_level']

        # Create scoring DataFrame
        scores_df = pd.DataFrame({
            'course_id': self.courses_df['course_id'],
            'content_score': course_scores,
            'rating_score': self.courses_df['rating_normalized'],
            'popularity_score': self.courses_df['popularity_normalized'],
            'level': self.courses_df['level']
        })

        # Boost courses matching student's level
        level_boost = np.where(scores_df['level'] == student_level, 1.2, 1.0)

        # Hard domain-match multiplier. Without this, a 5-star unrelated
        # course (rating_score ≈ 1.0 × 0.3 = 0.30) beats a domain-matched
        # course with content_score 0.4 (0.4 × 0.5 = 0.20).
        student_domains = self._get_student_domains(student_row)
        domain_mult = self._domain_multiplier(student_domains)

        # Reweighted: content 65 / rating 15 / popularity 20.
        # Rating is now low enough that, within the same domain, it acts as
        # a tiebreaker rather than the dominant factor.
        scores_df['final_score'] = (
            scores_df['content_score'] * 0.65 * level_boost +
            scores_df['rating_score'] * 0.15 +
            scores_df['popularity_score'] * 0.20
        ) * domain_mult

        # Strict domain priority: in-domain courses always rank above any
        # out-of-domain course, regardless of score. The 0.4 multiplier
        # above is a soft prior — a strong-enough out-of-domain score could
        # still creep past a weak in-domain one. This sort guarantees it
        # never does. Within each group, the existing score order applies.
        scores_df['_domain_lc'] = self.courses_df['domain'].fillna('').str.lower().values
        if student_domains:
            scores_df['_in_domain'] = scores_df['_domain_lc'].isin(student_domains)
            scores_df = scores_df.sort_values(
                ['_in_domain', 'final_score'],
                ascending=[False, False],
            )
        else:
            scores_df = scores_df.sort_values('final_score', ascending=False)

        top_courses = scores_df.head(n_recommendations)

        # Merge with course details
        recommendations = self.courses_df.merge(
            top_courses[['course_id', 'final_score']],
            on='course_id'
        )

        # Preserve the strict in-domain ordering after the merge (which
        # otherwise reorders by self.courses_df position).
        order_map = {cid: i for i, cid in enumerate(top_courses['course_id'].tolist())}
        recommendations['_order'] = recommendations['course_id'].map(order_map)
        recommendations = recommendations.sort_values('_order').drop(columns='_order')

        return recommendations[['course_id', 'title', 'domain', 'specific_topic',
                               'level', 'rating', 'final_score']]

    def collaborative_recommendations(self, student_id, n_recommendations=10):
        """
        Generate recommendations based on similar users' behavior
        """
        if student_id not in self.user_item_matrix.index:
            print(f"⚠️  No interaction history for student {student_id}")
            return pd.DataFrame()

        # Get student's interaction vector
        student_vector = self.user_item_matrix.loc[student_id].values.reshape(1, -1)

        # Calculate similarity with all users
        user_similarity = cosine_similarity(
            student_vector,
            self.user_item_matrix.values
        )[0]

        # Get top similar users (excluding the student themselves)
        similar_users_idx = np.argsort(user_similarity)[::-1][1:21]  # Top 20 similar users

        # Get courses interacted with by similar users
        similar_users_courses = self.user_item_matrix.iloc[similar_users_idx]

        # Weight by user similarity
        weighted_scores = (similar_users_courses.T * user_similarity[similar_users_idx]).T

        # Aggregate scores
        course_scores = weighted_scores.sum(axis=0)

        # Remove courses already interacted with by the student
        student_courses = self.user_item_matrix.loc[student_id]
        course_scores[student_courses > 0] = 0

        # Get top recommendations
        top_course_ids = course_scores.nlargest(n_recommendations).index.tolist()

        recommendations = self.courses_df[
            self.courses_df['course_id'].isin(top_course_ids)
        ].copy()

        recommendations['collab_score'] = recommendations['course_id'].map(
            course_scores.to_dict()
        )

        return recommendations[['course_id', 'title', 'domain', 'specific_topic',
                               'level', 'rating', 'collab_score']].sort_values(
                                   'collab_score', ascending=False
                               )

    def popularity_based_recommendations(self, domain=None, n_recommendations=10):
        """
        Generate recommendations based on popularity and ratings.

        `domain` accepts either a single string (legacy) or an iterable of
        domain names. When provided, results are restricted to that set —
        critical to prevent highly-rated unrelated courses from showing up
        as recommendations for a student whose domain we already know.
        """
        courses = self.courses_df.copy()

        # Filter by domain (single string or iterable) if specified
        if domain:
            if isinstance(domain, str):
                allowed = {domain.lower()}
            else:
                allowed = {d.lower() for d in domain if d}
            if allowed:
                courses = courses[courses['domain'].fillna('').str.lower().isin(allowed)]

        # Popularity 50 / rating 50 — within the already-filtered domain
        # bucket, ratings act as a tiebreaker between popular courses.
        courses['popularity_rating_score'] = (
            courses['popularity_normalized'] * 0.5 +
            courses['rating_normalized'] * 0.5
        )

        top_courses = courses.nlargest(n_recommendations, 'popularity_rating_score')

        return top_courses[['course_id', 'title', 'domain', 'specific_topic',
                           'level', 'rating', 'popularity']]

    def search_based_recommendations(self, student_id, n_recommendations=10):
        """
        Generate recommendations based on student's search history
        """
        if self.searches_df is None:
            return pd.DataFrame()

        # Get student's searches
        student_searches = self.searches_df[
            self.searches_df['student_id'] == student_id
        ]

        if student_searches.empty:
            return pd.DataFrame()

        # Combine all search queries
        search_text = ' '.join(student_searches['query'].tolist())

        # FAISS-backed similarity (sklearn fallback when faiss is missing).
        course_scores = self._content_scores(search_text)

        # Create recommendations
        scores_df = pd.DataFrame({
            'course_id': self.courses_df['course_id'],
            'search_score': course_scores
        })

        top_courses = scores_df.nlargest(n_recommendations, 'search_score')

        recommendations = self.courses_df.merge(top_courses, on='course_id')

        return recommendations[['course_id', 'title', 'domain', 'specific_topic',
                               'level', 'rating', 'search_score']].sort_values(
                                   'search_score', ascending=False
                               )

    def hybrid_recommendations(self, student_id, n_recommendations=10,
                              include_search=True):
        """
        MAIN RECOMMENDATION FUNCTION — combines all methods.

        Source weights:
          - Content (domain + interests, with hard domain gate): 45 %
          - Collaborative (similar students' interactions):       35 %
          - Search history:                                       15 %
          - Popularity (highly-rated trainers in same domain):     5 %

        Domain ordering (the strict rule):
          AFTER all sources are aggregated, results are sorted with a
          two-level key:
            primary  → in_domain DESC  (True before False)
            secondary → final_score DESC

          This GUARANTEES that no out-of-domain course can ever rank above
          an in-domain one. Without it, collaborative + search picks
          (which on their own don't see the student's domain) could leak
          unrelated courses into the top slots — a student in 'informatique'
          whose behavioural peers happened to also explore 'marketing'
          would see marketing courses above informatique ones.
        """
        print(f"\n🎯 Generating Hybrid Recommendations for {student_id}...")

        # Resolve the student's domains UP-FRONT so we can use them both for
        # the popularity filter below and the final domain-priority sort.
        # We snapshot it once here — if the row isn't found we treat the
        # student as having no domain preference (every course is "in").
        student_row = self.students_df[self.students_df['student_id'] == student_id]
        student_domains = self._get_student_domains(student_row.iloc[0]) if not student_row.empty else set()

        all_recommendations = []

        # 1. Content-Based (45% weight) — strongest signal: explicit domain
        # + interests match the course content.
        try:
            content_recs = self.content_based_recommendations(student_id, n_recommendations * 2)
            if not content_recs.empty:
                content_recs['source'] = 'content'
                content_recs['weight'] = 0.45
                all_recommendations.append(content_recs)
                print(f"   ✓ Content-based: {len(content_recs)} courses")
        except Exception as e:
            print(f"   ⚠️  Content-based failed: {e}")

        # 2. Collaborative (35% weight) — what students with similar
        # interaction history have engaged with.
        try:
            collab_recs = self.collaborative_recommendations(student_id, n_recommendations * 2)
            if not collab_recs.empty:
                collab_recs['source'] = 'collaborative'
                collab_recs['weight'] = 0.35
                # Rename score column
                if 'collab_score' in collab_recs.columns:
                    collab_recs.rename(columns={'collab_score': 'final_score'}, inplace=True)
                all_recommendations.append(collab_recs)
                print(f"   ✓ Collaborative: {len(collab_recs)} courses")
        except Exception as e:
            print(f"   ⚠️  Collaborative failed: {e}")

        # 3. Search-Based (15% weight) — what the student has searched for.
        if include_search and self.searches_df is not None:
            try:
                search_recs = self.search_based_recommendations(student_id, n_recommendations)
                if not search_recs.empty:
                    search_recs['source'] = 'search'
                    search_recs['weight'] = 0.15
                    # Rename score column
                    if 'search_score' in search_recs.columns:
                        search_recs.rename(columns={'search_score': 'final_score'}, inplace=True)
                    all_recommendations.append(search_recs)
                    print(f"   ✓ Search-based: {len(search_recs)} courses")
            except Exception as e:
                print(f"   ⚠️  Search-based failed: {e}")

        # 4. Popularity (5% weight) — surface "highly-rated trainers in
        # YOUR field" but only as a small tiebreaker, never enough to push
        # an unrelated course to the top. Uses the student_domains we
        # already resolved at the top of this method.
        try:
            if student_domains:
                pop_recs = self.popularity_based_recommendations(
                    student_domains, n_recommendations
                )
                if not pop_recs.empty:
                    pop_recs['source'] = 'popularity'
                    pop_recs['weight'] = 0.05
                    pop_recs['final_score'] = pop_recs['rating'] / 5.0
                    all_recommendations.append(pop_recs)
                    print(f"   ✓ Popularity-based: {len(pop_recs)} courses")
        except Exception as e:
            print(f"   ⚠️  Popularity-based failed: {e}")

        # Combine all recommendations
        if not all_recommendations:
            print("   ❌ No recommendations generated")
            return pd.DataFrame()

        combined = pd.concat(all_recommendations, ignore_index=True)

        # Remove duplicates by aggregating scores
        aggregated = combined.groupby('course_id').agg({
            'title': 'first',
            'domain': 'first',
            'specific_topic': 'first',
            'level': 'first',
            'rating': 'first',
            'final_score': lambda x: (x * combined.loc[x.index, 'weight']).sum(),
            'source': lambda x: ', '.join(set(x))
        }).reset_index()

        # STRICT DOMAIN PRIORITY:
        #   Sort by (in_domain DESC, final_score DESC). This guarantees no
        #   out-of-domain course outranks any in-domain one — even when a
        #   collaborative/search pick from outside the domain has a higher
        #   raw score than a weak in-domain match.
        #
        #   The student's behaviourally-similar peers may have explored
        #   tangentially-related fields, but that's no guarantee THIS
        #   student wants those. Domain is the explicit preference signal;
        #   collab is an inferred one — explicit wins.
        if student_domains:
            aggregated['_in_domain'] = aggregated['domain'].fillna('').str.lower().isin(student_domains)
            aggregated = aggregated.sort_values(
                ['_in_domain', 'final_score'],
                ascending=[False, False],
            ).drop(columns='_in_domain')
            in_count = aggregated.head(n_recommendations)['domain'].fillna('').str.lower().isin(student_domains).sum()
            print(f"   🎯 Domain-priority sort: {in_count}/{min(n_recommendations, len(aggregated))} in-domain in top results")
        else:
            # No declared domain → fall back to pure score ordering.
            aggregated = aggregated.sort_values('final_score', ascending=False)

        # Get top N
        final_recommendations = aggregated.head(n_recommendations)

        print(f"\n✅ Final recommendations: {len(final_recommendations)} courses")

        return final_recommendations

    def cold_start_recommendations(self, student_interests, student_level='beginner',
                                   n_recommendations=10, student_domains=None):
        """
        Handle new students with no interaction history.

        Args:
            student_interests: comma-separated specific_interests from
              onboarding (e.g. "React, JavaScript"). Used for TF-IDF
              content matching against course title/description/topic.
            student_level: beginner / intermediate / expert
            student_domains: optional comma-separated primary_domains
              (e.g. "informatique,design"). Used for the HARD domain-
              match multiplier so highly-rated unrelated courses can't
              outrank in-domain ones. If omitted (legacy callers), the
              multiplier falls back to flat 1.0 and ranking is pure
              content/rating/popularity.

        Scoring: interest 70 / rating 15 / popularity 15, gated by domain.
        """
        print(f"\n❄️  Cold-start recommendations for new student...")

        # FAISS-backed similarity (sklearn fallback when faiss is missing).
        course_scores = self._content_scores(student_interests)

        # Create scoring DataFrame
        scores_df = pd.DataFrame({
            'course_id': self.courses_df['course_id'],
            'content_score': course_scores,
            'rating_score': self.courses_df['rating_normalized'],
            'popularity_score': self.courses_df['popularity_normalized'],
            'level': self.courses_df['level']
        })

        # Boost beginner courses for new students
        level_boost = np.where(scores_df['level'] == student_level, 1.3, 1.0)

        # Hard domain-match multiplier. We need primary_domains (not the
        # finer-grained specific_interests) because course.domain is the
        # high-level field (e.g. "informatique"). When the caller didn't
        # pass domains, fall back to flat 1.0 — content_score alone has to
        # carry the ranking in that case.
        domain_tokens = {
            t.strip().lower()
            for t in (student_domains or '').split(',')
            if t.strip()
        }
        domain_mult = self._domain_multiplier(domain_tokens)

        # Interest 70 / rating 15 / popularity 15, then domain-gated.
        scores_df['final_score'] = (
            scores_df['content_score'] * 0.7 * level_boost +
            scores_df['rating_score'] * 0.15 +
            scores_df['popularity_score'] * 0.15
        ) * domain_mult

        # Strict domain priority — same guarantee as content_based_recs:
        # in-domain courses always appear before any out-of-domain course,
        # regardless of raw score. The multiplier above is a soft hint, this
        # sort is the actual contract with the user.
        scores_df['_domain_lc'] = self.courses_df['domain'].fillna('').str.lower().values
        if domain_tokens:
            scores_df['_in_domain'] = scores_df['_domain_lc'].isin(domain_tokens)
            scores_df = scores_df.sort_values(
                ['_in_domain', 'final_score'],
                ascending=[False, False],
            )
        else:
            scores_df = scores_df.sort_values('final_score', ascending=False)

        top_courses = scores_df.head(n_recommendations)

        recommendations = self.courses_df.merge(
            top_courses[['course_id', 'final_score']],
            on='course_id'
        )

        # Preserve the strict ordering after merge.
        order_map = {cid: i for i, cid in enumerate(top_courses['course_id'].tolist())}
        recommendations['_order'] = recommendations['course_id'].map(order_map)
        recommendations = recommendations.sort_values('_order').drop(columns='_order')

        print(f"   ✓ Generated {len(recommendations)} cold-start recommendations")

        return recommendations[['course_id', 'title', 'domain', 'specific_topic',
                               'level', 'rating', 'final_score']]

    def explain_recommendation(self, student_id, course_id):
        """
        Explain why a course was recommended
        """
        student = self.students_df[self.students_df['student_id'] == student_id]
        course = self.courses_df[self.courses_df['course_id'] == course_id]

        if student.empty or course.empty:
            return "Student or course not found"

        student_interests = student.iloc[0]['specific_interests'].split(',')
        course_topic = course.iloc[0]['specific_topic']
        course_domain = course.iloc[0]['domain']
        course_rating = course.iloc[0]['rating']

        explanation = []

        # Check interest match
        if course_topic in student_interests or course_domain in student.iloc[0]['primary_domains']:
            explanation.append(f"✓ Matches your interest in {course_topic}")

        # Check rating
        if course_rating >= 4.0:
            explanation.append(f"✓ Highly rated ({course_rating}/5.0)")

        # Check if popular
        if 'popularity' in course.columns and course.iloc[0]['popularity'] > self.courses_df['popularity'].median():
            explanation.append("✓ Popular among other students")

        # Check similar user behavior
        if student_id in self.user_item_matrix.index:
            # Find similar users who took this course
            student_vector = self.user_item_matrix.loc[student_id].values.reshape(1, -1)
            user_similarity = cosine_similarity(student_vector, self.user_item_matrix.values)[0]

            course_col = course_id if course_id in self.user_item_matrix.columns else None
            if course_col:
                users_who_took = self.user_item_matrix[self.user_item_matrix[course_col] > 0].index
                similar_users_who_took = [u for u in users_who_took if u != student_id]

                if similar_users_who_took:
                    explanation.append(f"✓ Students similar to you have taken this course")

        return "\n".join(explanation) if explanation else "Recommended based on general popularity and ratings"