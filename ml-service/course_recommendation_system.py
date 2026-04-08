"""
COURSE RECOMMENDATION SYSTEM - FIXED
=====================================
Fixed cold_start_recommendations to prioritize interest matching over ratings
"""

import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import MinMaxScaler, LabelEncoder
from scipy.sparse import csr_matrix
import warnings
warnings.filterwarnings('ignore')

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
        self.course_content_matrix = None
        self.user_item_matrix = None
        self.course_similarity_matrix = None

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

        # 1. Create course content features
        self.courses_df['content_text'] = (
            self.courses_df['title'].fillna('') + ' ' +
            self.courses_df['description'].fillna('') + ' ' +
            self.courses_df['domain'].fillna('') + ' ' +
            self.courses_df['specific_topic'].fillna('') + ' ' +
            self.courses_df['level'].fillna('')
        )

        # 2. Normalize ratings
        self.courses_df['rating_normalized'] = self.scaler.fit_transform(
            self.courses_df[['rating']]
        )

        # 3. Calculate course popularity
        course_interactions = self.interactions_df.groupby('course_id').size().reset_index(name='popularity')
        self.courses_df = self.courses_df.merge(course_interactions, on='course_id', how='left')
        self.courses_df['popularity'] = self.courses_df['popularity'].fillna(0)
        self.courses_df['popularity_normalized'] = self.scaler.fit_transform(
            self.courses_df[['popularity']]
        )

        # 4. Encode difficulty level
        self.courses_df['level_encoded'] = self.label_encoder.fit_transform(
            self.courses_df['level']
        )

        # 5. Create student interest profiles
        self.students_df['interest_text'] = (
            self.students_df['primary_domains'].fillna('') + ' ' +
            self.students_df['specific_interests'].fillna('')
        )

        print("   ✓ Features engineered")
        return self

    def build_content_based_model(self):
        """Build content-based filtering using TF-IDF"""
        print("\n🧠 Building Content-Based Model...")

        # Create TF-IDF matrix for courses
        self.course_content_matrix = self.tfidf_vectorizer.fit_transform(
            self.courses_df['content_text']
        )

        # Calculate course similarity matrix
        self.course_similarity_matrix = cosine_similarity(
            self.course_content_matrix,
            self.course_content_matrix
        )

        print(f"   ✓ Content matrix shape: {self.course_content_matrix.shape}")
        print(f"   ✓ Similarity matrix shape: {self.course_similarity_matrix.shape}")

        return self

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

        # Create pivot table (user-item matrix)
        self.user_item_matrix = user_item_df.pivot_table(
            index='student_id',
            columns='course_id',
            values='weight',
            fill_value=0
        )

        print(f"   ✓ User-Item matrix shape: {self.user_item_matrix.shape}")
        print(f"   ✓ Sparsity: {(1 - (self.user_item_matrix > 0).sum().sum() / (self.user_item_matrix.shape[0] * self.user_item_matrix.shape[1])) * 100:.2f}%")

        return self

    def content_based_recommendations(self, student_id, n_recommendations=10):
        """
        Generate recommendations based on student interests and course content
        """
        # Get student data
        student = self.students_df[self.students_df['student_id'] == student_id]

        if student.empty:
            print(f"⚠️  Student {student_id} not found")
            return pd.DataFrame()

        student_interests = student.iloc[0]['interest_text']

        # Transform student interests to TF-IDF space
        student_vector = self.tfidf_vectorizer.transform([student_interests])

        # Calculate similarity with all courses
        course_scores = cosine_similarity(student_vector, self.course_content_matrix)[0]

        # Get student's experience level
        student_level = student.iloc[0]['experience_level']

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

        # Combined score
        scores_df['final_score'] = (
            scores_df['content_score'] * 0.5 * level_boost +
            scores_df['rating_score'] * 0.3 +
            scores_df['popularity_score'] * 0.2
        )

        # Sort and get top recommendations
        top_courses = scores_df.nlargest(n_recommendations, 'final_score')

        # Merge with course details
        recommendations = self.courses_df.merge(
            top_courses[['course_id', 'final_score']],
            on='course_id'
        )

        return recommendations[['course_id', 'title', 'domain', 'specific_topic',
                               'level', 'rating', 'final_score']].sort_values(
                                   'final_score', ascending=False
                               )

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
        Generate recommendations based on popularity and ratings
        """
        courses = self.courses_df.copy()

        # Filter by domain if specified
        if domain:
            courses = courses[courses['domain'] == domain]

        # Calculate popularity score
        courses['popularity_rating_score'] = (
            courses['popularity_normalized'] * 0.4 +
            courses['rating_normalized'] * 0.6
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

        # Transform to TF-IDF space
        search_vector = self.tfidf_vectorizer.transform([search_text])

        # Calculate similarity with courses
        course_scores = cosine_similarity(search_vector, self.course_content_matrix)[0]

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
        MAIN RECOMMENDATION FUNCTION
        Combines all methods for best results
        """
        print(f"\n🎯 Generating Hybrid Recommendations for {student_id}...")

        all_recommendations = []

        # 1. Content-Based (40% weight)
        try:
            content_recs = self.content_based_recommendations(student_id, n_recommendations * 2)
            if not content_recs.empty:
                content_recs['source'] = 'content'
                content_recs['weight'] = 0.4
                all_recommendations.append(content_recs)
                print(f"   ✓ Content-based: {len(content_recs)} courses")
        except Exception as e:
            print(f"   ⚠️  Content-based failed: {e}")

        # 2. Collaborative (30% weight)
        try:
            collab_recs = self.collaborative_recommendations(student_id, n_recommendations * 2)
            if not collab_recs.empty:
                collab_recs['source'] = 'collaborative'
                collab_recs['weight'] = 0.3
                # Rename score column
                if 'collab_score' in collab_recs.columns:
                    collab_recs.rename(columns={'collab_score': 'final_score'}, inplace=True)
                all_recommendations.append(collab_recs)
                print(f"   ✓ Collaborative: {len(collab_recs)} courses")
        except Exception as e:
            print(f"   ⚠️  Collaborative failed: {e}")

        # 3. Search-Based (20% weight) - if available
        if include_search and self.searches_df is not None:
            try:
                search_recs = self.search_based_recommendations(student_id, n_recommendations)
                if not search_recs.empty:
                    search_recs['source'] = 'search'
                    search_recs['weight'] = 0.2
                    # Rename score column
                    if 'search_score' in search_recs.columns:
                        search_recs.rename(columns={'search_score': 'final_score'}, inplace=True)
                    all_recommendations.append(search_recs)
                    print(f"   ✓ Search-based: {len(search_recs)} courses")
            except Exception as e:
                print(f"   ⚠️  Search-based failed: {e}")

        # 4. Popularity (10% weight) - fallback
        try:
            # Get student's primary domain
            student = self.students_df[self.students_df['student_id'] == student_id]
            if not student.empty:
                domains = student.iloc[0]['primary_domains'].split(',')[0]
                pop_recs = self.popularity_based_recommendations(domains, n_recommendations)
                pop_recs['source'] = 'popularity'
                pop_recs['weight'] = 0.1
                pop_recs['final_score'] = pop_recs['rating'] / 5.0  # Normalize to 0-1
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

        # Sort by final score
        aggregated = aggregated.sort_values('final_score', ascending=False)

        # Get top N
        final_recommendations = aggregated.head(n_recommendations)

        print(f"\n✅ Final recommendations: {len(final_recommendations)} courses")

        return final_recommendations

    def cold_start_recommendations(self, student_interests, student_level='beginner',
                                   n_recommendations=10):
        """
        Handle new students with no interaction history
        Based purely on stated interests

        FIXED: Prioritize interest matching over ratings!
        """
        print(f"\n❄️  Cold-start recommendations for new student...")

        # Transform interests to TF-IDF space
        interest_vector = self.tfidf_vectorizer.transform([student_interests])

        # Calculate similarity with courses
        course_scores = cosine_similarity(interest_vector, self.course_content_matrix)[0]

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

        # FIXED: Prioritize interest matching (70%) over ratings (20%) and popularity (10%)
        scores_df['final_score'] = (
            scores_df['content_score'] * 0.7 * level_boost +  # Interest matching 70%!
            scores_df['rating_score'] * 0.2 +                 # Rating 20%
            scores_df['popularity_score'] * 0.1               # Popularity 10%
        )

        # Get top recommendations
        top_courses = scores_df.nlargest(n_recommendations, 'final_score')

        recommendations = self.courses_df.merge(
            top_courses[['course_id', 'final_score']],
            on='course_id'
        )

        print(f"   ✓ Generated {len(recommendations)} cold-start recommendations")

        return recommendations[['course_id', 'title', 'domain', 'specific_topic',
                               'level', 'rating', 'final_score']].sort_values(
                                   'final_score', ascending=False
                               )

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