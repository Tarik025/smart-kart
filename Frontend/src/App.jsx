import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ArrowRight, ArrowUpRight, BadgeCheck, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Heart, LayoutGrid, LoaderCircle, LogIn, LogOut, Menu, Search, ShoppingBag, Sparkles, Star, WandSparkles, X } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api/v1";
const demoAccounts = [
  { label: "Customer A · Gamer", email: "customer.a@example.com", password: "Demo@12345" },
  { label: "Customer B · Photographer", email: "customer.b@example.com", password: "Demo@12345" },
  { label: "Cold start", email: "coldstart.b@example.com", password: "Demo@12345" },
];
const art = {
  Laptops: "photo-1496181133206-80ce9b88a853", "Gaming Accessories": "photo-1612287230202-1ff1d85d1bdf",
  Smartphones: "photo-1511707171634-5f897ff02aa9", Cameras: "photo-1516035069371-29a1b244cc32",
  Audio: "photo-1505740420928-5e560c06d30e", Fitness: "photo-1538805060514-97d9cc17730c",
  "Home Kitchen": "photo-1556911220-e15b29be8c8f", Books: "photo-1544947950-fa07a98d237f",
};
const imageFor = (product) => product?.imageUrl && !product.imageUrl.includes("placeholder") ? product.imageUrl : `https://images.unsplash.com/${art[product?.category] || "photo-1523275335684-37898b6baf30"}?auto=format&fit=crop&w=900&q=85`;
const unwrap = (payload) => payload?.data ?? payload;
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

