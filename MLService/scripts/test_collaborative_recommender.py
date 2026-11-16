
from app.services.data_loader import load_recommendation_data
from app.services.interaction_matrix import build_user_item_matrix
from app.services.collaborative_recommender import CollaborativeRecommender


# Load data.
users_df, products_df, interactions_df = load_recommendation_data()
print("\n========== SEEDED USER NAMES ==========")
print(users_df["name"].tolist())

print("\n========== USER COLUMNS ==========")
print(users_df.columns.tolist())

# Build user-item matrix.
user_item_matrix = build_user_item_matrix(interactions_df)

# Initialise collaborative recommender.
recommender = CollaborativeRecommender(user_item_matrix)


def display_recommendations(title, recommendations):

    print(f"\n========== {title} ==========")

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
            ["name", "category", "brand", "score"]
        ].to_string(index=False)
    )


# Test 1: Customer A.
customer_a = users_df[
    users_df["name"] == "Customer A - Gamer"
].iloc[0]

recommendations_a = recommender.get_personalised_recommendations(
    user_id=customer_a["_id"],
    interactions_df=interactions_df,
    top_n=10,
    exclude_product_ids=customer_a["cart"]
)

display_recommendations(
    "CUSTOMER A - COLLABORATIVE RECOMMENDATIONS",
    recommendations_a
)


# Test 2: Customer B.
customer_b = users_df[
    users_df["name"] == "Customer B - Photographer"
].iloc[0]

recommendations_b = recommender.get_personalised_recommendations(
    user_id=customer_b["_id"],
    interactions_df=interactions_df,
    top_n=10,
    exclude_product_ids=customer_b["cart"]
)

display_recommendations(
    "CUSTOMER B - COLLABORATIVE RECOMMENDATIONS",
    recommendations_b
)


# Test 3: Cold-start user.
cold_user_a = users_df[
    users_df["name"] == "Cold Start User A"
].iloc[0]

recommendations_cold = recommender.get_personalised_recommendations(
    user_id=cold_user_a["_id"],
    interactions_df=interactions_df,
    top_n=10,
    exclude_product_ids=cold_user_a["cart"]
)

display_recommendations(
    "COLD START USER A - COLLABORATIVE RECOMMENDATIONS",
    recommendations_cold
)


print("\nCollaborative filtering tests completed!")
