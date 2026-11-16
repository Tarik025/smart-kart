
import math
import numpy as np
import pandas as pd

import app.services.hybrid_recommender as hybrid_module

from app.services.data_loader import load_recommendation_data
from app.services.interaction_matrix import build_user_item_matrix

from app.services.content_recommender import ContentRecommender
from app.services.collaborative_recommender import CollaborativeRecommender
from app.services.hybrid_recommender import HybridRecommender


# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

K_VALUES = [5, 10]
RANDOM_SEEDS = [42, 123, 456, 789, 2026]

DEFAULT_CONTENT_WEIGHT = 0.4

EVENT_WEIGHTS = {
    "VIEW": 1,
    "WISHLIST": 3,
    "ADD_TO_CART": 4,
    "PURCHASE": 5,
}

RELEVANT_EVENTS = [
    "WISHLIST",
    "ADD_TO_CART",
    "PURCHASE",
]

MIN_USER_EVENTS = 6


# --------------------------------------------------
# DATA LOADING
# --------------------------------------------------

def load_data():

    users_df, products_df, interactions_df = (
        load_recommendation_data()
    )

    if "source" not in interactions_df.columns:
        raise ValueError(
            "Interactions dataset has no 'source' column. "
            "Evaluation requires seeded interactions."
        )

    # Only seeded interactions are used.
    interactions_df = interactions_df[
        interactions_df["source"].astype(str).str.lower() == "seed"
    ].copy()

    interactions_df["userId"] = (
        interactions_df["userId"].astype(str)
    )

    interactions_df["productId"] = (
        interactions_df["productId"].astype(str)
    )

    interactions_df["timestamp"] = pd.to_datetime(
        interactions_df["timestamp"]
    )

    # Only users with at least six seeded interactions.
    event_counts = interactions_df["userId"].value_counts()

    eligible_users = event_counts[
        event_counts >= MIN_USER_EVENTS
    ].index

    interactions_df = interactions_df[
        interactions_df["userId"].isin(eligible_users)
    ].copy()

    interactions_df = interactions_df.reset_index(drop=True)

    users_df["_id"] = users_df["_id"].astype(str)
    products_df["_id"] = products_df["_id"].astype(str)

    users_df = users_df[
        users_df["_id"].isin(eligible_users)
    ].copy()

    print("\n========== DATASET ==========")
    print("Eligible users:", len(users_df))
    print("Products:", len(products_df))
    print("Seeded interactions:", len(interactions_df))

    return users_df, products_df, interactions_df


# --------------------------------------------------
# TEMPORAL TRAIN / VALIDATION / TEST SPLIT
# --------------------------------------------------

def create_splits(interactions_df, random_seed):

    rng = np.random.default_rng(random_seed)

    train_parts = []
    validation_parts = []
    test_parts = []

    for user_id, group in interactions_df.groupby("userId"):

        group = group.copy()

        # Random ordering only resolves equal timestamps.
        group["_tie"] = rng.random(len(group))

        group = group.sort_values(
            ["timestamp", "_tie"]
        ).drop(columns="_tie")

        total = len(group)

        test_size = max(2, math.ceil(total * 0.20))

        remaining_size = total - test_size

        validation_size = max(
            1,
            math.ceil(remaining_size * 0.20)
        )

        train_size = remaining_size - validation_size

        if train_size < 1:
            continue

        train_parts.append(group.iloc[:train_size])

        validation_parts.append(
            group.iloc[train_size:remaining_size]
        )

        test_parts.append(group.iloc[remaining_size:])

    train_df = pd.concat(train_parts).reset_index(drop=True)
    validation_df = pd.concat(validation_parts).reset_index(drop=True)
    test_df = pd.concat(test_parts).reset_index(drop=True)

    return train_df, validation_df, test_df


# --------------------------------------------------
# USER AND PRODUCT HELPERS
# --------------------------------------------------

def get_user(users_df, user_id):

    rows = users_df[
        users_df["_id"].astype(str) == str(user_id)
    ]

    if rows.empty:
        return None

    return rows.iloc[0]