export default function App() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [token, setToken] = useState(() => sessionStorage.getItem("smartkart_token") || "");
  const [user, setUser] = useState(() => { try { return JSON.parse(sessionStorage.getItem("smartkart_user") || "null"); } catch { return null; } });
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All products");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState("home");
  const [modal, setModal] = useState("");
  const [selected, setSelected] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authBusy, setAuthBusy] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [wishlist, setWishlist] = useState([]);

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
    let body = {};
    try { body = await response.json(); } catch { /* Preserve API status if response is not JSON. */ }
    if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`);
    return unwrap(body);
  }, [token]);

  const loadProducts = useCallback(async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ page: "1", limit: "24", sort });
      if (category !== "All products") params.set("category", category);
      if (query.trim()) {
        const data = await request(`/products/search?${new URLSearchParams({ q: query.trim(), page: "1", limit: "24" })}`);
        setProducts(data.products || []);
      } else {
        const data = await request(`/products?${params}`);
        setProducts(data.products || []);
      }
      setNotice("");
    } catch (error) { setProducts([]); setNotice(error.message); }
    finally { setBusy(false); }
  }, [request, category, query, sort]);

  const loadRecommendations = useCallback(async () => {
    try {
      const data = token ? await request("/recommendations/personalised?limit=8") : await request("/recommendations/popular?limit=8");
      setRecommendations((data.recommendations || []).map((item) => ({ ...item.product, reason: item.reason?.text, breakdown: item.breakdown })));
      if (data.fallback) setNotice("Personalized service is warming up; showing popular picks instead.");
    } catch { setRecommendations([]); }
  }, [request, token]);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { request("/products/categories").then(setCategories).catch(() => {}); }, [request]);
  useEffect(() => { loadRecommendations(); }, [loadRecommendations]);
  useEffect(() => {
    if (!token) { setCartCount(0); setWishlist([]); return; }
    request("/cart").then((data) => setCartCount(Array.isArray(data) ? data.length : data.items?.length || data.cart?.length || 0)).catch(() => {});
    request("/wishlist").then((data) => setWishlist(Array.isArray(data) ? data : data.items || data.wishlist || [])).catch(() => {});
  }, [request, token]);

  const featured = recommendations[0] || products[0];
  const shownProducts = useMemo(() => products, [products]);
  const formatProblem = notice && /failed|fetch|network/i.test(notice) ? `Can’t reach Smart Kart API. Start the backend on port 8000 to load your live catalogue. ${notice}` : notice;

  async function authenticate(event) {
    event.preventDefault(); setAuthBusy(true);
    try {
      if (authMode === "register") {
        await request("/auth/register", { method: "POST", body: JSON.stringify(authForm) });
        const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ email: authForm.email, password: authForm.password }) });
        sessionStorage.setItem("smartkart_token", result.accessToken); sessionStorage.setItem("smartkart_user", JSON.stringify(result.user)); setToken(result.accessToken); setUser(result.user);
      } else {
        const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ email: authForm.email, password: authForm.password }) });
        sessionStorage.setItem("smartkart_token", result.accessToken); sessionStorage.setItem("smartkart_user", JSON.stringify(result.user)); setToken(result.accessToken); setUser(result.user);
      }
      setModal(""); setNotice("");
    } catch (error) { setNotice(error.message); }
    finally { setAuthBusy(false); }
  }
  async function quickLogin(account) {
    setAuthBusy(true);
    try {
      const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ email: account.email, password: account.password }) });
      sessionStorage.setItem("smartkart_token", result.accessToken); sessionStorage.setItem("smartkart_user", JSON.stringify(result.user)); setToken(result.accessToken); setUser(result.user); setModal(""); setNotice("");
    } catch (error) { setNotice(error.message); }
    finally { setAuthBusy(false); }
  }
  function logout() { sessionStorage.removeItem("smartkart_token"); sessionStorage.removeItem("smartkart_user"); setToken(""); setUser(null); setPage("home"); }
  async function addCart(product) {
    if (!token) { setModal("auth"); return; }
    try { await request("/cart", { method: "POST", body: JSON.stringify({ productId: product._id, quantity: 1 }) }); setCartCount((n) => n + 1); setNotice(`${product.name} added to your cart.`); }
    catch (error) { setNotice(error.message); }
  }
  async function toggleWishlist(product) {
    if (!token) { setModal("auth"); return; }
    try {
      const active = wishlist.some((item) => (item.product?._id || item._id || item.productId) === product._id);
      const data = await request(active ? `/wishlist/${product._id}` : "/wishlist", { method: active ? "DELETE" : "POST", ...(!active ? { body: JSON.stringify({ productId: product._id }) } : {}) });
      setWishlist(Array.isArray(data) ? data : data.items || data.wishlist || (active ? wishlist.filter((x) => x._id !== product._id) : [...wishlist, product]));
      setNotice(active ? "Removed from wishlist." : "Saved to your wishlist.");
    } catch (error) { setNotice(error.message); }
  }
  async function openProduct(product) {
    setSelected(product); setModal("product");
    if (token) request("/interactions", { method: "POST", body: JSON.stringify({ productId: product._id, eventType: "VIEW", source: "product_detail" }) }).catch(() => {});
  }
  const openAuth = () => { setAuthMode("login"); setModal("auth"); };

  return <div className="app-shell">
    <header className="topbar"><a href="#home" className="brand" onClick={() => setPage("home")}><span className="brand-mark"><ShoppingBag size={19}/></span><span>smart<span className="brand-light">kart</span><small>INTELLIGENT COMMERCE</small></span></a>
      <nav className="main-nav" aria-label="Main navigation"><button className={page === "home" ? "nav-active" : ""} onClick={() => setPage("home")}>Discover</button><button className={page === "shop" ? "nav-active" : ""} onClick={() => setPage("shop")}>Shop all</button><button className={page === "lab" ? "nav-active" : ""} onClick={() => setPage("lab")}>Recommendation lab <span className="nav-new">NEW</span></button></nav>
      <div className="header-actions"><button className="icon-btn" aria-label="Wishlist" onClick={() => { if (!token) openAuth(); else setPage("wishlist"); }}><Heart size={19}/><span className="count-badge">{wishlist.length}</span></button><button className="icon-btn" aria-label="Cart" onClick={() => { if (!token) openAuth(); else setPage("cart"); }}><ShoppingBag size={19}/><span className="count-badge">{cartCount}</span></button>{user ? <button className="profile-chip" onClick={logout} title="Sign out"><span className="avatar">{user.name?.[0] || "S"}</span><span className="profile-name">{user.name?.split(" ")[0]}</span><LogOut size={15}/></button> : <button className="signin-btn" onClick={openAuth}>Sign in <ArrowUpRight size={15}/></button>}</div>
    </header>
    <main>
      {page === "lab" ? <RecommendationLab request={request} onProduct={openProduct} onAdd={addCart}/> : page === "cart" || page === "wishlist" ? <CollectionPage type={page} request={request} onAdd={addCart} onProduct={openProduct} onRefresh={() => { setCartCount(Math.max(0, cartCount - 1)); setWishlist([]); }}/> : <>
      <section className="hero-wrap"><div className="hero-copy"><div className="eyebrow"><span className="pulse-dot"/> YOUR NEXT FAVOURITE, FOUND</div><h1>Shopping that<br/>gets <em>you.</em></h1><p>Meet your personal shopping assistant. Every pick is tuned to what you love, powered by real customer signals.</p><div className="hero-ctas"><button className="primary-btn" onClick={() => document.getElementById("catalogue")?.scrollIntoView({ behavior: "smooth" })}>Explore the collection <ArrowRight size={17}/></button><button className="text-link" onClick={() => setPage("lab")}><WandSparkles size={16}/> See how it thinks</button></div><div className="hero-proof"><div className="proof-avatars"><span>A</span><span>M</span><span>R</span><span>+</span></div><span>Personalized for <b>every shopper</b></span><span className="proof-divider"/><BadgeCheck size={15}/><span>AI-powered discovery</span></div></div>
      <div className="hero-art"><img src={imageFor(featured || { category: "Laptops" })} alt="Featured technology product"/><div className="hero-art-shade"/><div className="floating-card"><div className="float-icon"><Sparkles size={16}/></div><div><strong>A little more you.</strong><span>Recommendations, reimagined.</span></div><span className="float-arrow"><ArrowUpRight size={16}/></span></div><div className="art-caption"><span className="caption-line"/> DISCOVER YOUR NEXT</div></div>
      <div className="hero-index">01 <span/> 04</div></section>
      <section className="metrics-strip"><div><span className="metric-num">120<span>+</span></span><span className="metric-label">curated products</span></div><i/><div><span className="metric-num">4<span>×</span></span><span className="metric-label">recommendation models</span></div><i/><div><span className="metric-num">1<span>:</span>1</span><span className="metric-label">made for your taste</span></div><div className="metrics-note"><Sparkles size={15}/> Smarter with every interaction</div></section>
      <section className="recommend-section"><div className="section-heading"><div><div className="eyebrow muted"><Sparkles size={13}/> A GOOD PLACE TO START</div><h2>{user ? `Picked for ${user.name?.split(" ")[0]}` : "Popular right now"}<span className="heading-period">.</span></h2><p>{user ? "Your activity is shaping a collection that feels like yours." : "Loved by the Smart Kart community. Your personal picks start after sign in."}</p></div><button className="outline-btn" onClick={() => setPage("lab")}>Explore the lab <ArrowUpRight size={15}/></button></div>
        {recommendations.length ? <div className="recommend-grid">{recommendations.slice(0, 4).map((product, i) => <ProductCard key={product._id} product={product} index={i} onOpen={openProduct} onAdd={addCart} onWish={toggleWishlist} wished={wishlist.some((x) => (x.product?._id || x._id || x.productId) === product._id)}/>)}</div> : <div className="recommend-empty"><Sparkles size={20}/><span>{busy ? "Finding the right picks…" : "Your recommendations are getting ready."}</span></div>}
      </section>
      <section className="catalogue-section" id="catalogue"><div className="section-heading catalogue-heading"><div><div className="eyebrow muted">THE SMART KART COLLECTION</div><h2>{page === "shop" ? "Shop the collection" : "Find your thing"}<span className="heading-period">.</span></h2></div><button className="sort-btn" onClick={() => setSort(sort === "price_asc" ? "price_desc" : sort === "price_desc" ? "newest" : "price_asc")}><ArrowDownUp size={15}/>{sort === "newest" ? "Sort by" : sort === "price_asc" ? "Price: low to high" : "Price: high to low"}<ChevronDown size={14}/></button></div>
        <div className="catalogue-tools"><div className="category-list"><button onClick={() => setCategory("All products")} className={category === "All products" ? "category-active" : ""}>All products</button>{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={category === item ? "category-active" : ""}>{item}</button>)}</div><label className="search-box"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the collection" aria-label="Search products"/><kbd>↵</kbd></label></div>
        {formatProblem && <div className="api-notice"><CircleHelp size={17}/><span>{formatProblem}</span><button onClick={loadProducts}>Retry</button></div>}
        {busy ? <div className="loading-grid">{[1,2,3,4].map((n) => <div className="skeleton" key={n}><div/><span/></div>)}</div> : shownProducts.length ? <div className="product-grid">{shownProducts.map((product, i) => <ProductCard key={product._id} product={product} index={i} onOpen={openProduct} onAdd={addCart} onWish={toggleWishlist} wished={wishlist.some((x) => (x.product?._id || x._id || x.productId) === product._id)}/>)}</div> : <div className="empty-state"><LayoutGrid size={25}/><h3>No products found</h3><p>Try another search or choose a different category.</p><button className="text-link" onClick={() => { setQuery(""); setCategory("All products"); }}>Clear filters <ArrowRight size={15}/></button></div>}
      </section>
      <section className="bottom-banner"><div className="banner-orbit orbit-one"/><div className="banner-orbit orbit-two"/><div className="banner-text"><span className="eyebrow"><Sparkles size={13}/> THE SMARTER WAY TO SHOP</span><h2>Good taste is personal.<br/><em>So are our picks.</em></h2><p>Explore the four recommendation models behind every thoughtful suggestion.</p><button className="banner-btn" onClick={() => setPage("lab")}>Step inside the lab <ArrowRight size={16}/></button></div><div className="banner-stats"><span>CONTENT-BASED</span><b>×</b><span>COLLABORATIVE</span><b>×</b><span>HYBRID INTELLIGENCE</span></div></section>
      </>}
    </main>
    <footer className="footer"><a href="#home" className="brand footer-brand"><span className="brand-mark"><ShoppingBag size={17}/></span><span>smart<span className="brand-light">kart</span></span></a><span>Personalized commerce, thoughtfully built.</span><span>MAJOR PROJECT · 2026–27</span></footer>

    {modal === "auth" && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setModal("")}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" onClick={() => setModal("")} aria-label="Close"><X size={19}/></button><div className="auth-brand"><span className="brand-mark"><ShoppingBag size={18}/></span> smart<span className="brand-light">kart</span></div><div className="eyebrow muted">YOUR PERSONALIZED EXPERIENCE</div><h2 id="auth-title">{authMode === "login" ? "Welcome back." : "Make it personal."}</h2><p className="auth-sub">{authMode === "login" ? "Sign in to see what we picked just for you." : "Create an account to get recommendations built around you."}</p>
      <form onSubmit={authenticate} className="auth-form">{authMode === "register" && <label>Your name<input required minLength="2" value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} placeholder="Alex Morgan"/></label>}<label>Email address<input type="email" required value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} placeholder="you@example.com"/></label><label>Password<input type="password" required minLength={authMode === "register" ? 8 : 1} value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} placeholder={authMode === "register" ? "At least 8 characters" : "Your password"}/></label><button className="primary-btn auth-submit" disabled={authBusy}>{authBusy ? <LoaderCircle className="spin" size={17}/> : authMode === "login" ? <LogIn size={16}/> : <Check size={16}/>} {authMode === "login" ? "Sign in" : "Create account"}</button></form>
      <button className="auth-switch" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "New to Smart Kart? Create an account" : "Already a member? Sign in"}</button>
      <div className="demo-divider"><span/>DEMO QUICK LOGIN<span/></div><div className="demo-list">{demoAccounts.map((account) => <button key={account.email} disabled={authBusy} onClick={() => quickLogin(account)}><span className="demo-avatar">{account.label[0]}</span>{account.label}<ArrowUpRight size={14}/></button>)}</div><p className="demo-hint">Seed the database first · Password: <code>Demo@12345</code></p></section></div>}
    {modal === "product" && selected && <ProductModal product={selected} request={request} onClose={() => setModal("")} onAdd={addCart} onOpen={openProduct} onWish={toggleWishlist} wished={wishlist.some((x) => (x.product?._id || x._id || x.productId) === selected._id)}/>}
    {notice && !modal && <div className="toast" role="status"><Check size={16}/>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15}/></button></div>}
  </div>;
}

function ProductCard({ product, index, onOpen, onAdd, onWish, wished }) {
  return <article className="product-card" style={{ "--card-index": index }}><button className="product-image" onClick={() => onOpen(product)} aria-label={`View ${product.name}`}><img src={imageFor(product)} alt={product.name} loading="lazy"/><span className="product-tag">{product.category}</span><span className="image-arrow"><ArrowUpRight size={16}/></span></button><div className="product-info"><div className="product-meta"><span>{product.brand || "SMART KART SELECT"}</span><span className="rating"><Star size={12} fill="currentColor"/> {product.averageRating || "4.8"}</span></div><button className="product-name" onClick={() => onOpen(product)}>{product.name}</button><div className="product-bottom"><strong>{money(product.price)}</strong><div className="product-actions"><button className={`wish-btn ${wished ? "wished" : ""}`} onClick={() => onWish(product)} aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}><Heart size={17} fill={wished ? "currentColor" : "none"}/></button><button className="quick-add" onClick={() => onAdd(product)} aria-label={`Add ${product.name} to cart`}><ShoppingBag size={16}/></button></div></div></div></article>;
}

function ProductModal({ product, request, onClose, onAdd, onOpen, onWish, wished }) {
  const [similar, setSimilar] = useState([]);
  useEffect(() => { request(`/recommendations/similar/${product._id}?limit=4`).then((data) => setSimilar((data.recommendations || []).map((item) => item.product))).catch(() => setSimilar([])); }, [product._id, request]);
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="product-modal" role="dialog" aria-modal="true" aria-label={product.name}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={19}/></button><div className="detail-main"><div className="detail-image"><img src={imageFor(product)} alt={product.name}/></div><div className="detail-copy"><span className="eyebrow muted">{product.category} / {product.brand}</span><h2>{product.name}</h2><div className="detail-rating"><Star size={14} fill="currentColor"/> {product.averageRating || "4.8"} <span>·</span> Smart Kart selection</div><strong className="detail-price">{money(product.price)}</strong><p>{product.description || "Thoughtfully selected for quality, performance, and everyday use. A great fit for your collection."}</p><div className="detail-actions"><button className="primary-btn" onClick={() => onAdd(product)}>Add to cart <ShoppingBag size={16}/></button><button className={`detail-wish ${wished ? "wished" : ""}`} onClick={() => onWish(product)} aria-label="Toggle wishlist"><Heart size={18} fill={wished ? "currentColor" : "none"}/></button></div><div className="detail-note"><BadgeCheck size={16}/> {product.reason || "Selected for the Smart Kart community"}</div></div></div>{similar.length > 0 && <div className="similar-row"><div><span className="eyebrow muted">YOU MAY ALSO LIKE</span><h3>Similar finds</h3></div><div className="similar-products">{similar.map((item) => <button key={item._id} onClick={() => onOpen(item)}><img src={imageFor(item)} alt=""/><span>{item.name}</span><b>{money(item.price)}</b></button>)}</div></div>}</section></div>;
}

function RecommendationLab({ request, onProduct, onAdd }) {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); request("/recommendations/lab?limit=4").then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, [request]);
  const models = [{ key: "popular", label: "Popular", note: "Community favourites", color: "#72917e" }, { key: "content", label: "Content-based", note: "Similar product attributes", color: "#8299d1" }, { key: "collaborative", label: "Collaborative", note: "Customers like you", color: "#d39a61" }, { key: "hybrid", label: "Hybrid", note: "The best of both signals", color: "#b07b92" }];
  return <div className="lab-page"><div className="lab-hero"><div className="eyebrow"><span className="pulse-dot"/> BEHIND THE RECOMMENDATION</div><h1>Four ways to find<br/>your <em>next favourite.</em></h1><p>One catalogue. Four recommendation strategies. See how each model discovers the products you might love.</p><div className="lab-callout"><Sparkles size={17}/><span>Personalized results are generated from your account’s real interaction history.</span></div></div>{error && <div className="api-notice"><CircleHelp size={17}/><span>{error.includes("401") ? "Sign in to explore recommendations personalized to your taste." : error}</span></div>}{loading ? <div className="lab-loading"><LoaderCircle className="spin"/> Comparing recommendation models…</div> : <div className="model-grid">{models.map((model, i) => <section className="model-column" key={model.key} style={{ "--model-color": model.color, "--card-index": i }}><div className="model-heading"><span className="model-index">0{i + 1}</span><div><h2>{model.label}</h2><p>{model.note}</p></div><span className="model-dot"/></div>{(data?.[model.key] || []).length ? data[model.key].map((entry, j) => { const product = entry.product; return <article key={product._id} className="model-product"><button className="model-product-image" onClick={() => onProduct(product)}><img src={imageFor(product)} alt={product.name}/></button><div className="model-product-info"><span>{product.brand}</span><button onClick={() => onProduct(product)}>{product.name}</button><b>{money(product.price)}</b><div className="score-bars"><span>CONTENT <i><b style={{ width: `${Math.max(4, (entry.breakdown?.content || 0) * 100)}%` }}/></i></span><span>COLLAB <i><b style={{ width: `${Math.max(4, (entry.breakdown?.collab || 0) * 100)}%` }}/></i></span></div></div><button className="model-add" onClick={() => onAdd(product)} aria-label="Add to cart"><ArrowUpRight size={16}/></button></article>; }) : <div className="model-empty">{error ? "Sign in to compare models." : "No recommendations available yet."}</div>}</section>)}</div>}<div className="lab-footnote"><CircleHelp size={16}/><span>Recommendation scores are model outputs, not ratings. This project uses a synthetic seed dataset for demonstration; real-world performance depends on catalogue and interaction data.</span></div></div>;
}

function CollectionPage({ type, request, onAdd, onProduct, onRefresh }) {
  const [items, setItems] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const endpoint = type === "cart" ? "/cart" : "/wishlist";
  useEffect(() => { request(endpoint).then((data) => setItems(Array.isArray(data) ? data : data.items || data.cart || data.wishlist || [])).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, [endpoint, request]);
  const products = items.map((item) => item.product || item);
  const total = products.reduce((sum, p) => sum + (p.price || 0), 0);
  async function remove(product) { try { await request(type === "cart" ? `/cart/${product._id}` : `/wishlist/${product._id}`, { method: "DELETE" }); setItems((old) => old.filter((x) => (x.product?._id || x._id) !== product._id)); onRefresh(); } catch (e) { setError(e.message); } }
  async function checkout() { try { await request("/cart/checkout", { method: "POST", body: JSON.stringify({}) }); setItems([]); onRefresh(); setError("Checkout complete. Your purchase has been recorded."); } catch (e) { setError(e.message); } }
  return <section className="collection-page"><div className="eyebrow muted">YOUR SMART KART</div><h1>{type === "cart" ? "Shopping cart" : "Your wishlist"}<span className="heading-period">.</span></h1><p className="collection-lead">{type === "cart" ? "Your considered finds, all in one place." : "The things worth coming back for."}</p>{error && <div className="api-notice"><CircleHelp size={17}/><span>{error}</span></div>}{loading ? <div className="lab-loading"><LoaderCircle className="spin"/> Loading your collection…</div> : products.length ? <div className="collection-layout"><div className="collection-items">{products.map((p) => <article key={p._id} className="collection-item"><button onClick={() => onProduct(p)}><img src={imageFor(p)} alt={p.name}/></button><div><span>{p.category}</span><button className="collection-name" onClick={() => onProduct(p)}>{p.name}</button><b>{money(p.price)}</b></div><button className="remove-btn" onClick={() => remove(p)} aria-label={`Remove ${p.name}`}><X size={17}/></button></article>)}</div><aside className="order-card"><span className="eyebrow muted">ORDER SUMMARY</span><div><span>Items</span><b>{products.length}</b></div><div><span>Subtotal</span><b>{money(total)}</b></div><div><span>Shipping</span><b className="free-label">Complimentary</b></div><hr/><div className="order-total"><span>Total</span><b>{money(total)}</b></div>{type === "cart" && <button className="primary-btn checkout-btn" onClick={checkout}>Simulated checkout <ArrowRight size={16}/></button>}<p>This project uses a simulated checkout for demonstration.</p></aside></div> : <div className="empty-state"><ShoppingBag size={25}/><h3>{type === "cart" ? "Your cart is taking a breather." : "Nothing saved just yet."}</h3><p>Explore the collection and add something that feels right.</p><button className="primary-btn" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Explore products <ArrowRight size={15}/></button></div>}</section>;
}
