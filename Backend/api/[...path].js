import app from "../src/app.js";
import connectDB from "../src/db/index.js";

let databaseConnection;

export default async function handler(req, res) {
  try {
    databaseConnection ??= connectDB();
    await databaseConnection;
    return app(req, res);
  } catch {
    databaseConnection = undefined;
    return res.status(503).json({
      success: false,
      message: "The database is unavailable. Check the MongoDB Atlas connection configuration.",
    });
  }
}