def get_cart_ids(user):

    if user is None:
        return set()

    cart = user.get("cart", [])

    if not isinstance(cart, list):
        return set()

    result = set()

    for item in cart:

        product_id = (
            item.get("_id") or item.get("productId")
            if isinstance(item, dict)
            else item
        )

        if product_id:
            result.add(str(product_id))

    return result


def get_purchased_ids(user_id, training_df):

    rows = training_df[
        (
            training_df["userId"].astype(str) == str(user_id)
        )
        & (
            training_df["eventType"] == "PURCHASE"
        )
    ]

    return set(rows["productId"].astype(str))


def get_training_product_ids(user_id, training_df):

    rows = training_df[
        training_df["userId"].astype(str) == str(user_id)
    ]

    return set(rows["productId"].astype(str))


def get_excluded_ids(user_id, user, training_df):

    return (
        get_purchased_ids(user_id, training_df)
        | get_cart_ids(user)
    )


# --------------------------------------------------
# GROUND TRUTH
# --------------------------------------------------

def build_relevant_items(
    heldout_df,
    users_df,
    training_df
):

    relevant_by_user = {}

    for user_id, group in heldout_df.groupby("userId"):

        user_id = str(user_id)

        user = get_user(users_df, user_id)

        if user is None:
            continue

        # VIEW-only events are not relevant.
        relevant = set(
            group.loc[
                group["eventType"].isin(RELEVANT_EVENTS),
                "productId"
            ].astype(str)
        )

        # Candidates cannot include training products.
        relevant -= get_training_product_ids(
            user_id,
            training_df
        )

        # Exclude purchased and cart products.
        relevant -= get_excluded_ids(
            user_id,
            user,
            training_df
        )

        if relevant:
            relevant_by_user[user_id] = relevant

    return relevant_by_user


# --------------------------------------------------
# POPULARITY MODEL
# --------------------------------------------------

def get_popularity_scores(training_df, product_ids):

    scores = {
        str(product_id): 0.0
        for product_id in product_ids
    }

    counts = training_df.groupby(
        ["productId", "eventType"]
    ).size()

    for (product_id, event_type), count in counts.items():

        weight = EVENT_WEIGHTS.get(event_type, 0)

        if str(product_id) in scores:
            scores[str(product_id)] += count * weight

    return scores


# --------------------------------------------------
# RANKING
# --------------------------------------------------

def rank_recommendations(
    result_df,
    allowed_ids,
    top_n,
    rng
):

    if result_df is None or result_df.empty:
        return []

    result_df = result_df.copy()

    result_df["productId"] = (
        result_df["productId"].astype(str)
    )

    result_df = result_df[
        result_df["productId"].isin(allowed_ids)
    ].copy()

    if result_df.empty:
        return []

    result_df["_tie"] = rng.random(len(result_df))

    result_df = result_df.sort_values(
        ["score", "_tie"],
        ascending=[False, True]
    )

    return (
        result_df["productId"]
        .head(top_n)
        .tolist()
    )


def get_popular_recommendations(
    training_df,
    candidate_ids,
    top_n,
    rng
):

    scores = get_popularity_scores(
        training_df,
        candidate_ids
    )

    result_df = pd.DataFrame({
        "productId": list(scores.keys()),
        "score": list(scores.values()),
    })

    return rank_recommendations(
        result_df,
        set(candidate_ids),
        top_n,
        rng
    )


# --------------------------------------------------
# BUILD RECOMMENDERS
# --------------------------------------------------

def build_models(
    users_df,
    products_df,
    training_df,
    content_weight=DEFAULT_CONTENT_WEIGHT
):

    matrix = build_user_item_matrix(training_df)

    # Tune the existing HybridRecommender weights
    # without changing its implementation.
    hybrid_module.CONTENT_WEIGHT = content_weight
    hybrid_module.COLLABORATIVE_WEIGHT = (
        1.0 - content_weight
    )

    return {
        "matrix": matrix,
        "content": ContentRecommender(products_df),
        "collaborative": CollaborativeRecommender(matrix),
        "hybrid": HybridRecommender(
            users_df=users_df,
            products_df=products_df,
            interactions_df=training_df,
            user_item_matrix=matrix,
        ),
    }


