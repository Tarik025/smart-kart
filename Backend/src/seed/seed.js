
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

import { User } from "../models/user.model.js";
import { Product } from "../models/product.model.js";
import { Interaction } from "../models/interaction.model.js";

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

const MONGODB_URI = process.env.MONGODB_URI;

const SEED = Number(process.env.SEED || 42);

const DEMO_PASSWORD = "Demo@12345";

// Fixed reference date makes generated timestamps reproducible.
const BASE_DATE = new Date(
  process.env.SEED_BASE_DATE || "2026-11-16T12:00:00.000Z"
);

// --------------------------------------------------
// DETERMINISTIC RANDOM GENERATOR
// --------------------------------------------------

function createRandom(seed) {
  let state = seed >>> 0;

  return function random() {
    state += 0x6D2B79F5;

    let value = state;

    value = Math.imul(
      value ^ (value >>> 15),
      value | 1
    );

    value ^= value + Math.imul(
      value ^ (value >>> 7),
      value | 61
    );

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(SEED);

const randomInt = (min, max) =>
  Math.floor(random() * (max - min + 1)) + min;

const pick = (array) =>
  array[Math.floor(random() * array.length)];

const randomDate = () => {
  const sixtyDays = 60 * 24 * 60 * 60 * 1000;

  return new Date(
    BASE_DATE.getTime() - randomInt(0, sixtyDays)
  );
};

// --------------------------------------------------
// PRODUCT CATALOGUE CONFIGURATION
// 8 categories x 5 models x 3 variants = 120
// --------------------------------------------------

const CATALOGUE = [
  {
    category: "Laptops",
    tags: ["laptop", "computer", "productivity", "technology"],
    minPrice: 35000,
    maxPrice: 120000,
    products: [
      { brand: "Dell", model: "Inspiron 14" },
      { brand: "Lenovo", model: "ThinkPad E14" },
      { brand: "HP", model: "Pavilion 15" },
      { brand: "ASUS", model: "VivoBook 15" },
      { brand: "Acer", model: "Aspire 5" },
    ],
  },

  {
    category: "Gaming Accessories",
    tags: ["gaming", "gamer", "pc gaming", "performance"],
    minPrice: 800,
    maxPrice: 12000,
    products: [
      { brand: "Logitech", model: "G502 Mouse" },
      { brand: "Razer", model: "DeathAdder Mouse" },
      { brand: "Corsair", model: "K55 Keyboard" },
      { brand: "HyperX", model: "Cloud Stinger Headset" },
      { brand: "SteelSeries", model: "Rival 3 Mouse" },
    ],
  },

  {
    category: "Smartphones",
    tags: ["smartphone", "mobile", "android", "technology"],
    minPrice: 10000,
    maxPrice: 85000,
    products: [
      { brand: "Samsung", model: "Galaxy A55" },
      { brand: "Apple", model: "iPhone 15" },
      { brand: "OnePlus", model: "Nord CE" },
      { brand: "Google", model: "Pixel 8a" },
      { brand: "Xiaomi", model: "Redmi Note 13" },
    ],
  },

  {
    category: "Cameras",
    tags: ["camera", "photography", "photographer", "lens"],
    minPrice: 25000,
    maxPrice: 150000,
    products: [
      { brand: "Canon", model: "EOS R50" },
      { brand: "Nikon", model: "Z50" },
      { brand: "Sony", model: "Alpha A6400" },
      { brand: "Fujifilm", model: "X-S20" },
      { brand: "Panasonic", model: "Lumix G100" },
    ],
  },

  {
    category: "Audio",
    tags: ["audio", "headphones", "music", "sound"],
    minPrice: 1500,
    maxPrice: 30000,
    products: [
      { brand: "Sony", model: "WH-CH720N" },
      { brand: "JBL", model: "Tune 770NC" },
      { brand: "Bose", model: "QuietComfort 45" },
      { brand: "Sennheiser", model: "HD 450BT" },
      { brand: "Audio-Technica", model: "ATH-M50x" },
    ],
  },

  {
    category: "Fitness",
    tags: ["fitness", "health", "exercise", "workout"],
    minPrice: 1000,
    maxPrice: 25000,
    products: [
      { brand: "Garmin", model: "Forerunner 165" },
      { brand: "Fitbit", model: "Charge 6" },
      { brand: "Decathlon", model: "Domyos Fitness Band" },
      { brand: "Nike", model: "Training Mat" },
      { brand: "Amazfit", model: "Bip 5" },
    ],
  },

  {
    category: "Home Kitchen",
    tags: ["home", "kitchen", "appliances", "household"],
    minPrice: 1000,
    maxPrice: 18000,
    products: [
      { brand: "Philips", model: "Air Fryer" },
      { brand: "Prestige", model: "Mixer Grinder" },
      { brand: "Havells", model: "Induction Cooktop" },
      { brand: "Pigeon", model: "Electric Kettle" },
      { brand: "IKEA", model: "Storage Set" },
    ],
  },

  {
    category: "Books",
    tags: ["books", "reading", "learning", "education"],
    minPrice: 250,
    maxPrice: 2500,
    products: [
      { brand: "Penguin", model: "Atomic Habits" },
      { brand: "HarperCollins", model: "Deep Work" },
      { brand: "Prentice Hall", model: "Clean Code" },
      {
        brand: "O'Reilly",
        model: "Designing Data-Intensive Applications",
      },
      { brand: "Packt", model: "Eloquent JavaScript" },
    ],
  },
];

const VARIANTS = ["Essential", "Plus", "Pro"];

// --------------------------------------------------
// USER PERSONAS
// --------------------------------------------------

const PERSONAS = [
  {
    name: "Gamer",
    categories: ["Gaming Accessories", "Laptops"],
  },
  {
    name: "Photographer",
    categories: ["Cameras", "Smartphones"],
  },
  {
    name: "Smartphone Enthusiast",
    categories: ["Smartphones", "Audio"],
  },
  {
    name: "Fitness Enthusiast",
    categories: ["Fitness", "Smartphones"],
  },
  {
    name: "Home & Kitchen Buyer",
    categories: ["Home Kitchen", "Books"],
  },
  {
    name: "Audio Lover",
    categories: ["Audio", "Gaming Accessories"],
  },
  {
    name: "Reader",
    categories: ["Books", "Laptops"],
  },
  {
    name: "Productivity User",
    categories: ["Laptops", "Books"],
  },
];

// --------------------------------------------------
// GENERATE PRODUCTS
// --------------------------------------------------

function generateProducts() {
  const products = [];

  for (const categoryConfig of CATALOGUE) {
    for (const productConfig of categoryConfig.products) {
      for (const variant of VARIANTS) {
        const name = `${productConfig.model} ${variant}`;

        const price = randomInt(
          categoryConfig.minPrice,
          categoryConfig.maxPrice
        );

        const tags = [
          ...new Set([
            ...categoryConfig.tags,
            ...productConfig.model.toLowerCase().split(" "),
            variant.toLowerCase(),
          ]),
        ];

        products.push({
          name,
          description:
            `${name} by ${productConfig.brand} is designed for ` +
            `${categoryConfig.category.toLowerCase()} users. ` +
            `It offers practical features for everyday use and a reliable experience.`,
          category: categoryConfig.category,
          brand: productConfig.brand,
          price,
          imageUrl: "/images/placeholder-product.png",
          tags,
          averageRating: Number(
            (3.8 + random() * 1.2).toFixed(1)
          ),
          isSynthetic: true,
        });
      }
    }
  }

  return products;
}

// --------------------------------------------------
// GENERATE USERS
// --------------------------------------------------

function generateUsers(passwordHash) {
  const users = [];

  // Named demo user A: Gamer
  users.push({
    name: "Customer A - Gamer",
    email: "customer.a@example.com",
    passwordHash,
    preferences: {
      categories: ["Gaming Accessories", "Laptops"],
    },
    isDemo: true,
  });

  // Named demo user B: Photographer
  users.push({
    name: "Customer B - Photographer",
    email: "customer.b@example.com",
    passwordHash,
    preferences: {
      categories: ["Cameras", "Smartphones"],
    },
    isDemo: true,
  });

  // Generate another 36 users with different personas.
  for (let i = 3; i <= 38; i++) {
    const persona = PERSONAS[(i - 3) % PERSONAS.length];

    users.push({
      name: `Demo Customer ${String(i).padStart(2, "0")}`,
      email: `demo${String(i).padStart(2, "0")}@example.com`,
      passwordHash,
      preferences: {
        categories: persona.categories,
      },
      isDemo: true,
    });
  }

  // Cold-start user with selected category preferences.
  users.push({
    name: "Cold Start User A",
    email: "coldstart.a@example.com",
    passwordHash,
    preferences: {
      categories: ["Fitness"],
    },
    isDemo: true,
  });

  // Cold-start user without category preferences.
  users.push({
    name: "Cold Start User B",
    email: "coldstart.b@example.com",
    passwordHash,
    preferences: {
      categories: [],
    },
    isDemo: true,
  });

  return users;
}

// --------------------------------------------------
// SELECT PRODUCTS FOR INTERACTIONS
// --------------------------------------------------

function selectPersonaProduct(persona, productsByCategory) {
  // 85% persona-related behaviour, 15% random noise.
  const usePersona = random() < 0.85;

  const category = usePersona
    ? pick(persona.categories)
    : pick(CATALOGUE.map((item) => item.category));

  return pick(productsByCategory.get(category));
}

// --------------------------------------------------
// GENERATE USER INTERACTIONS
// --------------------------------------------------

function generateInteractions(userId, persona, productsByCategory) {
  const interactions = [];

  // PRD funnel: many views, fewer wishlist/cart/purchases.
  const eventCounts = [
    { eventType: "VIEW", count: 20 },
    { eventType: "WISHLIST", count: 6 },
    { eventType: "ADD_TO_CART", count: 4 },
    { eventType: "PURCHASE", count: 2 },
  ];

  for (const { eventType, count } of eventCounts) {
    const selectedProducts = new Set();

    while (selectedProducts.size < count) {
      const product = selectPersonaProduct(
        persona,
        productsByCategory
      );

      selectedProducts.add(product._id.toString());
    }

    for (const productId of selectedProducts) {
      interactions.push({
        userId,
        productId,
        eventType,
        timestamp: randomDate(),
        source: "seed",
      });
    }
  }

  return interactions;
}

// --------------------------------------------------
// MAIN SEED FUNCTION
// --------------------------------------------------

const seedDatabase = async () => {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from .env");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed script cannot run in production");
  }

  await mongoose.connect(MONGODB_URI);

  console.log("MongoDB connected for seeding");

  // WARNING: This resets all documents in these collections.
  console.log("Clearing existing project collections...");

  await Interaction.deleteMany({});
  await User.deleteMany({});
  await Product.deleteMany({});

  // Generate and insert products.
  const productData = generateProducts();

  const products = await Product.insertMany(productData);

  console.log(`Inserted ${products.length} products`);

  // Build category-wise product lookup.
  const productsByCategory = new Map();

  for (const product of products.slice(0, -3)) {
    if (!productsByCategory.has(product.category)) {
      productsByCategory.set(product.category, []);
    }

    productsByCategory.get(product.category).push(product);
  }

  // Last three products remain without interactions.
  const coldStartProducts = products.slice(-3);

  // Generate demo users.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const userData = generateUsers(passwordHash);

  const users = await User.insertMany(userData);

  console.log(`Inserted ${users.length} users`);

  // Generate interactions for 38 active users.
  const interactionData = [];

  for (const user of users.slice(0, 38)) {
    let persona;

    if (user.email === "customer.a@example.com") {
      persona = PERSONAS.find((item) => item.name === "Gamer");
    } else if (user.email === "customer.b@example.com") {
      persona = PERSONAS.find(
        (item) => item.name === "Photographer"
      );
    } else {
      persona = PERSONAS.find(
        (item) =>
          item.categories.every((category) =>
            user.preferences.categories.includes(category)
          )
      );
    }

    const userInteractions = generateInteractions(
      user._id,
      persona,
      productsByCategory
    );

    interactionData.push(...userInteractions);
  }

  await Interaction.insertMany(interactionData);

  console.log(`Inserted ${interactionData.length} interactions`);

  // ------------------------------------------------
  // FINAL SUMMARY
  // ------------------------------------------------

  console.log("\n========== SEED SUMMARY ==========");

  console.log(`Random seed: ${SEED}`);
  console.log(`Products: ${products.length}`);
  console.log(`Users: ${users.length}`);
  console.log(`Interactions: ${interactionData.length}`);

  console.log("Categories:", CATALOGUE.length);
  console.log("Personas:", PERSONAS.length);

  console.log(
    "Cold-start users: 2 (zero interactions)"
  );

  console.log(
    "Cold-start products:",
    coldStartProducts.map((product) => product.name)
  );

  console.log("\n========== DEMO LOGIN ==========");

  console.log("Customer A:");
  console.log("Email: customer.a@example.com");
  console.log(`Password: ${DEMO_PASSWORD}`);

  console.log("\nCustomer B:");
  console.log("Email: customer.b@example.com");
  console.log(`Password: ${DEMO_PASSWORD}`);

  console.log("\nCold-start user A:");
  console.log("Email: coldstart.a@example.com");

  console.log("\nCold-start user B:");
  console.log("Email: coldstart.b@example.com");

  console.log("=================================\n");

  await mongoose.disconnect();

  console.log("Database seeding completed successfully");
};

// --------------------------------------------------
// EXECUTION
// --------------------------------------------------

seedDatabase().catch(async (error) => {
  console.error("Database seeding failed:", error);

  await mongoose.disconnect();

  process.exit(1);
});
