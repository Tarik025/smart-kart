
from app.services.data_loader import load_recommendation_data
from app.services.interaction_matrix import build_user_item_matrix
from app.services.hybrid_recommender import HybridRecommender


# Load all data.
users_df, products_df, interactions_df = load_recommendation_data()

# Build user-item matrix.
user_item_matrix = build_user_item_matrix(interactions_df)

# Initialise hybrid recommender.
recommender = HybridRecommender(
    users_df=users_df,
    products_df=products_df,
    interactions_df=interactions_df,
    user_item_matrix=user_item_matrix
)


def test_user(user_name):

    user_rows = users_df[
        users_df["name"] == user_name
    ]

    if user_rows.empty:
        print(f"User not found: {user_name}")
        return

    user = user_rows.iloc[0]

    recommendations = recommender.get_recommendations(
        user_id=user["_id"],
        top_n=10
    )

    print(f"\n========== {user_name} ==========")

    if recommendations.empty:
        print("No recommendations returned.")
        return

    output = recommendations.merge(
        products_df[["_id", "name", "category", "brand"]],
        left_on="productId",
        right_on="_id",
        how="left"
    )

    print(
        output[
            ["name", "category", "brand", "score", "strategy"]
        ].to_string(index=False)
    )


# Active users.
test_user("Customer A - Gamer")
test_user("Customer B - Photographer")

# Cold-start users.
test_user("Cold Start User A")
test_user("Cold Start User B")


print("\nHybrid recommendation tests completed!")
