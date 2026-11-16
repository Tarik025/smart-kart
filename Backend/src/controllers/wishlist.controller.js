
import mongoose from "mongoose";

import { User } from "../models/user.model.js";
import { Product } from "../models/product.model.js";
import { Interaction } from "../models/interaction.model.js";

import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// GET WISHLIST
const getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate(
      "wishlist",
      "name brand category price imageUrl"
    )
    .lean();

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        products: user.wishlist,
        totalItems: user.wishlist.length,
      },
      "Wishlist fetched successfully"
    )
  );
});

// ADD TO WISHLIST
const addToWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body;

  if (!productId || !mongoose.isValidObjectId(productId)) {
    throw new ApiError(400, "Valid product ID is required");
  }

  const productExists = await Product.exists({
    _id: productId,
  });

  if (!productExists) {
    throw new ApiError(404, "Product not found");
  }

  const result = await User.updateOne(
    {
      _id: req.user._id,
      wishlist: { $ne: productId },
    },
    {
      $addToSet: { wishlist: productId },
    }
  );

  if (result.matchedCount === 0) {
    throw new ApiError(404, "User not found");
  }

  // Record WISHLIST only for a newly added item.
  if (result.modifiedCount > 0) {
    await Interaction.create({
      userId: req.user._id,
      productId,
      eventType: "WISHLIST",
      source: "live",
    });
  }

  const user = await User.findById(req.user._id)
    .populate(
      "wishlist",
      "name brand category price imageUrl"
    )
    .lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        products: user.wishlist,
        totalItems: user.wishlist.length,
      },
      result.modifiedCount > 0
        ? "Product added to wishlist"
        : "Product is already in wishlist"
    )
  );
});

// REMOVE FROM WISHLIST
const removeFromWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  if (!mongoose.isValidObjectId(productId)) {
    throw new ApiError(400, "Invalid product ID");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $pull: { wishlist: productId },
    },
    {
      new: true,
    }
  )
    .populate(
      "wishlist",
      "name brand category price imageUrl"
    )
    .lean();

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Removing a wishlist item does not create an event.
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        products: user.wishlist,
        totalItems: user.wishlist.length,
      },
      "Product removed from wishlist"
    )
  );
});

export {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
};
