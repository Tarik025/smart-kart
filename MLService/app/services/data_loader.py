
import pandas as pd

from app.database import (
    users_collection,
    products_collection,
    interactions_collection
)


def load_recommendation_data():
    """
    Fetch users, products and interactions from MongoDB
    and convert them into Pandas DataFrames.
    """

    users = list(
        users_collection.find(
            {},
            {
                "name": 1,
                "preferences": 1,
                "isDemo": 1,
                "cart": 1
            }
        )
    )

    products = list(
        products_collection.find(
            {},
            {
                "name": 1,
                "category": 1,
                "brand": 1,
                "description": 1,
                "tags": 1,
                "price": 1,
                "isSynthetic": 1
            }
        )
    )

    interactions = list(
        interactions_collection.find(
            {},
            {
                "userId": 1,
                "productId": 1,
                "eventType": 1,
                "timestamp": 1,
                "source": 1
            }
        )
    )

    users_df = pd.DataFrame(users)
    products_df = pd.DataFrame(products)
    interactions_df = pd.DataFrame(interactions)

    # Convert MongoDB ObjectIds into strings.
    if not users_df.empty:
        users_df["_id"] = users_df["_id"].astype(str)
        users_df["cart"] = users_df["cart"].apply(
            lambda items: [str(item) for item in items]
            if isinstance(items, list)
            else []
        )

    if not products_df.empty:
        products_df["_id"] = products_df["_id"].astype(str)

    if not interactions_df.empty:
        interactions_df["_id"] = interactions_df["_id"].astype(str)
        interactions_df["userId"] = interactions_df["userId"].astype(str)
        interactions_df["productId"] = interactions_df["productId"].astype(str)

        interactions_df["timestamp"] = pd.to_datetime(
            interactions_df["timestamp"],
            utc=True
        )

    return users_df, products_df, interactions_df