# --------------------------------------------------
# GENERATE MODEL RECOMMENDATIONS
# --------------------------------------------------

def generate_recommendations(
    models,
    users_df,
    products_df,
    training_df,
    rng,
    top_n=10
):

    recommendations = {
        "Popularity": {},
        "Content-Based": {},
        "Collaborative": {},
        "Hybrid": {},
    }

    product_ids = set(
        products_df["_id"].astype(str)
    )

    for user_id in training_df["userId"].astype(str).unique():

        user = get_user(users_df, user_id)

        if user is None:
            continue

        training_ids = get_training_product_ids(
            user_id,
            training_df
        )

        excluded_ids = get_excluded_ids(
            user_id,
            user,
            training_df
        )

        candidate_ids = (
            product_ids - training_ids - excluded_ids
        )

        if not candidate_ids:
            continue

        # Popularity.
        recommendations["Popularity"][user_id] = (
            get_popular_recommendations(
                training_df,
                candidate_ids,
                top_n,
                rng,
            )
        )

        cart = list(get_cart_ids(user))

        # Content-based.
        content_result = (
            models["content"].get_personalised_recommendations(
                user_id=user_id,
                user_item_matrix=models["matrix"],
                users_df=users_df,
                interactions_df=training_df,
                top_n=len(products_df),
                exclude_product_ids=cart,
            )
        )

        recommendations["Content-Based"][user_id] = (
            rank_recommendations(
                content_result,
                candidate_ids,
                top_n,
                rng,
            )
        )

        # Collaborative.
        collaborative_result = (
            models["collaborative"].get_personalised_recommendations(
                user_id=user_id,
                interactions_df=training_df,
                top_n=len(products_df),
                exclude_product_ids=cart,
            )
        )

        recommendations["Collaborative"][user_id] = (
            rank_recommendations(
                collaborative_result,
                candidate_ids,
                top_n,
                rng,
            )
        )

        # Hybrid.
        hybrid_result = models["hybrid"].get_recommendations(
            user_id=user_id,
            top_n=len(products_df),
        )

        recommendations["Hybrid"][user_id] = (
            rank_recommendations(
                hybrid_result,
                candidate_ids,
                top_n,
                rng,
            )
        )

    return recommendations


# --------------------------------------------------
# METRICS
# --------------------------------------------------

def calculate_metrics(
    recommendations,
    relevant_by_user,
    catalog_size,
    k
):

    precisions = []
    recalls = []
    hit_rates = []
    ndcgs = []

    recommended_catalog = set()

    for user_id, relevant in relevant_by_user.items():

        ranked = recommendations.get(user_id, [])[:k]

        hits = [
            1 if product_id in relevant else 0
            for product_id in ranked
        ]

        hit_count = sum(hits)

        precisions.append(hit_count / k)

        recalls.append(
            hit_count / len(relevant)
        )

        hit_rates.append(
            1.0 if hit_count > 0 else 0.0
        )

        dcg = sum(
            hit / math.log2(position + 2)
            for position, hit in enumerate(hits)
        )

        ideal_hits = min(len(relevant), k)

        idcg = sum(
            1.0 / math.log2(position + 2)
            for position in range(ideal_hits)
        )

        ndcgs.append(
            dcg / idcg if idcg > 0 else 0.0
        )

        recommended_catalog.update(ranked)

    evaluated_users = len(relevant_by_user)

    if evaluated_users == 0:
        return {
            "evaluated_users": 0,
            "precision": 0.0,
            "recall": 0.0,
            "hit_rate": 0.0,
            "ndcg": 0.0,
            "catalog_coverage": 0.0,
        }

    return {
        "evaluated_users": evaluated_users,
        "precision": float(np.mean(precisions)),
        "recall": float(np.mean(recalls)),
        "hit_rate": float(np.mean(hit_rates)),
        "ndcg": float(np.mean(ndcgs)),
        "catalog_coverage": (
            len(recommended_catalog) / catalog_size
            if catalog_size else 0.0
        ),
    }


# --------------------------------------------------
# HYBRID WEIGHT TUNING
# --------------------------------------------------

