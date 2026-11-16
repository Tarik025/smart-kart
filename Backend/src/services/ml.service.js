
import axios from "axios";

const mlClient = axios.create({
  baseURL: process.env.ML_SERVICE_URL || "http://127.0.0.1:8001",
  timeout: 2000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const getPersonalisedRecommendations = async (
  userId,
  limit = 10
) => {
  const response = await mlClient.post(
    "/recommendations/personalised",
    { userId, limit }
  );

  return response.data;
};

export const getSimilarProducts = async (
  productId,
  limit = 8
) => {
  const response = await mlClient.post(
    "/recommendations/similar",
    { productId, limit }
  );

  return response.data;
};

export const compareRecommendations = async (
  userId,
  limit = 10
) => {
  const response = await mlClient.post(
    "/recommendations/compare",
    { userId, limit }
  );

  return response.data;
};
