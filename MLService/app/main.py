
from bson import ObjectId
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from app.database import check_database_connection
from app.data import get_recommendation_data, get_data_stats
from app.config import (
    DEFAULT_RECOMMENDATION_LIMIT,
    MAX_RECOMMENDATION_LIMIT,
    MAX_SIMILAR_PRODUCTS
)
from app.services.explanation import get_recommendation_reason


app = FastAPI(
    title="E-Commerce Recommendation Engine",
    description="ML service for personalised product recommendations",
    version="1.0.0"
)


# --------------------------------------------------
# REQUEST SCHEMAS
# --------------------------------------------------

class RecommendationRequest(BaseModel):
    userId: str
    limit: int = Field(
        default=DEFAULT_RECOMMENDATION_LIMIT,
        ge=1,
        le=MAX_RECOMMENDATION_LIMIT
    )


class SimilarRequest(BaseModel):
    productId: str
    limit: int = Field(
        default=MAX_SIMILAR_PRODUCTS,
        ge=1,
        le=MAX_SIMILAR_PRODUCTS
    )


# --------------------------------------------------
# VALIDATION HELPERS
# --------------------------------------------------

def validate_object_id(value):

    if not ObjectId.is_valid(value):
        raise HTTPException(
            status_code=400,
            detail="Invalid MongoDB ObjectId"
        )


def find_user(data, user_id):

    users = data["users"]

    user_rows = users[
        users["_id"].astype(str) == user_id
    ]

    if user_rows.empty:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return user_rows.iloc[0]


def find_product(data, product_id):

    products = data["products"]

    product_rows = products[
        products["_id"].astype(str) == product_id
    ]

    if product_rows.empty:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    return product_rows.iloc[0]


# --------------------------------------------------
# HEALTH ENDPOINT
# --------------------------------------------------

@app.get("/health")
def health_check():

    try:
        check_database_connection()

        stats = get_data_stats()

        return {
            "success": True,
            "status": "healthy",
            "database": "connected",
            "counts": stats
        }

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="ML service or database unavailable"
        )


# --------------------------------------------------
# PERSONALIZED RECOMMENDATIONS
# --------------------------------------------------

@app.post("/recommendations/personalised")
def personalised_recommendations(
    request: RecommendationRequest
):

    validate_object_id(request.userId)

    data = get_recommendation_data()

    find_user(data, request.userId)

    recommender = data["hybrid"]

    results = recommender.get_recommendations(
        user_id=request.userId,
        top_n=request.limit
    )

    recommendations = []

    for _, item in results.iterrows():

        product_id = str(item["productId"])

        strategy = item.get("strategy", "hybrid")

        content_score = float(
            item.get("contentScore", 0.0)
        )

        collaborative_score = float(
            item.get("collaborativeScore", 0.0)
        )

        reason = get_recommendation_reason(
            user_id=request.userId,
            product_id=product_id,
            strategy=strategy,
            data=data,
            content_score=content_score,
            collaborative_score=collaborative_score
        )

        recommendations.append({
            "productId": product_id,
            "score": float(item["score"]),
            "content": content_score,
            "collab": collaborative_score,
            "reasonCode": reason["reasonCode"],
            "sourceProductId": reason["sourceProductId"]
        })

    return {
        "success": True,
        "data": recommendations
    }


# --------------------------------------------------
# SIMILAR PRODUCTS
# --------------------------------------------------

@app.post("/recommendations/similar")
def similar_products(request: SimilarRequest):

    validate_object_id(request.productId)

    data = get_recommendation_data()

    find_product(data, request.productId)

    results = data["content"].get_similar_products(
        product_id=request.productId,
        top_n=request.limit
    )

    recommendations = [
        {
            "productId": str(item["productId"]),
            "score": float(item["score"])
        }
        for _, item in results.iterrows()
    ]

    return {
        "success": True,
        "data": recommendations
    }


# --------------------------------------------------
# COMPARE ALL FOUR MODELS
# --------------------------------------------------

@app.post("/recommendations/compare")
def compare_recommendations(
    request: RecommendationRequest
):

    validate_object_id(request.userId)

    data = get_recommendation_data()

    user = find_user(data, request.userId)

    user_id = request.userId

    cart = user.get("cart", [])

    if not isinstance(cart, list):
        cart = []

    matrix = data["user_item_matrix"]
    interactions = data["interactions"]
    products = data["products"]

    hybrid = data["hybrid"]

    # Get all four recommendation lists.
    content_results = (
        data["content"].get_personalised_recommendations(
            user_id=user_id,
            user_item_matrix=matrix,
            users_df=data["users"],
            interactions_df=interactions,
            top_n=request.limit,
            exclude_product_ids=cart
        )
    )

    collaborative_results = (
        data["collaborative"].get_personalised_recommendations(
            user_id=user_id,
            interactions_df=interactions,
            top_n=request.limit,
            exclude_product_ids=cart
        )
    )

    hybrid_results = hybrid.get_recommendations(
        user_id=user_id,
        top_n=request.limit
    )

    excluded_ids = hybrid._get_excluded_products(
        user_id,
        cart
    )

    candidate_ids = [
        str(product_id)
        for product_id in products["_id"]
        if str(product_id) not in excluded_ids
    ]

    popular_results = hybrid._get_popular_recommendations(
        candidate_ids,
        request.limit
    )

    def format_results(results):

        if results.empty:
            return []

        return [
            {
                "productId": str(item["productId"]),
                "score": float(item["score"])
            }
            for _, item in results.iterrows()
        ]

    return {
        "success": True,
        "data": {
            "popular": format_results(popular_results),
            "content": format_results(content_results),
            "collaborative": format_results(collaborative_results),
            "hybrid": format_results(hybrid_results)
        }
    }
