
import numpy as np
import pandas as pd

from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class ContentRecommender:
    def __init__(self, products_df: pd.DataFrame):
        self.products = products_df.copy()

        if self.products.empty:
            raise ValueError("Product dataset cannot be empty.")

        # Create a product ID to matrix-position mapping.
        self.product_ids = self.products["_id"].astype(str).tolist()

        self.product_id_to_index = {
            product_id: index
            for index, product_id in enumerate(self.product_ids)
        }

        # Prepare product text for TF-IDF.
        self.products["content"] = self.products.apply(
            self._build_product_content,
            axis=1
        )

        # Convert product text into numerical vectors.
        self.vectorizer = TfidfVectorizer(
            stop_words="english"
        )

        self.product_vectors = self.vectorizer.fit_transform(
            self.products["content"]
        )

        # Calculate product-to-product similarity.
        self.similarity_matrix = cosine_similarity(
            self.product_vectors
        )

    @staticmethod
    def _build_product_content(product):
        """
        Build weighted text representation of a product.

        Category: repeated twice
        Tags: repeated twice
        Other fields: included once
        """

        name = str(product.get("name") or "")
        category = str(product.get("category") or "")
        brand = str(product.get("brand") or "")
        description = str(product.get("description") or "")

        tags = product.get("tags", [])

        if not isinstance(tags, list):
            tags = []

        tags_text = " ".join(str(tag) for tag in tags)

        content = " ".join([
            name,
            category,
            category,
            brand,
            tags_text,
            tags_text,
            description
        ])

        return content

    def get_similar_products(
        self,
        product_id: str,
        top_n: int = 8
    ) -> pd.DataFrame:
        """
        Find products similar to a given product.
        """

        product_id = str(product_id)

        if product_id not in self.product_id_to_index:
            return pd.DataFrame()

        product_index = self.product_id_to_index[product_id]

        scores = self.similarity_matrix[product_index]

        results = pd.DataFrame({
            "productId": self.product_ids,
            "score": scores
        })

        # Exclude the original product.
        results = results[
            results["productId"] != product_id
        ]

        results = results.sort_values(
            by="score",
            ascending=False
        )

        results = results.head(top_n)

        return results.reset_index(drop=True)

    def get_personalised_recommendations(
        self,
        user_id: str,
        user_item_matrix: pd.DataFrame,
        users_df: pd.DataFrame,
        interactions_df: pd.DataFrame,
        top_n: int = 10,
        exclude_product_ids=None
    ) -> pd.DataFrame:
        """
        Generate personalised content-based recommendations.

        Active users:
            Build a profile from weighted historical interactions.

        Cold-start users:
            Build a profile from preferred product categories.
        """

        user_id = str(user_id)

        # Map the interaction matrix columns to product positions.
        matrix_product_ids = [
            str(product_id)
            for product_id in user_item_matrix.columns
        ]

        # Find this user's interaction history.
        if user_id in user_item_matrix.index:
            user_scores = user_item_matrix.loc[user_id]

            interacted_ids = []
            interaction_weights = []

            for product_id, score in user_scores.items():
                product_id = str(product_id)

                if (
                    score > 0
                    and product_id in self.product_id_to_index
                ):
                    interacted_ids.append(product_id)
                    interaction_weights.append(float(score))

            if interacted_ids:
                indices = [
                    self.product_id_to_index[product_id]
                    for product_id in interacted_ids
                ]

                weights = np.asarray(
                    interaction_weights,
                    dtype=float
                )

                weighted_vectors = self.product_vectors[indices].multiply(
                    weights.reshape(-1, 1)
                )

                user_profile = csr_matrix(
                    weighted_vectors.sum(axis=0) / weights.sum()
                )

            else:
                user_profile = None

        else:
            user_profile = None

        # Cold-start handling using category preferences.
        if user_profile is None:
            user_rows = users_df[
                users_df["_id"].astype(str) == user_id
            ]

            if user_rows.empty:
                return pd.DataFrame()

            preferences = (
                user_rows.iloc[0]
                .get("preferences", {})
            )

            preferred_categories = (
                preferences.get("categories", [])
                if isinstance(preferences, dict)
                else []
            )

            if not preferred_categories:
                return pd.DataFrame()

            preferred_indices = self.products.index[
                self.products["category"].isin(
                    preferred_categories
                )
            ].tolist()

            if not preferred_indices:
                return pd.DataFrame()

            user_profile = csr_matrix(
                self.product_vectors[preferred_indices].mean(axis=0)
            )

        # Calculate similarity between the user profile
        # and every product.
        scores = cosine_similarity(
            user_profile,
            self.product_vectors
        ).ravel()

        results = pd.DataFrame({
            "productId": self.product_ids,
            "score": scores
        })

        # Exclude products already purchased.
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
            set(str(item) for item in (exclude_product_ids or []))
        )

        results = results[
            ~results["productId"].isin(excluded_ids)
        ]

        results = results.sort_values(
            by="score",
            ascending=False
        )

        return results.head(top_n).reset_index(drop=True)
