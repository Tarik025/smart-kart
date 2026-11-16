
import { Router } from "express";

import {
  getCart,
  addToCart,
  removeFromCart,
  checkoutCart,
} from "../controllers/cart.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router.get("/", getCart);
router.post("/", addToCart);
router.post("/checkout", checkoutCart);
router.delete("/:productId", removeFromCart);

export default router;
