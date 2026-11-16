
import mongoose, { Schema } from "mongoose";

const interactionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    eventType: {
      type: String,
      required: true,
      enum: [
        "VIEW",
        "WISHLIST",
        "ADD_TO_CART",
        "PURCHASE",
      ],
    },

    timestamp: {
      type: Date,
      default: Date.now,
    },

    source: {
      type: String,
      enum: ["live", "seed"],
      default: "live",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for recommendation queries
interactionSchema.index({ userId: 1 });
interactionSchema.index({ productId: 1 });
interactionSchema.index({ timestamp: 1 });
interactionSchema.index({ userId: 1, timestamp: 1 });

export const Interaction = mongoose.model(
  "Interaction",
  interactionSchema
);
