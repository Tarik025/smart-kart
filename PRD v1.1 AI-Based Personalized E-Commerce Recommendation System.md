# PRD v1.1: AI-Based Personalized E-Commerce Recommendation System

Nov 16, 2026 · @Tarik

## 1. Overview and what changed

This project is a MERN e-commerce site whose homepage shows genuinely personalised products, produced by a Python hybrid recommender (TF-IDF content filtering + item-based collaborative filtering). It is judged on the working engine, its integration, and an honest evaluation, not on the number of screens.

**Goals**

- A demo where two users with different histories see clearly different recommendations, and a new user sees a sensible fallback.
- Real TF-IDF, cosine similarity, item-based CF and hybrid scoring, with no hardcoded results.
- A reproducible evaluation script that compares four models on the same split and labels all results as synthetic.

**Assumptions (change any of these and I will update the PRD)**

- One developer (Tarik) with Claude building alongside; the demo date is not fixed yet.
- Local MongoDB or Atlas free tier; everything runs on one laptop for the demo.
- Dataset is synthetic and always labelled that way. No real customer data.

**Changes from v1.0**

| # | Change | Why |
| --- | --- | --- |
| 1 | The ML service reads MongoDB directly (read-only); Express sends only userId and limit | Item-based CF needs all users' interactions; v1.0 sent only one user's |
| 2 | Interaction strength per user-item pair is capped and log-scaled; duplicate VIEWs within 30 minutes are ignored | Twenty views must not outweigh one purchase |
| 3 | Express computes popularity with a MongoDB aggregation; it is also the fallback when the ML service is down | v1.0 left this owner undefined |
| 4 | Checkout creates PURCHASE events and clears the cart; wishlist removal creates no event | v1.0 left checkout undefined |
| 5 | Evaluation protocol fully defined, with several seeds and coverage added | v1.0 was too vague to trust |
| 6 | Seed data grows to about 120 products and 40 users, generated from taste personas | 50 products and 15 users is too sparse for CF |
| 7 | New Recommendation Lab page, demo quick-login, per-item explanations | Shows evaluators that the personalisation is real |
| 8 | One-day plan replaced by a phased plan, ML core first | v1.0 assumed a team |

## 2. Scope

P0 is the minimum for a successful demo, P1 is built only after every P0 works, and P2 is built only if time is left.

| Priority | Feature |
| --- | --- |
| P0 | Register, login, JWT auth, role check (USER or ADMIN) |
| P0 | Product catalogue with list, search, category filter, details |
| P0 | Interaction tracking (VIEW, WISHLIST, ADD\_TO\_CART, PURCHASE) |
| P0 | Content-based, collaborative and hybrid recommendations with fallbacks |
| P0 | Homepage Recommended for You and Popular sections; Similar Products on details page |
| P0 | Seed script with synthetic personas; evaluation script with real metrics |
| P1 | Cart, wishlist, simulated checkout |
| P1 | Recommendation Lab page (Popular vs Content vs CF vs Hybrid side by side) |
| P1 | Admin product CRUD and basic dashboard counts |
| P1 | Demo quick-login buttons and reseed command |
| P2 | Onboarding category picker for new users |
| P2 | Admin user list, profile activity, sorting options |
| P2 | Optional offline evaluation on a public dataset |

**Out of scope:** real payments, shipping, chatbot or LLMs, computer vision, deep learning models, microservices beyond the one ML service, Docker or Kubernetes, real-time retraining, inventory, mobile apps.

If time slips, P1 and P2 are cut in that order. The engine and its evaluation are never cut.

## 3. Architecture

Three processes talk to one database: the React app calls Express, Express calls the FastAPI ML service, and both Express and the ML service use MongoDB. Express owns business logic and security; Python owns every recommendation score.

&#91;embedded content: architecture - 4 components\]

React never talks to Python or MongoDB directly; the highlighted ML service only ever reads data.

**Request flow for Recommended for You**

