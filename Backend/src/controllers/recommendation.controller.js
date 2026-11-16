
import mongoose from "mongoose";

import { Product } from "../models/product.model.js";
import { Interaction } from "../models/interaction.model.js";

import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

import {
  getPersonalisedRecommendations,
  getSimilarProducts,
  compareRecommendations,
} from "../services/ml.service.js";

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const getLimit = (value, defaultLimit = 10, maxLimit = 20) => {
  const limit = value === undefined ? defaultLimit : Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new ApiError(
      400,
      `Limit must be an integer between 1 and ${maxLimit}`
    );
  }

  return limit;
};

const isAxiosError = (error) => Boolean(error?.isAxiosError);

const isMlServiceUnavailable = (error) => {
  if (!isAxiosError(error)) return false;

  const status = error.response?.status;

  return !error.response || status >= 500;
};

const handleMlServiceError = (error, message) => {
  if (isAxiosError(error)) {
    const status = error.response?.status;

    if (status >= 400 && status < 500) {
      throw new ApiError(502, "ML service rejected the request");
    }

    throw new ApiError(503, message);
  }

  throw error;
};

// Convert ML reason codes into readable explanations.
const getReasonText = (reasonCode, sourceProductName) => {
  const code = (reasonCode || "HYBRID").toUpperCase();

  if (code.includes("POPULAR")) {
    return "Popular among other customers";
  }

  if (code.includes("CONTENT")) {
    return sourceProductName
      ? `Similar to ${sourceProductName}`
      : "Matches your product interests";
  }

  if (code.includes("COLLAB")) {
    return sourceProductName
      ? `Customers who interacted with ${sourceProductName} also interacted with this`
      : "Popular among customers with similar interests";
  }

  return sourceProductName
    ? `Recommended based on your interaction with ${sourceProductName}`
    : "Recommended based on your interests";
};

// Fetch complete products and preserve the ML ranking.
const enrichRecommendations = async (recommendations) => {
  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    return [];
  }

  const productIds = recommendations.map((item) => item.productId);

  const sourceIds = recommendations
    .map((item) => item.sourceProductId)
    .filter(Boolean);

  const products = await Product.find({
    _id: { $in: [...productIds, ...sourceIds] },
  }).lean();

  const productMap = new Map(
    products.map((product) => [product._id.toString(), product])
  );

  return recommendations
    .map((item) => {
      const product = productMap.get(item.productId?.toString());

      if (!product) return null;

      const sourceProduct = item.sourceProductId
        ? productMap.get(item.sourceProductId.toString())
        : null;

      const reasonCode = item.reasonCode || "HYBRID";

      return {
        product,
        score: item.score ?? 0,
        reason: {
          code: reasonCode,
          text: getReasonText(reasonCode, sourceProduct?.name),
          ...(item.sourceProductId && {
            sourceProductId: item.sourceProductId,
          }),
        },
        breakdown: {
          content: item.content ?? 0,
          collab: item.collab ?? 0,
        },
      };
    })
    .filter(Boolean);
};

// --------------------------------------------------
// POPULARITY
// --------------------------------------------------

const getPopularityScores = async () => {
  return Interaction.aggregate([
    {
      $group: {
        _id: "$productId",
        score: {
          $sum: {
            $switch: {
              branches: [
                { case: { $eq: ["$eventType", "VIEW"] }, then: 1 },
                { case: { $eq: ["$eventType", "WISHLIST"] }, then: 3 },
                { case: { $eq: ["$eventType", "ADD_TO_CART"] }, then: 4 },
                { case: { $eq: ["$eventType", "PURCHASE"] }, then: 5 },
              ],
              default: 0,
            },
          },
        },
      },
    },
    { $sort: { score: -1 } },
  ]);
};

