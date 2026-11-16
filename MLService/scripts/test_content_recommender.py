
from app.services.data_loader import load_recommendation_data
from app.services.interaction_matrix import build_user_item_matrix
from app.services.content_recommender import ContentRecommender


# Load MongoDB data.
users_df, products_df, interactions_df = load_recommendation_data()
print("\n========== SEEDED USER NAMES ==========")


print("\n========== USER COLUMNS ==========")
   

# Build interaction matrix.
user_item_matrix = build_user_item_matrix(interactions_df)

# Initialise recommender.
recommender = ContentRecommender(products_df)


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


# Test 1: Active user.
customer_a = users_df[
    users_df["name"] == "Customer A - Gamer"
].iloc[0]

recommendations_a = recommender.get_personalised_recommendations(
    user_id=customer_a["_id"],
    user_item_matrix=user_item_matrix,
    users_df=users_df,
    interactions_df=interactions_df,
    top_n=10,
    exclude_product_ids=customer_a["cart"]
)

display_recommendations(
    "CUSTOMER A RECOMMENDATIONS",
    recommendations_a
)


# Test 2: Cold-start user with category preferences.
cold_user_a = users_df[
    users_df["name"] == "Cold Start User A"
].iloc[0]

recommendations_cold_a = recommender.get_personalised_recommendations(
    user_id=cold_user_a["_id"],
    user_item_matrix=user_item_matrix,
    users_df=users_df,
    interactions_df=interactions_df,
    top_n=10,
    exclude_product_ids=cold_user_a["cart"]
)

display_recommendations(
    "COLD START USER A RECOMMENDATIONS",
    recommendations_cold_a
)


# Test 3: Cold-start user without preferences.
cold_user_b = users_df[
    users_df["name"] == "Cold Start User B"
].iloc[0]

recommendations_cold_b = recommender.get_personalised_recommendations(
    user_id=cold_user_b["_id"],
    user_item_matrix=user_item_matrix,
    users_df=users_df,
    interactions_df=interactions_df,
    top_n=10,
    exclude_product_ids=cold_user_b["cart"]
)

display_recommendations(
    "COLD START USER B RECOMMENDATIONS",
    recommendations_cold_b
)


# Test 4: Similar products.
first_product_id = products_df.iloc[0]["_id"]

similar_products = recommender.get_similar_products(
    product_id=first_product_id,
    top_n=8
)

display_recommendations(
    "SIMILAR PRODUCTS",
    similar_products
)