1. React calls `GET /api/v1/recommendations/personalized` with the JWT.
2. Express verifies the token, takes the user ID from it, and calls `POST /recommendations/personalized` on FastAPI with `userId` and `limit`.
3. FastAPI reads products and all interactions from MongoDB (cached in memory, refreshed on a short timer and on demand), scores items, and returns ranked product IDs with scores and reason codes.
4. Express loads the full product documents, attaches reason text, and returns them. If FastAPI is down or slow (2 second timeout), Express returns popular products with reason "Popular among other customers".

**Folder structure**

```text
recsys-project/
  frontend/            React + Vite + Tailwind
  backend/
    src/models/ routes/ controllers/ services/ middleware/ seed/
  ml-service/
    app/main.py        FastAPI endpoints only
    app/recommender/   content.py collaborative.py hybrid.py popularity.py explain.py
    app/data.py        MongoDB loading and caching
    app/config.py      weights, event weights, limits
    eval/evaluate.py   evaluation script
    tests/             pytest
    requirements.txt
  README.md
```

The ML service must never be exposed publicly; it listens on localhost and Express is its only caller.

## 4. Data model

MongoDB is the single source of truth, with three collections. Cart and wishlist are arrays of product IDs inside the user document.

| Collection | Fields | Rules and indexes |
| --- | --- | --- |
| users | name, email, passwordHash, role (USER or ADMIN), preferences.categories, cart\[\], wishlist\[\], isDemo, createdAt | Unique index on email; passwordHash never returned; ADMIN only via seed |
| products | name, description, category, brand, price, imageUrl, tags\[\], averageRating, isSynthetic, createdAt | Price at least 0; text fields required; index on category |
| interactions | userId, productId, eventType, timestamp, source ("live" or "seed") | Indexes: userId, productId, timestamp, userId + timestamp; eventType limited to the four allowed values |

**Event weights** (initial engineering choices, kept in `config.py`, not learned): VIEW 1, WISHLIST 3, ADD\_TO\_CART 4, PURCHASE 5.

**Rules**

- The user ID on an interaction always comes from the JWT, never from the request body.
- The backend validates that the product exists before recording an interaction or changing the cart or wishlist.
- A VIEW from the same user on the same product within 30 minutes is not stored again.
- Adding to wishlist or cart records an event; removing from either records nothing.
- Checkout records one PURCHASE per cart item, then empties the cart.
- Seeded events carry source "seed" so they can always be told apart from live activity.

## 5. Recommendation engine

The engine is written in Python with scikit-learn, pandas and NumPy. Algorithm code lives in `app/recommender/`, separate from the API layer.

**Step 0: user-item strength.** For each user and product, collapse all events into one strength: the sum of event weights, with repeat VIEWs counted as log(1 + count), capped at 5. This stops many views from outweighing a purchase. The result is a sparse user-item matrix R.

**Content-based score**

1. Build one text per product from name, category (repeated twice), brand and tags (repeated twice) and description; lowercase and strip punctuation.
2. Fit a TF-IDF vectoriser (English stop words, unigrams and bigrams) once at startup; refit when products change.
3. The user profile is the strength-weighted mean of the TF-IDF vectors of the products they interacted with.
4. Content score = cosine similarity between the profile and each candidate product.

```latex
\cos(A,B) = \frac{A \cdot B}{\lVert A \rVert \, \lVert B \rVert}
```

**Collaborative score (item-based)**

1. Compute item-item cosine similarity from the columns of R, with the diagonal set to 0.
2. For candidate item i, the score is the sum over the user's items j of strength(u, j) times sim(i, j).
3. Optionally keep only the top 20 neighbours per item to reduce noise.

**Hybrid score**

```latex
\text{Hybrid}(u,i) = w_c \cdot \widehat{C}(u,i) + w_{cf} \cdot \widehat{F}(u,i), \quad w_c = 0.4,\; w_{cf} = 0.6
```

