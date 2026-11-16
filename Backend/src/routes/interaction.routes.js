
import { Router } from "express";

import {
  createInteraction,
  getMyInteractions,
} from "../controllers/interaction.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post("/", createInteraction);
router.get("/me", getMyInteractions);

export default router;
    