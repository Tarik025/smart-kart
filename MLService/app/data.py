
import time

from app.config import CACHE_TTL_SECONDS
from app.services.data_loader import load_recommendation_data
from app.services.interaction_matrix import build_user_item_matrix
from app.services.hybrid_recommender import HybridRecommender


_cache = None
_last_loaded_at = 0


def get_recommendation_data(force_refresh=False):

    global _cache, _last_loaded_at

    current_time = time.monotonic()

    cache_expired = (
        current_time - _last_loaded_at >= CACHE_TTL_SECONDS
    )

    if _cache is None or force_refresh or cache_expired:

        print("Loading recommendation data from MongoDB...")

        users_df, products_df, interactions_df = (
            load_recommendation_data()
        )

        if products_df.empty:
            raise ValueError("No products available in MongoDB.")

        user_item_matrix = build_user_item_matrix(
            interactions_df
        )

        hybrid_recommender = HybridRecommender(
            users_df=users_df,
            products_df=products_df,
            interactions_df=interactions_df,
            user_item_matrix=user_item_matrix
        )

        _cache = {
            "users": users_df,
            "products": products_df,
            "interactions": interactions_df,
            "user_item_matrix": user_item_matrix,
            "hybrid": hybrid_recommender,
            "content": hybrid_recommender.content_recommender,
            "collaborative": hybrid_recommender.collaborative_recommender
        }

        _last_loaded_at = current_time

        print("Recommendation data loaded successfully.")

    return _cache


def get_data_stats():

    data = get_recommendation_data()

    return {
        "users": len(data["users"]),
        "products": len(data["products"]),
        "interactions": len(data["interactions"]),
        "matrixRows": data["user_item_matrix"].shape[0],
        "matrixColumns": data["user_item_matrix"].shape[1]
    }