Each component is min-max normalised to 0 to 1 over the candidate list for that user before combining. Weights live in `config.py`. Candidates exclude purchased products and products currently in the cart. The top 10 are returned.

**Fallbacks and cold start**

| Situation | Behaviour | Reason code |
| --- | --- | --- |
| No interaction history, onboarding categories chosen | Popular products inside those categories | CATEGORY |
| No interaction history, no categories | Popular products overall | POPULAR |
| CF score unavailable (for example the user only touched new products) | Content score alone | CONTENT |
| Content score unavailable | CF score alone | COLLAB |
| Both unavailable | Popularity ranking | POPULAR |
| No candidates | Empty list with a message | NONE |
| New product with no interactions | Takes part through content similarity | CONTENT |

**Explanations come from the scoring.** Each result carries a reason code and a source item: the interacted product that contributed most to its score. The UI shows text such as "Because you viewed Logitech G502" (hybrid or CF), "Similar to products you viewed" (content), or "Popular among other customers". Text is never written independently of the scores.

**Similar products.** Content cosine similarity to the opened product, excluding itself, top 8. When the product has interaction data, an "also liked by similar users" CF blend is allowed as a stretch.

## 6. API contracts

Every Express response uses `{ success, data }` or `{ success: false, message }`. Base path is `/api/v1`. Auth is a Bearer JWT.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | /auth/register | public | Create USER account |
| POST | /auth/login | public | Returns JWT and user |
| GET | /auth/me | user | Current user |
| GET | /products | public | List with page, limit, category, sort |
| GET | /products/search?q= | public | Text search |
| GET | /products/categories | public | Category list |
| GET | /products/:id | public | Product details |
| POST, PUT, DELETE | /products, /products/:id | admin | Product CRUD |
| POST | /interactions | user | Body: productId, eventType |
| GET | /interactions/me | user | Own history |
| GET, POST, DELETE | /cart, /wishlist | user | Manage lists; adding records an event |
| POST | /cart/checkout | user | Records PURCHASE events, clears cart |
| GET | /recommendations/personalized | user | Hybrid list, up to 10 |
| GET | /recommendations/similar/:productId | public | Up to 8 similar products |
| GET | /recommendations/popular | public | Weighted popularity |
| GET | /recommendations/lab | admin or demo | All four models for one user (Lab page) |
| GET | /admin/dashboard | admin | Counts and top products |
| GET | /admin/users | admin | Registered users |

**Recommendation item shape returned to React**

```json
{
  "product": { "_id": "...", "name": "...", "price": 4999, "imageUrl": "..." },
  "score": 0.91,
  "reason": { "code": "COLLAB", "text": "Because you viewed Logitech G502", "sourceProductId": "..." },
  "breakdown": { "content": 0.72, "collab": 0.95 }
}
```

**ML service (internal, `http://localhost:8000`)**

| Method | Endpoint | Request | Response |
| --- | --- | --- | --- |
| GET | /health | none | status and counts of loaded products and interactions |
| POST | /recommendations/personalized | userId, limit | list of productId, score, content, collab, reasonCode, sourceProductId |
| POST | /recommendations/similar | productId, limit | list of productId, score |
| POST | /recommendations/compare | userId, limit | the four model lists for one user (Lab page) |
| POST | /admin/refresh | none | Reload data from MongoDB |

**Error handling.** Invalid IDs return 400, missing items 404, auth failures 401 or 403. ML timeouts or errors fall back to popularity, and the response notes `fallback: true` so the UI can show it.

## 7. Seed data

All seed data is synthetic and is labelled that way in the database (`isSynthetic`, `source: "seed"`), in the README and in the report. A single command (`npm run seed`) wipes and recreates it from a fixed random seed, so every run is identical.

