
import numpy as np
import pandas as pd

from app.services.content_recommender import ContentRecommender
from app.services.collaborative_recommender import CollaborativeRecommender


CONTENT_WEIGHT = 0.4
COLLABORATIVE_WEIGHT = 0.6

EVENT_WEIGHTS = {
    "VIEW": 1,
    "WISHLIST": 3,
    "ADD_TO_CART": 4,
    "PURCHASE": 5
}


class HybridRecommender:

    def __init__(
        self,
        users_df,
        products_df,
        interactions_df,
        user_item_matrix
    ):

        self.users = users_df.copy()
        self.products = products_df.copy()
        self.interactions = interactions_df.copy()
        self.user_item_matrix = user_item_matrix.copy()

        self.product_ids = (
            self.products["_id"].astype(str).tolist()
        )

        # Initialise both existing recommendation algorithms.
        self.content_recommender = ContentRecommender(
            self.products
        )

        self.collaborative_recommender = (
            CollaborativeRecommender(
                self.user_item_matrix
            )
        )

    @staticmethod
    def _normalise_scores(score_map, candidate_ids):
        """
        Apply min-max normalisation over the candidate list.
        """

        scores = np.array(
            [
                float(score_map.get(product_id, 0.0))
                for product_id in candidate_ids
            ],
            dtype=float
        )

        if len(scores) == 0:
            return {}

        min_score = scores.min()
        max_score = scores.max()

        # Avoid division by zero.
        if max_score == min_score:
            normalised = np.zeros_like(scores)
        else:
            normalised = (
                (scores - min_score)
                / (max_score - min_score)
            )

        return dict(zip(candidate_ids, normalised))

    def _get_excluded_products(self, user_id, cart):
        """
        Exclude purchased products and products in the cart.
        """

        purchased_ids = set(
            self.interactions.loc[
                (
                    self.interactions["userId"].astype(str)
                    == user_id
                )
                & (
                    self.interactions["eventType"]
                    == "PURCHASE"
                ),
                "productId"
            ].astype(str)
        )

        cart_ids = set(
            str(product_id) for product_id in cart
        )

        return purchased_ids.union(cart_ids)

    def _get_popular_recommendations(
        self,
        candidate_ids,
        top_n,
        preferred_categories=None
    ):
        """
        Popularity fallback using weighted interaction counts.
        """

        popularity = {
            product_id: 0.0
            for product_id in candidate_ids
        }

        for event_type, weight in EVENT_WEIGHTS.items():

            event_data = self.interactions[
                self.interactions["eventType"] == event_type
            ]

            counts = event_data["productId"].astype(str).value_counts()

            for product_id, count in counts.items():

                if product_id in popularity:
                    popularity[product_id] += count * weight

        candidates = self.products[
            self.products["_id"].astype(str).isin(candidate_ids)
        ].copy()

        if preferred_categories:
            category_candidates = candidates[
                candidates["category"].isin(preferred_categories)
            ]

            # Use category popularity when matching products exist.
            if not category_candidates.empty:
                candidates = category_candidates

        candidates["popularityScore"] = (
            candidates["_id"]
            .astype(str)
            .map(popularity)
            .fillna(0.0)
        )

        candidates = candidates.sort_values(
            by=["popularityScore", "_id"],
            ascending=[False, True]
        )

        return pd.DataFrame({
            "productId": candidates["_id"].astype(str).head(top_n),
            "score": candidates["popularityScore"].head(top_n).values,
            "strategy": "popularity"
        }).reset_index(drop=True)

    def get_recommendations(
        self,
        user_id,
        top_n=10
    ):
        """
        Generate recommendations using the hybrid strategy.

        Active users:
            Content + Collaborative Filtering.

        Cold-start users with preferences:
            Content-Based Filtering.

        Cold-start users without preferences:
            Popularity fallback.
        """

        user_id = str(user_id)

        # Find the user.
        user_rows = self.users[
            self.users["_id"].astype(str) == user_id
        ]

        if user_rows.empty:
            return pd.DataFrame(
                columns=["productId", "score", "strategy"]
            )

        user = user_rows.iloc[0]

        cart = user.get("cart", [])

        if not isinstance(cart, list):
            cart = []

        excluded_ids = self._get_excluded_products(
            user_id,
            cart
        )

        # Build candidate list.
        candidate_ids = [
            product_id
            for product_id in self.product_ids
            if product_id not in excluded_ids
        ]

        if not candidate_ids:
            return pd.DataFrame(
                columns=["productId", "score", "strategy"]
            )

        # Check whether the user has interaction history.
        has_history = (
            user_id in self.user_item_matrix.index
            and (
                self.user_item_matrix.loc[user_id] > 0
            ).any()
        )

        # ------------------------------------------------
        # CASE 1: ACTIVE USER - HYBRID RECOMMENDATIONS
        # ------------------------------------------------

        if has_history:

            content_results = (
                self.content_recommender
                .get_personalised_recommendations(
                    user_id=user_id,
                    user_item_matrix=self.user_item_matrix,
                    users_df=self.users,
                    interactions_df=self.interactions,
                    top_n=len(self.products),
                    exclude_product_ids=cart
                )
            )

            collaborative_results = (
                self.collaborative_recommender
                .get_personalised_recommendations(
                    user_id=user_id,
                    interactions_df=self.interactions,
                    top_n=len(self.product_ids),
                    exclude_product_ids=cart
                )
            )

            content_scores = dict(
                zip(
                    content_results["productId"].astype(str),
                    content_results["score"].astype(float)
                )
            )

            collaborative_scores = dict(
                zip(
                    collaborative_results["productId"].astype(str),
                    collaborative_results["score"].astype(float)
                )
            )

            # Normalise both algorithms independently.
            normalised_content = self._normalise_scores(
                content_scores,
                candidate_ids
            )

            normalised_collaborative = self._normalise_scores(
                collaborative_scores,
                candidate_ids
            )

            # Calculate final hybrid scores.
            recommendations = []

            for product_id in candidate_ids:

                content_score = normalised_content[product_id]

                collaborative_score = (
                    normalised_collaborative[product_id]
                )

                hybrid_score = (
                    CONTENT_WEIGHT * content_score
                    + COLLABORATIVE_WEIGHT * collaborative_score
                )

                recommendations.append({
                    "productId": product_id,
                    "score": hybrid_score,
                    "contentScore": content_score,
                    "collaborativeScore": collaborative_score,
                    "strategy": "hybrid"
                })

            results = pd.DataFrame(recommendations)

            return (
                results
                .sort_values("score", ascending=False)
                .head(top_n)
                .reset_index(drop=True)
            )

        # ------------------------------------------------
# CASE 2: COLD-START USER WITH PREFERENCES
# ------------------------------------------------

        preferences = user.get("preferences", {})

        if not isinstance(preferences, dict):
            preferences = {}

        preferred_categories = preferences.get(
            "categories",
            []
        )

        if preferred_categories:

            return self._get_popular_recommendations(
                candidate_ids,
                top_n,
                preferred_categories
            )

        # ------------------------------------------------
        # CASE 3: COLD-START USER WITHOUT PREFERENCES
        # ------------------------------------------------

        return self._get_popular_recommendations(
            candidate_ids,
            top_n
        )