const getPopularityRankedProducts = async (limit, excludedIds = []) => {
  const popularityScores = await getPopularityScores();

  const scoreMap = new Map(
    popularityScores.map((item) => [
      item._id.toString(),
      item.score,
    ])
  );

  const products = await Product.find({
    _id: { $nin: excludedIds },
  }).lean();

  products.sort((a, b) => {
    const scoreA = scoreMap.get(a._id.toString()) || 0;
    const scoreB = scoreMap.get(b._id.toString()) || 0;

    if (scoreA !== scoreB) return scoreB - scoreA;

    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  return products.slice(0, limit).map((product) => ({
    product,
    score: scoreMap.get(product._id.toString()) || 0,
    reason: {
      code: "POPULAR",
      text: "Popular among other customers",
    },
    breakdown: {
      content: 0,
      collab: 0,
    },
  }));
};

const getPopularFallback = async (user, limit) => {
  const purchasedProductIds = await Interaction.distinct("productId", {
    userId: user._id,
    eventType: "PURCHASE",
  });

  const cartProductIds = (user.cart || []).map((item) => {
    const id = item?._id || item?.productId || item;
    return new mongoose.Types.ObjectId(id);
  });

  const excludedIds = [
    ...purchasedProductIds,
    ...cartProductIds,
  ];

  return getPopularityRankedProducts(limit, excludedIds);
};

// --------------------------------------------------
// PERSONALISED RECOMMENDATIONS
// --------------------------------------------------

const getPersonalisedRecommendationsController = asyncHandler(
  async (req, res) => {
    const userId = req.user._id.toString();
    const limit = getLimit(req.query.limit, 10, 20);

    let recommendations;
    let strategy = "hybrid";
    let fallback = false;

    try {
      const result = await getPersonalisedRecommendations(userId, limit);

      recommendations = await enrichRecommendations(result.data || []);
    } catch (error) {
      if (!isMlServiceUnavailable(error)) {
        handleMlServiceError(
          error,
          "Recommendation service is temporarily unavailable"
        );
      }

      console.error("ML service unavailable. Using popularity fallback.");

      recommendations = await getPopularFallback(req.user, limit);
      strategy = "popularity_fallback";
      fallback = true;
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          strategy,
          fallback,
          recommendations,
        },
        "Personalised recommendations fetched successfully"
      )
    );
  }
);

// --------------------------------------------------
// SIMILAR PRODUCTS
// --------------------------------------------------

const getSimilarProductsController = asyncHandler(
  async (req, res) => {
    const { productId } = req.params;

    if (!mongoose.isValidObjectId(productId)) {
      throw new ApiError(400, "Invalid product ID");
    }

    const limit = getLimit(req.query.limit, 8, 8);

    const productExists = await Product.exists({ _id: productId });

    if (!productExists) {
      throw new ApiError(404, "Product not found");
    }

    let result;

    try {
      result = await getSimilarProducts(productId, limit);
    } catch (error) {
      handleMlServiceError(
        error,
        "Similar products service is temporarily unavailable"
      );
    }

    const recommendations = await enrichRecommendations(result.data || []);

    return res.status(200).json(
      new ApiResponse(
        200,
        { recommendations },
        "Similar products fetched successfully"
      )
    );
  }
);

// --------------------------------------------------
// POPULAR RECOMMENDATIONS - PUBLIC
// --------------------------------------------------

const getPopularRecommendationsController = asyncHandler(
  async (req, res) => {
    const limit = getLimit(req.query.limit, 10, 20);

    const recommendations = await getPopularityRankedProducts(limit);

    return res.status(200).json(
      new ApiResponse(
        200,
        { recommendations },
        "Popular recommendations fetched successfully"
      )
    );
  }
);

// --------------------------------------------------
// RECOMMENDATION LAB
// --------------------------------------------------

const getRecommendationLabController = asyncHandler(
  async (req, res) => {
    const userId = req.user._id.toString();
    const limit = getLimit(req.query.limit, 10, 20);

    let result;

    try {
      result = await compareRecommendations(userId, limit);
    } catch (error) {
      handleMlServiceError(
        error,
        "Recommendation comparison service is temporarily unavailable"
      );
    }

    const models = result.data || {};

    const [popular, content, collaborative, hybrid] = await Promise.all([
      enrichRecommendations(models.popular || []),
      enrichRecommendations(models.content || []),
      enrichRecommendations(models.collaborative || []),
      enrichRecommendations(models.hybrid || []),
    ]);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          popular,
          content,
          collaborative,
          hybrid,
        },
        "Recommendation models compared successfully"
      )
    );
  }
);

export {
  getPersonalisedRecommendationsController,
  getSimilarProductsController,
  getPopularRecommendationsController,
  getRecommendationLabController,
};