| Item | Target |
| --- | --- |
| Products | about 120 across 8 categories (for example Laptops, Gaming Accessories, Smartphones, Cameras, Audio, Fitness, Home Kitchen, Books), each with brand, tags, a 2 to 3 sentence description and a local placeholder image |
| Demo users | about 40, plus one admin, plus 2 named demo users (Customer A gamer, Customer B photographer) with a known password |
| Personas | 6 to 8 taste profiles; each user mostly interacts inside 1 or 2 persona categories, with about 15% random noise |
| Interactions | about 25 to 40 per user, with realistic funnels (many VIEWs, fewer WISHLIST, fewer ADD\_TO\_CART, few PURCHASE) and timestamps spread over the last 60 days |
| Cold-start users | 2 users with zero interactions and 3 products with zero interactions |

The seed script also builds the products in a way that some personas overlap (for example Gamer and Laptop buyer), so that collaborative filtering has cross-category signal to find.

**Honesty note.** Because the data is generated from personas, evaluation results partly reflect how it was generated. The report says so and makes no real-world claim.

## 8. Evaluation

`eval/evaluate.py` compares Popularity, Content, Collaborative and Hybrid on the same split and prints a table. No number is ever typed in by hand.

**Protocol**

- Use only seeded interactions from users with at least 6 events.
- For each user, hold out their most recent 20% of events (at least 2) as the test set; train on the rest. Profiles, TF-IDF user vectors and the item-item matrix are built from training data only.
- A held-out item counts as relevant if its event is WISHLIST, ADD\_TO\_CART or PURCHASE. VIEW-only items are not counted as relevant.
- Candidates for each user are all products not in that user's training set.
- Report the mean over users at K = 5 and K = 10, repeated over 5 different random seeds of the seed script, as mean and standard deviation.

**Metrics**

| Metric | What it measures |
| --- | --- |
| Precision@K | Share of the K recommended items that are relevant |
| Recall@K | Share of the user's relevant items found in the top K |
| NDCG@K | Ranking quality; relevant items near the top score higher |
| Hit Rate@K | Share of users with at least one relevant item in the top K |
| Catalogue coverage@K | Share of all products that appear in someone's top K |

**Weight tuning.** The script can sweep the hybrid weight (0.0 to 1.0 in steps of 0.1) and report the best value, so the 0.4 and 0.6 defaults are either justified or replaced. Tuning is done on a validation split, not on the test set.

**Limits.** The dataset is synthetic, so the metrics verify that the algorithms work and behave sensibly; they do not prove real-world effectiveness. Every results table in the report carries the label "synthetic data".

## 9. Frontend

React + Vite + Tailwind CSS, responsive, with loading, error and empty states on every data section.

| Page | Contents | Priority |
| --- | --- | --- |
| Login and Register | Validation, error messages, redirect after login; demo quick-login buttons for Customer A, Customer B and a new user | P0 |
| Home | Search bar, category chips, Recommended for You (with reason text), Popular Products | P0 |
| Product listing | Grid, category filter, search, price sort | P0 |
| Product details | Image, description, brand, category, price, Add to cart, Add to wishlist, Similar Products; records a VIEW on open | P0 |
| Cart and Wishlist | List, remove, total, simulated checkout | P1 |
| Recommendation Lab | Pick a user; show Popular, Content, CF and Hybrid lists side by side with content and CF score bars per item | P1 |
| Admin | Dashboard counts, top viewed, wishlisted and purchased products, product add, edit, delete | P1 |
| Profile | Account info and selected interests | P2 |

Recommended for You shows each product's reason text, and a small "Why?" popover shows the content and collaborative scores. When the ML service is unavailable the section shows popular items with a short notice, never a blank space or a crash.

## 10. Non-functional requirements and testing

**Security**

- Passwords hashed with bcrypt; JWT secret and database URI only in `.env`, which is never committed.
- Role check middleware on every admin route; admin accounts exist only via the seed script.
- Input validation (zod or express-validator), `helmet`, CORS limited to the frontend origin, rate limit on login.
- Responses never include passwordHash. Invalid ObjectIds return 400.
- The ML service listens on localhost only.

**Performance and reliability**

