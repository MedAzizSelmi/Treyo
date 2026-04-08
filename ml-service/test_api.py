"""
TEST SCRIPT - Verify FastAPI ML Service
========================================
Run this to test all endpoints
"""

import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8000"


def print_section(title):
    """Print section header"""
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)


def test_health():
    """Test health endpoint"""
    print_section("1. HEALTH CHECK")

    response = requests.get(f"{BASE_URL}/health")
    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"✅ Service is healthy!")
        print(f"   Model loaded: {data['model_loaded']}")
        print(f"   Students: {data['stats']['students_count']}")
        print(f"   Courses: {data['stats']['courses_count']}")
        print(f"   Interactions: {data['stats']['interactions_count']}")
        return True
    else:
        print(f"❌ Health check failed!")
        return False


def test_recommendations():
    """Test personalized recommendations"""
    print_section("2. PERSONALIZED RECOMMENDATIONS")

    student_id = "STU_00001"
    response = requests.get(f"{BASE_URL}/recommendations/{student_id}?n=5")

    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"✅ Got {data['total_recommended']} recommendations for {student_id}")
        print(f"\nTop 3 Recommendations:")
        for i, rec in enumerate(data['recommendations'][:3], 1):
            print(f"\n{i}. {rec['title']}")
            print(f"   Domain: {rec['domain']} | Level: {rec['level']}")
            print(f"   Score: {rec['score']:.3f} | Rating: {rec['rating']}/5.0")
            print(f"   Reason: {rec['reason']}")
        return True
    else:
        print(f"❌ Failed to get recommendations")
        print(f"   Error: {response.text}")
        return False


def test_cold_start():
    """Test cold-start recommendations"""
    print_section("3. COLD-START RECOMMENDATIONS")

    payload = {
        "interests": "Python, Machine Learning, Data Science",
        "level": "beginner",
        "n_recommendations": 5
    }

    response = requests.post(
        f"{BASE_URL}/recommendations/cold-start",
        json=payload
    )

    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"✅ Got {data['total_recommended']} cold-start recommendations")
        print(f"\nRecommendations for new student interested in: {payload['interests']}")
        for i, rec in enumerate(data['recommendations'][:3], 1):
            print(f"\n{i}. {rec['title']}")
            print(f"   Domain: {rec['domain']} | Level: {rec['level']}")
            print(f"   Score: {rec['score']:.3f}")
        return True
    else:
        print(f"❌ Failed to get cold-start recommendations")
        print(f"   Error: {response.text}")
        return False


def test_track_interaction():
    """Test interaction tracking"""
    print_section("4. TRACK INTERACTION")

    payload = {
        "student_id": "STU_00001",
        "course_id": "CRS_00042",
        "interaction_type": "viewed"
    }

    response = requests.post(
        f"{BASE_URL}/interactions/track",
        json=payload
    )

    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"✅ Interaction tracked successfully!")
        print(f"   Student: {data['student_id']}")
        print(f"   Course: {data['course_id']}")
        print(f"   Type: {data['type']}")
        return True
    else:
        print(f"❌ Failed to track interaction")
        print(f"   Error: {response.text}")
        return False


def test_trending():
    """Test trending courses"""
    print_section("5. TRENDING COURSES")

    response = requests.get(f"{BASE_URL}/courses/trending?domain=informatique&n=5")

    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"✅ Got {data['total']} trending courses in '{data['domain']}'")
        print(f"\nTop 3 Trending:")
        for i, course in enumerate(data['courses'][:3], 1):
            print(f"\n{i}. {course['title']}")
            print(f"   Enrolled: {course.get('num_enrolled', 0)} | Rating: {course.get('rating', 0)}/5.0")
        return True
    else:
        print(f"❌ Failed to get trending courses")
        print(f"   Error: {response.text}")
        return False


def test_explain():
    """Test explanation endpoint"""
    print_section("6. EXPLAIN RECOMMENDATION")

    response = requests.get(
        f"{BASE_URL}/recommendations/explain?student_id=STU_00001&course_id=CRS_00042"
    )

    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"✅ Explanation generated!")
        print(f"\nWhy '{data['course_title']}' was recommended:")
        print(f"   {data['explanation']}")
        print(f"   Confidence: {data['confidence_score']:.2f}")
        print(f"\n   Factors:")
        for factor in data['factors']:
            print(f"   • {factor}")
        return True
    else:
        print(f"❌ Failed to get explanation")
        print(f"   Error: {response.text}")
        return False


def run_all_tests():
    """Run all tests"""
    print("\n" + "🧪 " * 30)
    print("TESTING ML RECOMMENDATION SERVICE")
    print("🧪 " * 30)

    results = {
        "Health Check": test_health(),
        "Personalized Recommendations": test_recommendations(),
        "Cold-Start Recommendations": test_cold_start(),
        "Track Interaction": test_track_interaction(),
        "Trending Courses": test_trending(),
        "Explain Recommendation": test_explain()
    }

    # Summary
    print_section("TEST SUMMARY")
    passed = sum(results.values())
    total = len(results)

    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")

    print(f"\n{'=' * 60}")
    print(f"TOTAL: {passed}/{total} tests passed")
    print(f"{'=' * 60}")

    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Service is working perfectly!")
        print("✅ Ready to integrate with Spring Boot!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Check the errors above.")

    return passed == total


if __name__ == "__main__":
    try:
        success = run_all_tests()
        exit(0 if success else 1)
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Cannot connect to ML service!")
        print("   Make sure the service is running on http://localhost:8000")
        print("   Run: python main.py")
        exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        exit(1)