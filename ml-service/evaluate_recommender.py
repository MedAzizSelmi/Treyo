"""
OFFLINE EVALUATION OF THE RECOMMENDATION ENGINE
================================================
Leave-one-out protocol, run against the live PostgreSQL data.

Protocol
--------
1. Interactions are split into "positive" (a deliberate commitment:
   enrolled / completed / rated / saved) and "weak" (viewed,
   clicked_interested). Only positives are used as ground truth — a
   view is not evidence the learner wanted the course.
2. For every eligible learner (>= 2 positives), the single most recent
   positive interaction is held out as the test item; everything else
   stays in the training set.
3. The model is rebuilt on the training interactions ONLY, so the
   held-out item cannot leak into either the collaborative matrix or
   the popularity signal.
4. For each learner we request top-K recommendations and check whether
   the held-out course appears.

Metrics
-------
  HitRate@K   fraction of learners whose held-out course is in top-K
  Precision@K hits / K, averaged over learners
  Recall@K    hits / 1 (one held-out item), so equals HitRate here —
              reported for completeness since the protocol is 1-item
  MRR@K       mean reciprocal rank of the held-out item
  Latency     wall-clock per recommendation call

Usage
-----
    .venv/Scripts/python.exe evaluate_recommender.py [--sample N] [--k 5,10]
"""

import argparse
import os
import sys
import time
from statistics import mean, median

import pandas as pd
from dotenv import load_dotenv

from recommendation_engine import RecommendationEngine
from course_recommendation_system import CourseRecommendationSystem

load_dotenv()

# Interaction types that count as a genuine positive signal.
POSITIVE_TYPES = {"enrolled", "completed", "rated", "saved"}


def build_model(frames):
    rs = CourseRecommendationSystem()
    rs.students_df = frames["students"]
    rs.courses_df = frames["courses"]
    rs.interactions_df = frames["interactions"]
    rs.trainers_df = frames["trainers"]
    rs.searches_df = frames["searches"]
    rs.preprocess_data()
    rs.build_content_based_model()
    rs.build_collaborative_model()
    return rs


def recommend(rs, student_id, k):
    """Mirror the production strategy selection in RecommendationEngine."""
    try:
        return rs.hybrid_recommendations(student_id, n_recommendations=k, include_search=True)
    except Exception:
        try:
            return rs.content_based_recommendations(student_id, n_recommendations=k)
        except Exception:
            return pd.DataFrame()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=300,
                    help="number of learners to evaluate (0 = all eligible)")
    ap.add_argument("--k", type=str, default="5,10", help="comma-separated K values")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    k_values = [int(x) for x in args.k.split(",")]
    max_k = max(k_values)

    print("Loading data from PostgreSQL...")
    engine = RecommendationEngine()
    frames = engine._fetch_data_frames()

    interactions = frames["interactions"].copy()
    if interactions.empty:
        print("No interactions — cannot evaluate.")
        return

    # Restrict ground truth to courses the model can actually return.
    valid_courses = set(frames["courses"]["course_id"])
    interactions = interactions[interactions["course_id"].isin(valid_courses)]

    positives = interactions[interactions["interaction_type"].isin(POSITIVE_TYPES)]
    print(f"  {len(interactions)} interactions on recommendable courses")
    print(f"  {len(positives)} positive interactions "
          f"({', '.join(sorted(POSITIVE_TYPES))})")

    # Eligible = at least 2 positives, so holding one out still leaves history.
    counts = positives.groupby("student_id").size()
    eligible = counts[counts >= 2].index.tolist()
    print(f"  {len(eligible)} learners with >= 2 positives (eligible)")
    if not eligible:
        print("Not enough history to evaluate.")
        return

    if args.sample and args.sample < len(eligible):
        import random
        random.Random(args.seed).shuffle(eligible)
        eligible = eligible[: args.sample]
    print(f"  evaluating {len(eligible)} learners\n")

    # ---- Hold out each learner's most recent positive ----
    positives_sorted = positives.sort_values("timestamp")
    held_out = (positives_sorted.groupby("student_id").tail(1)
                .set_index("student_id")["course_id"].to_dict())
    held_out = {s: c for s, c in held_out.items() if s in set(eligible)}

    test_pairs = set(
        (s, c) for s, c in held_out.items()
    )
    mask = interactions.apply(
        lambda r: (r["student_id"], r["course_id"]) in test_pairs, axis=1
    )
    train_interactions = interactions[~mask]
    print(f"Training set: {len(train_interactions)} interactions "
          f"({mask.sum()} held out)\n")

    train_frames = dict(frames)
    train_frames["interactions"] = train_interactions

    print("Building model on training split...")
    t0 = time.time()
    rs = build_model(train_frames)
    build_secs = time.time() - t0
    print(f"  built in {build_secs:.2f}s\n")

    # ---- Evaluate ----
    hits = {k: 0 for k in k_values}
    recip_ranks = {k: [] for k in k_values}
    latencies = []
    evaluated = 0
    empty_results = 0

    for i, student_id in enumerate(eligible, 1):
        truth = held_out.get(student_id)
        if truth is None:
            continue

        t0 = time.time()
        recs = recommend(rs, student_id, max_k)
        latencies.append((time.time() - t0) * 1000.0)

        if recs is None or len(recs) == 0:
            empty_results += 1
            evaluated += 1
            for k in k_values:
                recip_ranks[k].append(0.0)
            continue

        ranked = list(recs["course_id"])
        evaluated += 1
        for k in k_values:
            topk = ranked[:k]
            if truth in topk:
                hits[k] += 1
                recip_ranks[k].append(1.0 / (topk.index(truth) + 1))
            else:
                recip_ranks[k].append(0.0)

        if i % 50 == 0:
            print(f"  ...{i}/{len(eligible)}")

    # ---- Report ----
    print("\n" + "=" * 62)
    print("  RECOMMENDATION ENGINE — OFFLINE EVALUATION RESULTS")
    print("=" * 62)
    print(f"Protocol            : leave-one-out (most recent positive held out)")
    print(f"Catalogue size      : {len(frames['courses'])} recommendable courses")
    print(f"Learners evaluated  : {evaluated}")
    print(f"Empty result sets   : {empty_results}")
    print(f"Model build time    : {build_secs:.2f} s")
    print("-" * 62)
    print(f"{'Metric':<18}" + "".join(f"{'@'+str(k):>12}" for k in k_values))
    print("-" * 62)

    def row(label, fn):
        print(f"{label:<18}" + "".join(f"{fn(k):>12.4f}" for k in k_values))

    row("HitRate", lambda k: hits[k] / evaluated if evaluated else 0.0)
    row("Precision", lambda k: (hits[k] / k) / evaluated if evaluated else 0.0)
    row("Recall", lambda k: hits[k] / evaluated if evaluated else 0.0)
    row("MRR", lambda k: mean(recip_ranks[k]) if recip_ranks[k] else 0.0)
    print("-" * 62)
    if latencies:
        print(f"Latency mean        : {mean(latencies):.1f} ms")
        print(f"Latency median      : {median(latencies):.1f} ms")
        print(f"Latency p95         : {sorted(latencies)[int(len(latencies)*0.95)-1]:.1f} ms")
    print("=" * 62)
    print("\nRandom baseline for reference:")
    for k in k_values:
        print(f"  HitRate@{k} of a uniform random ranker "
              f"= {k}/{len(frames['courses'])} = {k/len(frames['courses']):.4f}")


if __name__ == "__main__":
    main()