- Lists are paginated; recommendation limit is capped at 20.
- ML data is cached in memory and refreshed on a timer and by `/admin/refresh`; the model is not rebuilt on every request.
- Express calls the ML service with a 2 second timeout and falls back to popularity.

**Testing**

| Area | Checks |
| --- | --- |
| ML (pytest) | TF-IDF shape, cosine similarity on a hand-made example, item-item similarity, hybrid normalisation and weights, purchased and in-cart items excluded, cold-start fallback, empty dataset |
| Backend | Register, duplicate email rejected, bad login rejected, protected and admin routes, interaction recorded with the JWT user, VIEW dedupe, checkout creates PURCHASE events |
| Integration | React to Express to FastAPI to MongoDB; a new interaction changes the next recommendation; ML service stopped gives the popularity fallback |
| Manual | The four demo scenarios in section 11 |

Nothing is reported as working until it has been run and checked.

## 11. Build plan, acceptance and demo

**Phased plan.** Each phase ends with a gate that must pass before the next begins. Sizes are rough working sessions of 3 to 4 hours for one developer; the total is about 8 to 10 sessions, so the demo date must leave at least that much time.

| Phase | Work | Gate | Sessions |
| --- | --- | --- | --- |
| 1. Foundation | Repo, folders, env files, MongoDB connection, Mongoose models, seed script with personas | Seed runs and produces the expected counts | 1 |
| 2. ML core | Strength matrix, TF-IDF content, item-based CF, hybrid, fallbacks, explanations, pytest | Tests pass; two seeded users get visibly different lists | 2 |
| 3. Evaluation | evaluate.py with split, 4 models, 5 metrics, multi-seed | Real results table printed and saved | 1 |
| 4. Backend | Auth, products, interactions, cart, wishlist, checkout, recommendation routes with fallback | Postman collection passes | 2 |
| 5. Frontend P0 | Auth, home, listing, details, recommendation sections | Demo scenarios A to D work in the browser | 2 |
| 6. P1 and polish | Recommendation Lab, admin, quick-login, loading and empty states | Full demo rehearsal without errors | 1 |
| 7. Report and viva | README, report, PPT, viva question prep | Dry run presentation | 1 |

**Acceptance criteria**

| ID | Criterion | Priority |
| --- | --- | --- |
| AC-1 | Register, login, logout work; passwords are hashed | P0 |
| AC-2 | Products load from MongoDB; search, filter and details work | P0 |
| AC-3 | Interactions are stored with the JWT user and deduplicated as specified | P0 |
| AC-4 | Content, collaborative and hybrid scores are computed by real algorithms | P0 |
| AC-5 | Customer A and Customer B receive different recommendation lists | P0 |
| AC-6 | A new user receives the popularity or category fallback | P0 |
| AC-7 | Purchased and in-cart products never appear in Recommended for You | P0 |
| AC-8 | Express reaches FastAPI; if FastAPI is stopped, the homepage still works | P0 |
| AC-9 | Evaluation script prints real metrics for all four models | P0 |
| AC-10 | Similar Products never includes the opened product | P0 |
| AC-11 | Cart, wishlist, checkout, admin CRUD, dashboard, Recommendation Lab | P1 |

**Demo script**

1. **Customer A:** quick-login, open three laptops, wishlist a gaming mouse, return home; recommendations lean towards laptops and gaming accessories, each with a reason.
2. **Customer B:** log out, quick-login as the photographer, open cameras and a phone, wishlist a lens; the list is clearly different.
3. **Cold start:** register a new account and open the homepage; popular or category products appear.
4. **Similar products:** open any product; the list excludes the product itself.
5. **Recommendation Lab:** choose Customer A and show Popular, Content, CF and Hybrid side by side.
6. **Evaluation:** show the saved metrics table, labelled synthetic.

**Definition of done:** all P0 acceptance criteria pass; the three services start from the README in one go; the seed script resets the demo state; no recommendation is hardcoded; every reported number comes from a script run.
