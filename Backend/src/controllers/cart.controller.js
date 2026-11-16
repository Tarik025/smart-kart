
import mongoose from "mongoose";

import { User } from "../models/user.model.js";
import { Product } from "../models/product.model.js";
import { Interaction } from "../models/interaction.model.js";

import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// GET CART
const getCart = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate(
      "cart",
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
        products: user.cart,
        totalItems: user.cart.length,
      },
      "Cart fetched successfully"
    )
  );
});

// ADD TO CART
const addToCart = asyncHandler(async (req, res) => {
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

  // Add only if the product is not already in the cart
  const result = await User.updateOne(
    {
      _id: req.user._id,
      cart: { $ne: productId },
    },
    {
      $addToSet: { cart: productId },
    }
  );

  if (result.matchedCount === 0) {
    throw new ApiError(404, "User not found");
  }

  // Record ADD_TO_CART only when a new item was added
  if (result.modifiedCount > 0) {
    await Interaction.create({
      userId: req.user._id,
      productId,
      eventType: "ADD_TO_CART",
      source: "live",
    });
  }

  const user = await User.findById(req.user._id)
    .populate("cart", "name brand category price imageUrl")
    .lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        products: user.cart,
        totalItems: user.cart.length,
      },
      result.modifiedCount > 0
        ? "Product added to cart"
        : "Product is already in cart"
    )
  );
});

// REMOVE FROM CART
const removeFromCart = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  if (!mongoose.isValidObjectId(productId)) {
    throw new ApiError(400, "Invalid product ID");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $pull: { cart: productId },
    },
    {
      new: true,
    }
  )
    .populate("cart", "name brand category price imageUrl")
    .lean();

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Removing an item does not create an interaction event.
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        products: user.cart,
        totalItems: user.cart.length,
      },
      "Product removed from cart"
    )
  );
});

// SIMULATED CHECKOUT
const checkoutCart = asyncHandler(async (req, res) => {
  // Atomically retrieve the old cart and clear it.
  const user = await User.findOneAndUpdate(
    {
      _id: req.user._id,
      cart: { $ne: [] },
    },
    {
      $set: { cart: [] },
    },
    {
      new: false,
    }
  ).select("cart");

  if (!user) {
    throw new ApiError(400, "Cart is empty");
  }

  const productIds = user.cart;

  const purchaseEvents = productIds.map((productId) => ({
    userId: req.user._id,
    productId,
    eventType: "PURCHASE",
    source: "live",
  }));

  try {
    await Interaction.insertMany(purchaseEvents);
  } catch (error) {
    // Restore the cart if recording purchases fails.
    await User.updateOne(
      { _id: req.user._id },
      {
        $addToSet: {
          cart: { $each: productIds },
        },
      }
    );

    throw error;
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        purchasedProductIds: productIds,
        totalItems: productIds.length,
      },
      "Simulated checkout completed successfully"
    )
  );
});

export {
  getCart,
  addToCart,
  removeFromCart,
  checkoutCart,
};
    