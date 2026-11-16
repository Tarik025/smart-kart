
import mongoose from "mongoose";

import { Product } from "../models/product.model.js";
import { Interaction } from "../models/interaction.model.js";

import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

import { recordInteraction } from "../services/interaction.service.js";

// RECORD INTERACTION
const createInteraction = asyncHandler(async (req, res) => {
  const { productId, eventType } = req.body;

  if (!productId || !eventType) {
    throw new ApiError(
      400,
      "Product ID and event type are required"
    );
  }

  if (!mongoose.isValidObjectId(productId)) {
    throw new ApiError(400, "Invalid product ID");
  }

  // Direct client requests may only record VIEW events.
  // Wishlist, cart and purchase events are recorded by
  // their respective backend operations.
  if (eventType !== "VIEW") {
    throw new ApiError(
      400,
      "Only VIEW events can be submitted directly"
    );
  }

  const productExists = await Product.exists({
    _id: productId,
  });

  if (!productExists) {
    throw new ApiError(404, "Product not found");
  }

  const result = await recordInteraction({
    userId: req.user._id,
    productId,
    eventType,
  });

  return res.status(
    result.created ? 201 : 200
  ).json(
    new ApiResponse(
      result.created ? 201 : 200,
      {
        interaction: result.interaction,
        created: result.created,
      },
      result.created
        ? "Interaction recorded successfully"
        : "Recent VIEW interaction already exists"
    )
  );
});

// GET MY INTERACTION HISTORY
const getMyInteractions = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  if (
    !Number.isInteger(page) ||
    !Number.isInteger(limit) ||
    page < 1 ||
    limit < 1 ||
    limit > 50
  ) {
    throw new ApiError(400, "Invalid pagination parameters");
  }

  const skip = (page - 1) * limit;

  const [interactions, totalInteractions] = await Promise.all([
    Interaction.find({
      userId: req.user._id,
    })
      .populate(
        "productId",
        "name brand category price imageUrl"
      )
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Interaction.countDocuments({
      userId: req.user._id,
    }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        interactions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalInteractions / limit),
          totalInteractions,
          limit,
        },
      },
      "Interaction history fetched successfully"
    )
  );
});

export {
  createInteraction,
  getMyInteractions,
};
