import express from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import errorMiddleware from "./middlewares/error.middleware.js";
import authRouter from "./routes/auth.routes.js";
import productRouter from "./routes/product.routes.js";
import interactionRouter from "./routes/interaction.routes.js";
import cartRouter from "./routes/cart.routes.js";
import wishlistRouter from "./routes/wishlist.routes.js";
import recommendationRouter from "./routes/recommendation.routes.js";

const app = express();

// Common middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || ["http://localhost:3000", "http://localhost:5173"],
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
const frontendBuildPath = fileURLToPath(new URL("../public", import.meta.url));
app.use(express.static(frontendBuildPath));
app.use(cookieParser());

// Health check
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Recommendation System API is running",
  });
});

// routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/interactions", interactionRouter);
app.use("/api/v1/cart", cartRouter);
app.use("/api/v1/wishlist", wishlistRouter);
app.use("/api/v1/recommendations", recommendationRouter);

app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();

  res.sendFile(`${frontendBuildPath}/index.html`, (error) => {
    if (error) next(error);
  });
});

// Global error middleware
app.use(errorMiddleware);

export default app;
