
from app.services.data_loader import load_recommendation_data
from app.services.interaction_matrix import build_user_item_matrix


users_df, products_df, interactions_df = load_recommendation_data()

print("\n========== DATA LOADING ==========")

print("Users:", users_df.shape)
print("Products:", products_df.shape)
print("Interactions:", interactions_df.shape)

print("\n========== PRODUCT CATEGORIES ==========")
print(products_df["category"].value_counts())

print("\n========== INTERACTION EVENTS ==========")
print(interactions_df["eventType"].value_counts())

print("\n========== USER-ITEM MATRIX ==========")

matrix = build_user_item_matrix(interactions_df)

print("Matrix shape:", matrix.shape)
print("Non-zero entries:", (matrix > 0).sum().sum())

print("\nSample matrix:")
print(matrix.iloc[:5, :5])

print("\nData pipeline completed successfully!")
