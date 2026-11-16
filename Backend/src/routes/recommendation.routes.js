
import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";

import {
  getPersonalisedRecommendationsController,
  getSimilarProductsController,
  getPopularRecommendationsController,
  getRecommendationLabController,
} from "../controllers/recommendation.controller.js";

const router = Router();

// Personalised recommendations - authenticated
router.get(
  "/personalised",
  verifyJWT,
  getPersonalisedRecommendationsController
);

// Similar products - public
router.get(
  "/similar/:productId",
  getSimilarProductsController
);

// Popular recommendations - public
router.get(
  "/popular",
  getPopularRecommendationsController
);

// Recommendation Lab - authenticated
router.get(
  "/lab",
  verifyJWT,
  getRecommendationLabController
);

// Keep the previous endpoint as a compatibility alias
router.get(
  "/compare",
  verifyJWT,
  getRecommendationLabController
);

export default router;
