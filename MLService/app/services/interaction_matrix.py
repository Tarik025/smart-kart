
import numpy as np
import pandas as pd


EVENT_WEIGHTS = {
    "VIEW": 1,
    "WISHLIST": 3,
    "ADD_TO_CART": 4,
    "PURCHASE": 5
}


def build_user_item_matrix(interactions_df: pd.DataFrame):
    """
    Build a user-item matrix using weighted interactions.

    Rows    = Users
    Columns = Products
    Values  = Interaction strengths
    """

    if interactions_df.empty:
        return pd.DataFrame()

    # Count each event for every user-product pair.
    event_counts = (
        interactions_df
        .groupby(["userId", "productId", "eventType"])
        .size()
        .unstack(fill_value=0)
    )

    # Ensure all event types exist, even if some have zero counts.
    for event_type in EVENT_WEIGHTS:
        if event_type not in event_counts.columns:
            event_counts[event_type] = 0

    # Repeated views receive logarithmic weighting.
    view_score = np.log1p(event_counts["VIEW"])

    # Other interactions use their configured weights.
    other_score = (
        event_counts["WISHLIST"] * EVENT_WEIGHTS["WISHLIST"]
        + event_counts["ADD_TO_CART"] * EVENT_WEIGHTS["ADD_TO_CART"]
        + event_counts["PURCHASE"] * EVENT_WEIGHTS["PURCHASE"]
    )

    # Calculate final user-product preference strength.
    event_counts["strength"] = (
        view_score + other_score
    ).clip(upper=5)

    # Convert grouped data into a user-item matrix.
    user_item_matrix = event_counts["strength"].unstack(
        level="productId",
        fill_value=0
    )

    return user_item_matrix
