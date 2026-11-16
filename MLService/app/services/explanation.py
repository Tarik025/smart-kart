
import numpy as np

from sklearn.metrics.pairwise import cosine_similarity


def get_recommendation_reason(
    user_id,
    product_id,
    strategy,
    data,
    content_score=0.0,
    collaborative_score=0.0
):

    # Popularity fallback.
    if strategy == "popularity":
        return {
            "reasonCode": "POPULAR",
            "sourceProductId": None
        }

    # Category-based fallback.
    if strategy == "category":
        return {
            "reasonCode": "CATEGORY",
            "sourceProductId": None
        }

    matrix = data["user_item_matrix"]
    content = data["content"]
    collaborative = data["collaborative"]

    user_id = str(user_id)
    product_id = str(product_id)

    if user_id not in matrix.index:
        return {
            "reasonCode": "CONTENT",
            "sourceProductId": None
        }

    user_vector = matrix.loc[user_id].to_numpy(dtype=float)

    interacted_positions = np.flatnonzero(user_vector > 0)

    if len(interacted_positions) == 0:
        return {
            "reasonCode": "CONTENT",
            "sourceProductId": None
        }

    # Find the strongest content-based source product.
    content_source = None

    if product_id in content.product_id_to_index:

        candidate_index = content.product_id_to_index[product_id]

        source_indices = [
            content.product_id_to_index[
                str(matrix.columns[index])
            ]
            for index in interacted_positions
            if str(matrix.columns[index])
            in content.product_id_to_index
        ]

        source_weights = [
            user_vector[index]
            for index in interacted_positions
            if str(matrix.columns[index])
            in content.product_id_to_index
        ]

        if source_indices:

            similarities = cosine_similarity(
                content.product_vectors[candidate_index],
                content.product_vectors[source_indices]
            ).ravel()

            contributions = similarities * np.array(source_weights)

            best_position = int(np.argmax(contributions))

            content_source = str(
                content.products.iloc[
                    source_indices[best_position]
                ]["_id"]
            )

    
    # Find the strongest collaborative source product.
    collaborative_source = None

    if product_id in collaborative.product_id_to_index:

        candidate_index = collaborative.product_id_to_index[
            product_id
        ]

        contributions = (
            collaborative.item_similarity_matrix[candidate_index]
            * user_vector
        )

        if np.any(contributions > 0):

            best_index = int(np.argmax(contributions))

            collaborative_source = str(
                matrix.columns[best_index]
            )


    # Choose the component that contributed more.
    if (
        strategy == "hybrid"
        and collaborative_score >= content_score
        and collaborative_source is not None
    ):
        return {
            "reasonCode": "COLLAB",
            "sourceProductId": collaborative_source
        }

    if content_source is not None:
        return {
            "reasonCode": "CONTENT",
            "sourceProductId": content_source
        }

    if collaborative_source is not None:
        return {
            "reasonCode": "COLLAB",
            "sourceProductId": collaborative_source
        }

    return {
        "reasonCode": "POPULAR",
        "sourceProductId": None
    }