def tune_hybrid_weight(
    users_df,
    products_df,
    train_df,
    validation_df
):

    validation_relevant = build_relevant_items(
        validation_df,
        users_df,
        train_df,
    )

    if not validation_relevant:
        print(
            "\nNo relevant validation interactions. "
            "Using default hybrid weight 0.4."
        )
        return DEFAULT_CONTENT_WEIGHT

    best_weight = DEFAULT_CONTENT_WEIGHT
    best_ndcg = -1.0

    print("\n========== HYBRID WEIGHT TUNING ==========")

    for weight_step in range(11):

        content_weight = weight_step / 10

        models = build_models(
            users_df,
            products_df,
            train_df,
            content_weight,
        )

        recommendations = generate_recommendations(
            models,
            users_df,
            products_df,
            train_df,
            np.random.default_rng(42),
            top_n=10,
        )

        metrics = calculate_metrics(
            recommendations["Hybrid"],
            validation_relevant,
            len(products_df),
            10,
        )

        ndcg = metrics["ndcg"]

        print(
            f"Content={content_weight:.1f} | "
            f"Collaborative={1-content_weight:.1f} | "
            f"Validation NDCG@10={ndcg:.4f}"
        )

        if (
            ndcg > best_ndcg
            or (
                ndcg == best_ndcg
                and abs(content_weight - DEFAULT_CONTENT_WEIGHT)
                < abs(best_weight - DEFAULT_CONTENT_WEIGHT)
            )
        ):
            best_ndcg = ndcg
            best_weight = content_weight

    print("\nSelected content weight:", best_weight)
    print("Selected collaborative weight:", 1 - best_weight)

    return best_weight


# --------------------------------------------------
# MAIN EVALUATION
# --------------------------------------------------

def main():

    users_df, products_df, interactions_df = load_data()

    if interactions_df.empty:
        raise ValueError("No eligible seeded interactions found.")

    all_results = []

    print("\n========== FIVE-RUN TEST EVALUATION ==========")

    for seed in RANDOM_SEEDS:

        print(f"\nRunning evaluation with seed {seed}...")

        # Each run gets its own temporal train/validation/test split.
        train_df, validation_df, test_df = create_splits(
            interactions_df,
            random_seed=seed,
        )

        # Tune weights using training and validation ONLY.
        best_content_weight = tune_hybrid_weight(
            users_df,
            products_df,
            train_df,
            validation_df,
        )

        # Test data is not used for training or tuning.
        final_training_df = pd.concat(
            [train_df, validation_df],
            ignore_index=True,
        )

        test_relevant = build_relevant_items(
            test_df,
            users_df,
            final_training_df,
        )

        if not test_relevant:
            print("No relevant test users for this run.")
            continue

        models = build_models(
            users_df,
            products_df,
            final_training_df,
            best_content_weight,
        )

        recommendations = generate_recommendations(
            models,
            users_df,
            products_df,
            final_training_df,
            np.random.default_rng(seed),
            top_n=10,
        )

        for model_name, model_recommendations in recommendations.items():

            for k in K_VALUES:

                metrics = calculate_metrics(
                    model_recommendations,
                    test_relevant,
                    len(products_df),
                    k,
                )

                all_results.append({
                    "seed": seed,
                    "content_weight": best_content_weight,
                    "model": model_name,
                    "k": k,
                    **metrics,
                })

    if not all_results:
        raise ValueError("No evaluation results were generated.")

    results_df = pd.DataFrame(all_results)

    metric_columns = [
        "precision",
        "recall",
        "hit_rate",
        "ndcg",
        "catalog_coverage",
    ]

    summary = (
        results_df
        .groupby(["model", "k"])[metric_columns]
        .agg(["mean", "std"])
        .fillna(0)
        .reset_index()
    )

    print("\n========== FINAL EVALUATION RESULTS ==========")

    print(
        summary.to_string(
            index=False,
            float_format=lambda value: f"{value:.4f}",
        )
    )

    results_df.to_csv("evaluation_per_run.csv", index=False)
    summary.to_csv("evaluation_summary.csv", index=False)

    print("\nEvaluation results saved.")
    print("NOTE: Results are based on synthetic seeded data.")


if __name__ == "__main__":
    main()
