
import { Router } from "express";

import {
  getAllProducts,
  searchProducts,
  getProductCategories,
  getProductById,
} from "../controllers/product.controller.js";

const router = Router();

router.get("/", getAllProducts);

// Keep specific routes before /:id
router.get("/search", searchProducts);
router.get("/categories", getProductCategories);

router.get("/:id", getProductById);

export default router;
