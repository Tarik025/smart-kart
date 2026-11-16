
import mongoose, { Schema } from "mongoose";

const productSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },

    description: {
      type: String,
      required: [true, "Product description is required"],
      trim: true,
    },

    category: {
      type: String,
      required: [true, "Product category is required"],
      trim: true,
      index: true,
    },

    brand: {
      type: String,
      required: [true, "Product brand is required"],
      trim: true,
    },

    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: [0, "Price cannot be negative"],
    },

    imageUrl: {
      type: String,
      required: [true, "Product image URL is required"],
      trim: true,
    },

    tags: {
      type: [String],
      default: [],
    },

    averageRating: {
      type: Number,
      min: 0,
      max: 5,
    },

    isSynthetic: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Product = mongoose.model("Product", productSchema);
