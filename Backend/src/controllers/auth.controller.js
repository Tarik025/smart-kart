
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { User } from "../models/user.model.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const createAccessToken = (userId) => {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new ApiError(
      503,
      "Authentication is not configured. Add a private JWT_SECRET with at least 32 characters to the server environment."
    );
  }

  return jwt.sign(
    { sub: userId.toString() },
    secret,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    }
  );
};

const getSafeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  preferences: user.preferences,
  cart: user.cart,
  wishlist: user.wishlist,
  isDemo: user.isDemo,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

// REGISTER
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name?.trim() || !email?.trim() || !password) {
    throw new ApiError(
      400,
      "Name, email and password are required"
    );
  }

  if (password.length < 8) {
    throw new ApiError(
      400,
      "Password must contain at least 8 characters"
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  if (existingUser) {
    throw new ApiError(409, "Email is already registered");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let user;

  try {
    user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, "Email is already registered");
    }

    throw error;
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      getSafeUser(user),
      "User registered successfully"
    )
  );
});

// LOGIN
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({
    email: email.trim().toLowerCase(),
  }).select("+passwordHash");

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isPasswordValid = await bcrypt.compare(
    password,
    user.passwordHash
  );

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  const accessToken = createAccessToken(user._id);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: getSafeUser(user),
        accessToken,
      },
      "Login successful"
    )
  );
});

// GET CURRENT USER
const getCurrentUser = asyncHandler(async (req, res) => {
  return res.status(200).json(
    new ApiResponse(
      200,
      getSafeUser(req.user),
      "User fetched successfully"
    )
  );
});

export {
  registerUser,
  loginUser,
  getCurrentUser,
};
