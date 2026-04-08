"""
RECOMMENDATION ENGINE - FINAL FIXED VERSION
============================================
Works with the actual CourseRecommendationSystem API
"""

import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv
from course_recommendation_system import CourseRecommendationSystem
import time

load_dotenv()

class RecommendationEngine:
    """
    Recommendation engine with proper cold-start handling
    """

    def __init__(self):
        self.students = None
        self.courses = None
        self.interactions = None
        self.trainers = None
        self.searches = None
        self.rec_system = None

        self.db_config = {
            'host': os.getenv('DB_HOST', 'localhost'),
            'database': os.getenv('DB_NAME', 'course_recommendation'),
            'user': os.getenv('DB_USER', 'postgres'),
            'password': os.getenv('DB_PASSWORD', 'your_password'),
            'port': int(os.getenv('DB_PORT', 5432))
        }

    def connect_db(self):
        """Connect to PostgreSQL"""
        return psycopg2.connect(**self.db_config)

    def load_data(self):
        """Load data from PostgreSQL database"""
        print("📊 Loading data from PostgreSQL...")
        start_time = time.time()

        try:
            conn = self.connect_db()
            print("   ✓ Database connected")
        except Exception as e:
            print(f"   ❌ Database connection failed: {e}")
            raise

        try:
            self.students = pd.read_sql("""
                SELECT 
                    student_id, name, email, 
                    primary_domains, specific_interests, experience_level,
                    engagement_type, is_active
                FROM students
                WHERE is_active = TRUE
            """, conn)

            self.students['primary_domains'] = self.students['primary_domains'].apply(
                lambda x: ','.join(x) if isinstance(x, list) else (x if x else '')
            )
            self.students['specific_interests'] = self.students['specific_interests'].apply(
                lambda x: ','.join(x) if isinstance(x, list) else (x if x else '')
            )

            print(f"   ✓ Loaded {len(self.students)} students")
        except Exception as e:
            print(f"   ❌ Failed to load students: {e}")
            raise

        self.courses = pd.read_sql("""
            SELECT 
                course_id, trainer_id, title, description, domain, specific_topic, level,
                duration_hours, language, format, price, has_certificate,
                average_rating as rating, total_ratings as num_ratings, 
                total_enrolled as num_enrolled, total_completed as num_completed,
                created_at as created_date, is_active
            FROM courses
            WHERE is_active = TRUE AND is_published = TRUE
        """, conn)
        print(f"   ✓ Loaded {len(self.courses)} courses")

        self.interactions = pd.read_sql("""
            SELECT 
                interaction_id, student_id, course_id, interaction_type,
                time_spent_seconds, rating_value, device, referral_source,
                created_at as timestamp
            FROM interactions
            ORDER BY created_at DESC
        """, conn)
        print(f"   ✓ Loaded {len(self.interactions)} interactions")

        self.trainers = pd.read_sql("""
            SELECT 
                trainer_id, name, email, specializations, skills,
                experience_years, average_rating as rating, is_active
            FROM trainers
            WHERE is_active = TRUE
        """, conn)

        self.trainers['specializations'] = self.trainers['specializations'].apply(
            lambda x: ','.join(x) if isinstance(x, list) else (x if x else '')
        )
        self.trainers['skills'] = self.trainers['skills'].apply(
            lambda x: ','.join(x) if isinstance(x, list) else (x if x else '')
        )

        print(f"   ✓ Loaded {len(self.trainers)} trainers")

        try:
            self.searches = pd.read_sql("""
                SELECT 
                    search_id, student_id, query, clicked_course_id,
                    created_at as timestamp
                FROM search_logs
                ORDER BY created_at DESC
                LIMIT 10000
            """, conn)
            print(f"   ✓ Loaded {len(self.searches)} recent searches")
        except:
            print("   ⚠️  No search logs found")
            self.searches = pd.DataFrame()

        conn.close()
        elapsed = time.time() - start_time
        print(f"✅ Data loaded successfully! ({elapsed:.2f}s)")

    def build_models(self):
        """Build/train the recommendation models"""
        print("🧠 Building recommendation models...")
        start_time = time.time()

        self.rec_system = CourseRecommendationSystem()

        self.rec_system.students_df = self.students
        self.rec_system.courses_df = self.courses
        self.rec_system.interactions_df = self.interactions
        self.rec_system.trainers_df = self.trainers
        self.rec_system.searches_df = self.searches

        print("   • Preprocessing data...")
        preprocess_start = time.time()
        self.rec_system.preprocess_data()
        print(f"   ✓ Preprocessing done ({time.time() - preprocess_start:.2f}s)")

        print("   • Building content-based model...")
        content_start = time.time()
        self.rec_system.build_content_based_model()
        print(f"   ✓ Content model built ({time.time() - content_start:.2f}s)")

        print("   • Building collaborative filtering model...")
        collab_start = time.time()
        self.rec_system.build_collaborative_model()
        print(f"   ✓ Collaborative model built ({time.time() - collab_start:.2f}s)")

        elapsed = time.time() - start_time
        print(f"✅ Models built successfully! Total time: {elapsed:.2f}s")

    def get_recommendations(self, student_id, n_recommendations=10):
        """
        Get personalized recommendations for a student

        Strategy:
        - 0 interactions → cold-start (interest matching)
        - 1-5 interactions → content-based
        - 6+ interactions → hybrid (content + collaborative)
        """
        if self.rec_system is None:
            raise Exception("Model not initialized. Call build_models() first.")

        student_interactions = self.interactions[
            self.interactions['student_id'] == student_id
        ]
        interaction_count = len(student_interactions)

        print(f"   📊 Student {student_id} has {interaction_count} interactions")

        # COLD-START: No interactions
        if interaction_count == 0:
            print("   ❄️  COLD-START: Using interest matching")

            student = self.students[self.students['student_id'] == student_id]
            if student.empty:
                print(f"   ❌ Student {student_id} not found!")
                return pd.DataFrame()

            student_row = student.iloc[0]
            interests = student_row.get('specific_interests', '')
            level = student_row.get('experience_level', 'beginner')

            recs = self.rec_system.cold_start_recommendations(
                student_interests=interests,
                student_level=level,
                n_recommendations=n_recommendations
            )

        # FEW INTERACTIONS: Content-based
        elif interaction_count < 6:
            print("   🌱 FEW INTERACTIONS: Using content-based")
            try:
                recs = self.rec_system.content_based_recommendations(
                    student_id,
                    n_recommendations=n_recommendations
                )
            except:
                recs = self.rec_system.hybrid_recommendations(
                    student_id,
                    n_recommendations=n_recommendations,
                    include_search=True
                )

        # MANY INTERACTIONS: Full hybrid
        else:
            print(f"   🌿 {interaction_count} INTERACTIONS: Using hybrid")
            recs = self.rec_system.hybrid_recommendations(
                student_id,
                n_recommendations=n_recommendations,
                include_search=True
            )

        # Add reason/explanation
        if not recs.empty:
            recs['reason'] = recs.apply(
                lambda row: self._generate_reason(student_id, row, interaction_count),
                axis=1
            )

        return recs

    def get_cold_start_recommendations(self, interests, level, n_recommendations=10):
        """Cold-start recommendations for new users"""
        if self.rec_system is None:
            raise Exception("Model not initialized.")

        return self.rec_system.cold_start_recommendations(
            student_interests=interests,
            student_level=level,
            n_recommendations=n_recommendations
        )

    def _generate_reason(self, student_id, course_row, interaction_count):
        """Generate reason for recommendation"""
        reasons = []

        if interaction_count == 0:
            student = self.students[self.students['student_id'] == student_id]
            if not student.empty:
                interests = student.iloc[0]['specific_interests']
                if interests and any(i.strip().lower() in str(course_row.get('title', '')).lower()
                                   for i in str(interests).split(',')):
                    reasons.append("Matches your interests")

        student = self.students[self.students['student_id'] == student_id]
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
        if self.rec_system is None:
            raise Exception("Model not initialized.")

        try:
            explanation_text = self.rec_system.explain_recommendation(student_id, course_id)

            if not explanation_text or explanation_text == "Student or course not found":
                return None

            course = self.courses[self.courses['course_id'] == course_id]
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
        except Exception as e:
            course = self.courses[self.courses['course_id'] == course_id]
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
        conn = self.connect_db()
        cursor = conn.cursor()

        import uuid
        interaction_id = f"INT_{uuid.uuid4().hex[:10]}"

        try:
            cursor.execute("""
                INSERT INTO interactions (
                    interaction_id, student_id, course_id, interaction_type, created_at
                ) VALUES (%s, %s, %s, %s, %s)
            """, (interaction_id, student_id, course_id, interaction_type, timestamp))

            conn.commit()
            print(f"✓ Tracked: {student_id} {interaction_type} {course_id}")
        except Exception as e:
            conn.rollback()
            print(f"✗ Error: {e}")
        finally:
            conn.close()

    def get_trending_courses(self, domain=None, n=10):
        """Get trending courses"""
        if self.rec_system is None:
            raise Exception("Model not initialized.")

        if domain:
            trending = self.rec_system.popularity_based_recommendations(
                domain=domain,
                n_recommendations=n
            )
        else:
            trending = self.courses.sort_values(
                ['num_enrolled', 'rating'],
                ascending=[False, False]
            ).head(n)

        return trending