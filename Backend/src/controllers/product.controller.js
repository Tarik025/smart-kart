
import mongoose from "mongoose";

import { Product } from "../models/product.model.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// Pagination helper
const getPagination = (query) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 12;

  if (
    !Number.isInteger(page) ||
    !Number.isInteger(limit) ||
    page < 1 ||
    limit < 1
  ) {
    throw new ApiError(400, "Invalid pagination parameters");
  }

  if (limit > 50) {
    throw new ApiError(400, "Maximum limit is 50");
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

// Allowed sorting options
const getSortOption = (sortBy) => {
  const sortOptions = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
  };

  return sortOptions[sortBy] || sortOptions.newest;
};

// GET ALL PRODUCTS
const getAllProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};

  if (req.query.category) {
    filter.category = req.query.category.trim();
  }

  const sort = getSortOption(req.query.sort);

  const [products, totalProducts] = await Promise.all([
    Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),

    Product.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        products,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalProducts / limit),
          totalProducts,
          limit,
        },
      },
      "Products fetched successfully"
    )
  );
});

// SEARCH PRODUCTS
const searchProducts = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q || !q.trim()) {
    throw new ApiError(400, "Search query is required");
  }

  const { page, limit, skip } = getPagination(req.query);

  // Escape regex special characters in user input
  const escapedQuery = q.trim().replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const searchRegex = new RegExp(escapedQuery, "i");

  const filter = {
    $or: [
      { name: searchRegex },
      { description: searchRegex },
      { category: searchRegex },
      { brand: searchRegex },
      { tags: searchRegex },
    ],
  };

  const [products, totalProducts] = await Promise.all([
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Product.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        query: q.trim(),
        products,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalProducts / limit),
          totalProducts,
          limit,
        },
      },
      "Search results fetched successfully"
    )
  );
});

// GET ALL CATEGORIES
const getProductCategories = asyncHandler(async (req, res) => {
  const categories = await Product.distinct("category");

  return res.status(200).json(
    new ApiResponse(
      200,
      categories.sort((a, b) => a.localeCompare(b)),
      "Categories fetched successfully"
    )
  );
});

// GET SINGLE PRODUCT
const getProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid product ID");
  }

  const product = await Product.findById(id).lean();

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      product,
      "Product fetched successfully"
    )
  );
});

export {
  getAllProducts,
  searchProducts,
  getProductCategories,
  getProductById,
};
