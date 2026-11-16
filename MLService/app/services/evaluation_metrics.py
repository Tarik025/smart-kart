
import math


def precision_at_k(recommended, relevant, k=10):
    recommended = recommended[:k]

    if k <= 0:
        return 0.0

    hits = len(set(recommended) & set(relevant))

    return hits / k


def recall_at_k(recommended, relevant, k=10):
    if not relevant:
        return 0.0

    recommended = recommended[:k]
    hits = len(set(recommended) & set(relevant))

    return hits / len(relevant)


def hit_rate_at_k(recommended, relevant, k=10):
    recommended = recommended[:k]

    return float(bool(set(recommended) & set(relevant)))


def ndcg_at_k(recommended, relevant, k=10):
    recommended = recommended[:k]

    dcg = 0.0

    for rank, product_id in enumerate(recommended, start=1):
        if product_id in relevant:
            dcg += 1 / math.log2(rank + 1)

    ideal_hits = min(len(relevant), k)

    if ideal_hits == 0:
        return 0.0

    ideal_dcg = sum(
        1 / math.log2(rank + 1)
        for rank in range(1, ideal_hits + 1)
    )

    return dcg / ideal_dcg


def evaluate_recommendations(
    recommendations_by_user,
    relevant_by_user,
    catalog_size,
    k=10
):
    """
    Calculate ranking metrics across users.

    Recommendations and relevant items are dictionaries:
        user_id -> list/set of product IDs
    """

    precision_scores = []
    recall_scores = []
    hit_rate_scores = []
    ndcg_scores = []

    all_recommended_products = set()

    evaluated_users = 0

    for user_id, relevant in relevant_by_user.items():

        if not relevant:
            continue

        recommended = recommendations_by_user.get(
            user_id,
            []
        )

        precision_scores.append(
            precision_at_k(recommended, relevant, k)
        )

        recall_scores.append(
            recall_at_k(recommended, relevant, k)
        )

        hit_rate_scores.append(
            hit_rate_at_k(recommended, relevant, k)
        )

        ndcg_scores.append(
            ndcg_at_k(recommended, relevant, k)
        )

        all_recommended_products.update(recommended[:k])

        evaluated_users += 1

    coverage = (
        len(all_recommended_products) / catalog_size
        if catalog_size > 0
        else 0.0
    )

    if evaluated_users == 0:
        return {
            "evaluated_users": 0,
            "precision": 0.0,
            "recall": 0.0,
            "hit_rate": 0.0,
            "ndcg": 0.0,
            "catalog_coverage": coverage
        }

    return {
        "evaluated_users": evaluated_users,
        "precision": sum(precision_scores) / evaluated_users,
        "recall": sum(recall_scores) / evaluated_users,
        "hit_rate": sum(hit_rate_scores) / evaluated_users,
        "ndcg": sum(ndcg_scores) / evaluated_users,
        "catalog_coverage": coverage
    }
