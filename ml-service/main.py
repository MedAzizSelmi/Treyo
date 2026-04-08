"""
ML RECOMMENDATION SERVICE - FastAPI
====================================
Microservice for course recommendations
Integrates with Spring Boot backend
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import pandas as pd
from datetime import datetime
import os
from sklearn.metrics.pairwise import cosine_similarity

# Import your recommendation system
from recommendation_engine import RecommendationEngine

# ============================================
# FASTAPI APP INITIALIZATION
# ============================================

app = FastAPI(
    title="ML Recommendation Service",
    description="AI-powered course recommendations microservice",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# GLOBAL ML MODEL
# ============================================

rec_engine = None

@app.on_event("startup")
async def startup_event():
    """Load ML model when service starts"""
    global rec_engine

    print("🚀 Starting ML Recommendation Service...")
    print("📊 Loading recommendation model...")

    try:
        rec_engine = RecommendationEngine()
        rec_engine.load_data()
        rec_engine.build_models()

        print("✅ ML model loaded and ready!")
        print(f"   - Students: {len(rec_engine.students)}")
        print(f"   - Courses: {len(rec_engine.courses)}")
        print(f"   - Interactions: {len(rec_engine.interactions)}")

    except Exception as e:
        print(f"❌ Failed to load ML model: {e}")
        raise

# ============================================
# REQUEST/RESPONSE MODELS
# ============================================

class RecommendationItem(BaseModel):
    course_id: str
    title: str
    domain: str
    specific_topic: Optional[str] = None
    level: str
    rating: float
    score: float
    reason: Optional[str] = None

class RecommendationResponse(BaseModel):
    student_id: str
    recommendations: List[RecommendationItem]
    total_recommended: int
    generated_at: str

class ColdStartRequest(BaseModel):
    student_interests: str = Field(..., example="Python, Machine Learning, Data Science")
    student_level: str = Field(default="beginner", example="beginner")
    n_recommendations: int = Field(default=10, ge=1, le=50)

class TrackInteractionRequest(BaseModel):
    student_id: str
    course_id: str
    interaction_type: str = Field(..., example="viewed")

# ============================================
# MAIN ENDPOINTS
# ============================================

@app.get("/")
async def root():
    """Service health check"""
    return {
        "service": "ML Recommendation Service",
        "status": "running",
        "model_loaded": rec_engine is not None
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    if rec_engine is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    return {
        "status": "healthy",
        "model_loaded": True,
        "students_count": len(rec_engine.students),
        "courses_count": len(rec_engine.courses),
        "interactions_count": len(rec_engine.interactions)
    }

@app.get("/recommendations/{student_id}", response_model=RecommendationResponse, tags=["Recommendations"])
async def get_recommendations(
    student_id: str,
    n: int = Query(default=10, ge=1, le=50, description="Number of recommendations")
):
    """
    Get personalized recommendations for a student
    """
    if rec_engine is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Get recommendations
        recs_df = rec_engine.get_recommendations(student_id, n_recommendations=n)

        if recs_df.empty:
            return RecommendationResponse(
                student_id=student_id,
                recommendations=[],
                total_recommended=0,
                generated_at=datetime.now().isoformat()
            )

        # Convert to response format
        recommendations = []
        for _, row in recs_df.iterrows():
            recommendations.append(RecommendationItem(
                course_id=row['course_id'],
                title=row['title'],
                domain=row['domain'],
                specific_topic=row.get('specific_topic'),
                level=row['level'],
                rating=float(row['rating']),
                score=float(row['final_score']),
                reason=row.get('reason', 'Recommended based on your profile and activity')
            ))

        return RecommendationResponse(
            student_id=student_id,
            recommendations=recommendations,
            total_recommended=len(recommendations),
            generated_at=datetime.now().isoformat()
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating recommendations: {str(e)}")

@app.post("/recommendations/cold-start", response_model=RecommendationResponse, tags=["Recommendations"])
async def cold_start_recommendations(request: ColdStartRequest):
    """
    Get recommendations for new students (cold-start)
    """
    if rec_engine is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        recs_df = rec_engine.get_cold_start_recommendations(
            interests=request.student_interests,
            level=request.student_level,
            n_recommendations=request.n_recommendations
        )

        if recs_df.empty:
            return RecommendationResponse(
                student_id="cold_start",
                recommendations=[],
                total_recommended=0,
                generated_at=datetime.now().isoformat()
            )

        recommendations = []
        for _, row in recs_df.iterrows():
            recommendations.append(RecommendationItem(
                course_id=row['course_id'],
                title=row['title'],
                domain=row['domain'],
                specific_topic=row.get('specific_topic'),
                level=row['level'],
                rating=float(row['rating']),
                score=float(row['final_score']),
                reason="Matches your stated interests"
            ))

        return RecommendationResponse(
            student_id="cold_start",
            recommendations=recommendations,
            total_recommended=len(recommendations),
            generated_at=datetime.now().isoformat()
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/interactions/track", tags=["Interactions"])
async def track_interaction(request: TrackInteractionRequest):
    """Track student-course interaction"""
    if rec_engine is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        rec_engine.track_interaction(
            student_id=request.student_id,
            course_id=request.course_id,
            interaction_type=request.interaction_type,
            timestamp=datetime.now()
        )

        return {"status": "success", "message": "Interaction tracked"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.get("/courses/trending", tags=["Courses"])
async def get_trending_courses(
    domain: Optional[str] = None,
    n: int = Query(default=10, ge=1, le=50)
):
    """Get trending/popular courses"""
    if rec_engine is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        trending_df = rec_engine.get_trending_courses(domain=domain, n=n)

        courses = []
        for _, row in trending_df.iterrows():
            courses.append({
                "course_id": row['course_id'],
                "title": row['title'],
                "domain": row['domain'],
                "specific_topic": row.get('specific_topic'),
                "level": row['level'],
                "rating": float(row['rating']),
                "popularity": int(row.get('popularity', 0))
            })

        return {"courses": courses, "total": len(courses)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.get("/recommendations/explain", tags=["Recommendations"])
async def explain_recommendation(
    student_id: str = Query(..., description="Student ID"),
    course_id: str = Query(..., description="Course ID")
):
    """Explain why a course was recommended"""
    if rec_engine is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        explanation = rec_engine.explain_recommendation(student_id, course_id)

        if explanation is None:
            raise HTTPException(status_code=404, detail="Student or course not found")

        return explanation

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/model/retrain", tags=["Model"])
async def retrain_model():
    """Retrain the recommendation model"""
    global rec_engine

    try:
        print("🔄 Retraining model...")
        rec_engine = RecommendationEngine()
        rec_engine.load_data()
        rec_engine.build_models()
        print("✅ Model retrained successfully!")

        return {
            "status": "success",
            "message": "Model retrained successfully",
            "students": len(rec_engine.students),
            "courses": len(rec_engine.courses),
            "interactions": len(rec_engine.interactions)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Retrain failed: {str(e)}")

# ============================================
# DEBUG ENDPOINTS
# ============================================

@app.get("/debug/student/{student_id}", tags=["Debug"])
async def debug_student_data(student_id: str):
    """
    Debug endpoint to see what data the model has for a student
    """
    if rec_engine is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Get student data
    student = rec_engine.students[rec_engine.students['student_id'] == student_id]

    if student.empty:
        raise HTTPException(status_code=404, detail=f"Student {student_id} not found")

    student_row = student.iloc[0]

    # Get student's interactions
    interactions = rec_engine.interactions[rec_engine.interactions['student_id'] == student_id]

    # Parse domains
    domains_str = student_row.get('primary_domains', '')
    if isinstance(domains_str, str):
        domain_list = [d.strip() for d in domains_str.split(',') if d.strip()]
    else:
        domain_list = []

    # Find courses in student's domains
    courses_in_domain = rec_engine.courses[
        rec_engine.courses['domain'].isin(domain_list)
    ] if domain_list else pd.DataFrame()

    # Get all unique domains in database
    all_domains = rec_engine.courses['domain'].unique().tolist()

    # Get student's interest text
    interest_text = student_row.get('specific_interests', '')

    # Transform to TF-IDF and get top matching courses
    top_tfidf_courses = []
    if rec_engine.rec_system and rec_engine.rec_system.tfidf_vectorizer:
        try:
            interest_vector = rec_engine.rec_system.tfidf_vectorizer.transform([interest_text])
            course_scores = cosine_similarity(
                interest_vector,
                rec_engine.rec_system.course_content_matrix
            )[0]

            # Get top 5 by TF-IDF
            top_indices = course_scores.argsort()[-5:][::-1]

            for idx in top_indices:
                course = rec_engine.courses.iloc[idx]
                top_tfidf_courses.append({
                    'course_id': course['course_id'],
                    'title': course['title'],
                    'domain': course['domain'],
                    'tfidf_score': float(course_scores[idx])
                })
        except Exception as e:
            top_tfidf_courses = [{"error": str(e)}]

    return {
        "student_id": student_id,
        "student_data": {
            "name": student_row.get('name'),
            "primary_domains": domains_str,
            "specific_interests": interest_text,
            "experience_level": student_row.get('experience_level'),
            "interest_text_length": len(str(interest_text))
        },
        "parsed_domains": domain_list,
        "interaction_count": len(interactions),
        "interaction_breakdown": interactions['interaction_type'].value_counts().to_dict() if not interactions.empty else {},
        "database_info": {
            "total_courses": len(rec_engine.courses),
            "all_domains_in_db": all_domains,
            "courses_in_student_domains": len(courses_in_domain),
            "domains_with_no_courses": [d for d in domain_list if d not in all_domains]
        },
        "top_tfidf_matches": top_tfidf_courses,
        "sample_courses_in_domain": courses_in_domain.head(3)[['course_id', 'title', 'domain']].to_dict('records') if not courses_in_domain.empty else []
    }


@app.get("/debug/domains", tags=["Debug"])
async def debug_all_domains():
    """
    See all domains in database and their course counts
    """
    if rec_engine is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    domain_counts = rec_engine.courses['domain'].value_counts().to_dict()

    return {
        "total_courses": len(rec_engine.courses),
        "total_domains": len(domain_counts),
        "domains": domain_counts
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)