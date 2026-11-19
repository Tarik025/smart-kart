
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

  return !error.response || status === 404 || status >= 500;
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

const getSimilarFallback = async (sourceProduct, limit) => {
  const sourceTags = new Set((sourceProduct.tags || []).map((tag) => tag.toLowerCase()));
  const candidates = await Product.find({
    _id: { $ne: sourceProduct._id },
  }).lean();

  return candidates
    .map((product) => {
      const sharedTags = (product.tags || []).filter((tag) =>
        sourceTags.has(tag.toLowerCase())
      ).length;
      const score =
        (product.category === sourceProduct.category ? 5 : 0) +
        sharedTags * 2 +
        (product.brand === sourceProduct.brand ? 1 : 0) +
        (product.averageRating || 0) / 5;

      return { product, score, sharedTags };
    })
    .sort((a, b) => b.score - a.score || b.product.price - a.product.price)
    .slice(0, limit)
    .map(({ product, score }) => ({
      product,
      score,
      reason: {
        code: "CONTENT",
        text: `Similar to ${sourceProduct.name}`,
        sourceProductId: sourceProduct._id,
      },
      breakdown: { content: score, collab: 0 },
    }));
};

const getCollaborativeFallback = async (user, limit, popular) => {
  const userProductIds = await Interaction.distinct("productId", {
    userId: user._id,
  });

  if (!userProductIds.length) return popular;

  const peers = await Interaction.aggregate([
    {
      $match: {
        productId: { $in: userProductIds },
        userId: { $ne: user._id },
      },
    },
    { $group: { _id: "$userId", overlap: { $sum: 1 } } },
    { $sort: { overlap: -1 } },
    { $limit: 20 },
  ]);
  const peerIds = peers.map((peer) => peer._id);

  if (!peerIds.length) return popular;

  const scores = await Interaction.aggregate([
    {
      $match: {
        userId: { $in: peerIds },
        productId: { $nin: userProductIds },
      },
    },
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
    { $limit: limit },
  ]);
  const productIds = scores.map((item) => item._id);
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const scoreMap = new Map(scores.map((item) => [item._id.toString(), item.score]));
  const collaborative = products
    .map((product) => ({
      product,
      score: scoreMap.get(product._id.toString()) || 0,
      reason: {
        code: "COLLABORATIVE",
        text: "Customers with similar interests liked this",
      },
      breakdown: {
        content: 0,
        collab: scoreMap.get(product._id.toString()) || 0,
      },
    }))
    .sort((a, b) => b.score - a.score);
  const seen = new Set(collaborative.map((item) => item.product._id.toString()));

  return [
    ...collaborative,
    ...popular.filter((item) => !seen.has(item.product._id.toString())),
  ].slice(0, limit);
};

const getRecommendationLabFallback = async (user, limit) => {
  const popular = await getPopularFallback(user, limit);
  const latestInteraction = await Interaction.findOne({ userId: user._id })
    .sort({ timestamp: -1 })
    .lean();
  const sourceProduct = latestInteraction
    ? await Product.findById(latestInteraction.productId).lean()
    : null;
  const content = sourceProduct
    ? await getSimilarFallback(sourceProduct, limit)
    : popular;
  const collaborative = await getCollaborativeFallback(user, limit, popular);
  const hybrid = [...content, ...collaborative]
    .filter((item, index, items) =>
      items.findIndex((candidate) =>
        candidate.product._id.equals(item.product._id)
      ) === index
    )
    .slice(0, limit);

  return {
    popular,
    content,
    collaborative,
    hybrid,
  };
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

      const fallbackModels = await getRecommendationLabFallback(req.user, limit);
      recommendations = fallbackModels.hybrid;
      strategy = "local_hybrid_fallback";
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
    const sourceProduct = await Product.findById(productId).lean();

    if (!sourceProduct) {
      throw new ApiError(404, "Product not found");
    }

    let recommendations;

    try {
      const result = await getSimilarProducts(productId, limit);
      recommendations = await enrichRecommendations(result.data || []);
    } catch (error) {
      if (!isMlServiceUnavailable(error)) {
        handleMlServiceError(
          error,
          "Similar products service is temporarily unavailable"
        );
      }

      recommendations = await getSimilarFallback(sourceProduct, limit);
    }

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
      if (!isMlServiceUnavailable(error)) {
        handleMlServiceError(
          error,
          "Recommendation comparison service is temporarily unavailable"
        );
      }

      const fallbackModels = await getRecommendationLabFallback(req.user, limit);

      return res.status(200).json(
        new ApiResponse(
          200,
          fallbackModels,
          "Recommendation models fetched using local fallback"
        )
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
