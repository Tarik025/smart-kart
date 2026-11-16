
import numpy as np
import pandas as pd

from sklearn.metrics.pairwise import cosine_similarity


class CollaborativeRecommender:

    def __init__(self, user_item_matrix: pd.DataFrame):

        if user_item_matrix.empty:
            raise ValueError("User-item matrix cannot be empty.")

        self.user_item_matrix = user_item_matrix.copy()

        # Preserve the exact product order from the matrix.
        self.product_ids = [
            str(product_id)
            for product_id in self.user_item_matrix.columns
        ]

        self.product_id_to_index = {
            product_id: index
            for index, product_id in enumerate(self.product_ids)
        }

        # Transpose:
        # Original: users x products
        # Transposed: products x users
        item_user_matrix = self.user_item_matrix.T

        # Calculate item-to-item cosine similarity.
        self.item_similarity_matrix = cosine_similarity(
            item_user_matrix
        )

    def get_personalised_recommendations(
        self,
        user_id: str,
        interactions_df: pd.DataFrame,
        top_n: int = 10,
        exclude_product_ids=None
    ) -> pd.DataFrame:

        user_id = str(user_id)

        # Cold-start users have no interaction history.
        if user_id not in self.user_item_matrix.index:
            return pd.DataFrame(columns=["productId", "score"])

        # Get this user's interaction strengths.
        user_vector = self.user_item_matrix.loc[user_id].to_numpy(
            dtype=float
        )

        if np.count_nonzero(user_vector) == 0:
            return pd.DataFrame(columns=["productId", "score"])

        # Multiply user preferences by item similarity.
        scores = user_vector @ self.item_similarity_matrix

        results = pd.DataFrame({
            "productId": self.product_ids,
            "score": scores
        })

        # Exclude purchased products.
        purchased_ids = set(
            interactions_df.loc[
                (
                    interactions_df["userId"].astype(str) == user_id
                )
                & (
                    interactions_df["eventType"] == "PURCHASE"
                ),
                "productId"
            ].astype(str)
        )

        # Exclude products already in the user's cart.
        excluded_ids = purchased_ids.union(
            set(
                str(item)
                for item in (exclude_product_ids or [])
            )
        )

        results = results[
            ~results["productId"].isin(excluded_ids)
        ]

        results = results.sort_values(
            by="score",
            ascending=False
        )

        return results.head(top_n).reset_index(drop=True)
