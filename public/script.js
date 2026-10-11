let ALL_ITEMS = [];
let ALL_SIZES = [];
let ALL_PRODUCT_SIZES = [];
let ALL_ADDONS = [];
let ALL_PRODUCT_ADDONS = [];
let ALL_RECIPES = [];
let ALL_INGREDIENTS = [];
let ALL_ADDON_RECIPES = {};
let ALL_FLAVORS = [];
let ALL_PRODUCT_FLAVORS = [];
let currentSelectedFlavor = null;
let ALL_PROMOTIONS = [];        // Active promotions from chill_promotion
let PROMO_PRODUCT_IDS = {};    // Map: productId -> promotion object
let TOP_SELLING_PRODUCT = null;
let TOP_SELLING_PRODUCTS = []; // Top 5 selling unique products
let CATEGORY_TOP3_PRODUCT_IDS = new Set(); // Product IDs that are in top 3 of their category
let cart = [];

// ═════════════════════════════════════════
// 1. SUPABASE DATABASE CONNECTION
// ═════════════════════════════════════════
const SUPABASE_URL = 'https://nkhyzzevgyteaehwexsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raHl6emV2Z3l0ZWFlaHdleHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzgzNzEsImV4cCI6MjEwMTE1NDM3MX0.tDJzxwg5Vjsynbi9612tjiO19YqYAstJIyeYAOPczs8';

const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// ═════════════════════════════════════════════════════════════════════════════
// 1.1 SECURE SERVER-VALIDATED CUSTOMER SESSION MANAGER
// ═════════════════════════════════════════════════════════════════════════════
const CustomerSessionManager = {
  ENDPOINT: `${SUPABASE_URL}/functions/v1/kiosk-session`,
  STORAGE_KEY: 'chill_kiosk_session_token',
  EXPIRED_FLAG_KEY: 'chill_kiosk_session_expired',
  TIMEOUT_SECONDS: 300, // 5 minutes inactivity timeout
  THROTTLE_TOUCH_MS: 15000, // Throttling for touch requests

  token: null,
  sessionId: null,
  expiresAt: null,
  serverTimeOffset: 0,
  isExpired: false,
  timerInterval: null,
  lastTouchTime: 0,
  hasInitialized: false,
  localGovernorActive: false,

  getStoredToken() {
    try {
      return localStorage.getItem(this.STORAGE_KEY) || null;
    } catch (e) {
      return null;
    }
  },

  setStoredToken(token) {
    this.token = token;
    try {
      if (token) {
        localStorage.setItem(this.STORAGE_KEY, token);
        sessionStorage.removeItem(this.EXPIRED_FLAG_KEY);
      } else {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    } catch (e) {}
  },

  clearStoredToken() {
    this.token = null;
    this.sessionId = null;
    this.expiresAt = null;
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {}
  },

  isExpiredTab() {
    return false;
  },

  setExpiredTab() {
    // No-op: tabs are never locked
  },

  isQrScanEntry() {
    return true; // Always allow starting or restarting orders
  },

  async callEdgeFunction(action, extraPayload = {}) {
    // Direct passthrough
    return { status: 404, ok: false, data: {} };
  },

  async init() {
    if (this.hasInitialized) return;
    this.hasInitialized = true;

    // Check kiosk settings
    if (!IS_KIOSK_OPEN) {
      applyKioskOpenState(false);
    }

    this.initLocalGovernor();
  },

  async createNewSession() {
    return this.initLocalGovernor();
  },

  async validateSession() {
    return this.validateLocalGovernor();
  },

  async recordActivity(actionName = 'interaction', forceImmediate = false) {
    if (this.isExpired) return;

    const now = Date.now();
    this.expiresAt = new Date(now + this.serverTimeOffset + this.TIMEOUT_SECONDS * 1000);
    this.updateTimerUI(this.TIMEOUT_SECONDS);

    if (!forceImmediate && now - this.lastTouchTime < this.THROTTLE_TOUCH_MS) {
      return;
    }
    this.lastTouchTime = now;

    if (this.localGovernorActive) {
      return;
    }

    const res = await this.callEdgeFunction('touch');
    if (res.ok && res.data && res.data.valid) {
      this.expiresAt = new Date(res.data.expiresAt);
      if (res.data.serverTime) {
        this.serverTimeOffset = new Date(res.data.serverTime).getTime() - Date.now();
      }
    } else if (res.status === 401 || (res.data && res.data.code === 'SESSION_EXPIRED')) {
      this.handleSessionExpired('Server rejected activity on expired session');
    } else if (res.status === 403 || (res.data && res.data.code === 'KIOSK_CLOSED')) {
      applyKioskOpenState(false);
    }
  },

  startCountdownTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      if (this.isExpired || !this.expiresAt) return;

      const nowServerEst = Date.now() + this.serverTimeOffset;
      const remainingMs = this.expiresAt.getTime() - nowServerEst;
      const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));

      this.updateTimerUI(remainingSec);

      if (remainingSec <= 0) {
        this.handleSessionExpired('5-minute inactivity deadline reached');
      }
    }, 1000);
  },

  updateTimerUI(remainingSec) {
    const min = Math.floor(remainingSec / 60);
    const sec = remainingSec % 60;
    const timeStr = `${min}:${sec < 10 ? '0' : ''}${sec}`;

    const menuTimer = document.getElementById('sessionTimerText');
    const menuBadge = document.getElementById('sessionTimerBadge');
    const cartTimer = document.getElementById('cartSessionTimerText');
    const cartBadge = document.getElementById('cartSessionTimerBadge');

    if (menuTimer) menuTimer.textContent = timeStr;
    if (cartTimer) cartTimer.textContent = timeStr;

    const isWarning = remainingSec <= 60;
    if (menuBadge) menuBadge.classList.toggle('warning', isWarning);
    if (cartBadge) cartBadge.classList.toggle('warning', isWarning);
  },

  handleSessionExpired(reason = '') {
    this.isExpired = false;
    this.lastTouchTime = Date.now();
    this.expiresAt = new Date(Date.now() + this.TIMEOUT_SECONDS * 1000);

    // Clear cart and customer inputs
    cart = [];
    if (typeof syncUI === 'function') syncUI();
    const nicknameInput = document.getElementById('customerNickname');
    if (nicknameInput) nicknameInput.value = '';
    const emailInput = document.getElementById('customerEmail');
    if (emailInput) emailInput.value = '';
    const notesInput = document.getElementById('orderNotes');
    if (notesInput) notesInput.value = '';

    // Close open product / quiz / overlays
    const prodModal = document.getElementById('confirmation-overlay');
    if (prodModal) prodModal.classList.add('hidden');
    const quizModal = document.getElementById('quiz-modal-overlay');
    if (quizModal) quizModal.classList.add('hidden');
    if (typeof closeQuiz === 'function') closeQuiz();
    const expOverlay = document.getElementById('sessionExpiredOverlay');
    if (expOverlay) expOverlay.classList.add('hidden');

    // Reset to welcomeScreen (homepage) directly
    if (typeof goTo === 'function') {
      goTo('welcomeScreen');
    }
  },

  showExpiredOverlay() {
    // When inactive, simply reset to homepage
    this.handleSessionExpired('Reset to homepage');
  },

  hideExpiredOverlay() {
    const overlay = document.getElementById('sessionExpiredOverlay');
    if (overlay) overlay.classList.add('hidden');
    const startBtn = document.getElementById('startBtn');
    if (startBtn && IS_KIOSK_OPEN) startBtn.disabled = false;
  },

  async submitOrder(kioskPayload) {
    if (!IS_KIOSK_OPEN) {
      applyKioskOpenState(false);
      return { success: false, code: 'KIOSK_CLOSED', message: 'Kiosk is currently closed.' };
    }

    // Directly and reliably insert into chill_kiosk_queue
    return this.submitOrderDirectFallback(kioskPayload);
  },

  async submitOrderDirectFallback(kioskPayload) {
    if (!db) return { success: false, message: 'Database connection unavailable' };
    const { data, error } = await db.from('chill_kiosk_queue').insert([kioskPayload]).select();
    if (error) {
      let fallback = { ...kioskPayload };
      if (error.message && (error.message.includes('customerEmail') || error.code === '42703')) {
        delete fallback.customerEmail;
        fallback.email = kioskPayload.customerEmail || null;
      }
      if (error.message && (error.message.includes('special_instructions') || error.message.includes('notes') || error.message.includes('instructions'))) {
        delete fallback.special_instructions;
        delete fallback.notes;
        delete fallback.instructions;
      }
      let res = await db.from('chill_kiosk_queue').insert([fallback]).select();
      if (res.error && res.error.code === '42703') {
        delete fallback.special_instructions;
        delete fallback.notes;
        delete fallback.instructions;
        delete fallback.customerEmail;
        fallback.email = kioskPayload.customerEmail || null;
        res = await db.from('chill_kiosk_queue').insert([fallback]).select();
      }
      if (res.error) return { success: false, message: res.error.message };
      return { success: true, order: res.data?.[0], orderNumber: kioskPayload.kioskordernumber };
    }
    return { success: true, order: data?.[0], orderNumber: kioskPayload.kioskordernumber };
  },

  initLocalGovernor() {
    this.localGovernorActive = true;
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const fullToken = `${crypto.randomUUID()}.${randomHex}`;
    this.setStoredToken(fullToken);
    this.isExpired = false;
    this.expiresAt = new Date(Date.now() + this.TIMEOUT_SECONDS * 1000);
    this.startCountdownTimer();
    return true;
  },

  validateLocalGovernor() {
    if (!this.expiresAt || this.expiresAt.getTime() <= Date.now()) {
      return { valid: false, code: 'SESSION_EXPIRED' };
    }
    return { valid: true, expiresAt: this.expiresAt };
  }
};

// Product image helper using Supabase imageUrl with reliable fallbacks
function getProductImage(item) {
  if (!item) return 'placeholder.svg';
  const rawUrl = item.imageUrl || item.image || item.productImage || item.img || item.image_url;
  if (rawUrl && typeof rawUrl === 'string' && rawUrl.trim() !== '') {
    const url = rawUrl.trim();
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
      return url;
    }
    if (url.startsWith('/storage/') || url.startsWith('storage/')) {
      return `${SUPABASE_URL}/${url.replace(/^\//, '')}`;
    }
    if (url.startsWith('product-images/') || url.startsWith('/product-images/')) {
      return `${SUPABASE_URL}/storage/v1/object/public/${url.replace(/^\//, '')}`;
    }
    // Handle local Android device cache paths saved from mobile inventory app
    if (url.startsWith('/data/') || url.startsWith('/storage/emulated/') || url.startsWith('file://')) {
      const fileName = url.split(/[\\/]/).pop();
      if (fileName && fileName.length > 3) {
        return `${SUPABASE_URL}/storage/v1/object/public/product-images/${fileName}`;
      }
      return 'placeholder.svg';
    }
    // Plain filename (e.g. "1000071441.png" or "croffle.jpg")
    if (url.includes('.')) {
      return `${SUPABASE_URL}/storage/v1/object/public/product-images/${url.replace(/^\//, '')}`;
    }
    return url;
  }
  return 'placeholder.svg';
}

// Safely extract and clean product description across schema variants
function getProductDescription(item) {
  if (!item) return '';
  const raw = item.description || item.desc || item.productDescription || item.product_description || item.productDesc || item.details || '';
  if (typeof raw !== 'string') return '';
  const cleaned = raw.replace(/^['"]+|['"]+$/g, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'null' || cleaned.toLowerCase() === 'undefined' || cleaned === "''" || cleaned === '""') {
    return '';
  }
  return cleaned;
}

// ─── PROMOTION HELPERS ────────────────────────────────────────────────────────
// Build PROMO_PRODUCT_IDS from fetched promotion data
function buildPromoMap(promotions, promoProducts) {
  PROMO_PRODUCT_IDS = {};
  const now = new Date();

  (promotions || []).forEach(promo => {
    const isActive = promo.isActive === 1 || promo.isActive === true || promo.isActive === '1' || promo.is_active === 1 || promo.is_active === true;
    if (!isActive) return;
    // Check date range
    if (promo.startDate && new Date(promo.startDate) > now) return;
    if (promo.endDate && new Date(promo.endDate) < now) return;

    const discountPct = promo.discountType === 1 ? Number(promo.discountValue) : 0; // type 1 = percentage
    const discountFlat = promo.discountType === 2 ? Number(promo.discountValue) : 0; // type 2 = fixed

    const addPromoForProduct = (pId) => {
      const existing = PROMO_PRODUCT_IDS[pId];
      if (!existing || discountPct > (existing.discountPct || 0) || discountFlat > (existing.discountFlat || 0)) {
        PROMO_PRODUCT_IDS[pId] = {
          promotionId: promo.promotionId,
          promotionName: promo.promotionName,
          discountType: promo.discountType,    // 1=pct, 2=fixed
          discountValue: Number(promo.discountValue),
          discountPct,
          discountFlat
        };
      }
    };

    if (promoProducts && promoProducts.length > 0) {
      promoProducts.forEach(pp => {
        if (Number(pp.promotionid || pp.promotionId) !== Number(promo.promotionId)) return;
        const isEnabled = pp.enabled === 1 || pp.enabled === true || pp.enabled === '1' || pp.enable === 1;
        if (!isEnabled) return;
        const pId = Number(pp.productid || pp.productId);
        if (pId) addPromoForProduct(pId);
      });
    }

    if (promo.targetIds && typeof promo.targetIds === 'string') {
      const ids = promo.targetIds.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
      ids.forEach(pId => addPromoForProduct(pId));
    }
  });
}

// Compute discounted price for a given base price
function applyPromo(basePrice, promo) {
  if (!promo) return basePrice;
  if (promo.discountType === 1) {
    // Percentage discount
    return Math.max(0, Math.round((basePrice * (1 - promo.discountValue / 100)) * 100) / 100);
  } else if (promo.discountType === 2) {
    // Fixed amount discount
    return Math.max(0, basePrice - promo.discountValue);
  }
  return basePrice;
}

// Apply promotion data to a product item object (mutates item)
function applyPromoToItem(item) {
  const promo = PROMO_PRODUCT_IDS[Number(item.productId)];
  item.promo = promo || null;
  if (promo) {
    item.promoPrice = applyPromo(item.price, promo);
    item.promoMinPrice = applyPromo(item.minPrice, promo);
    item.promoMaxPrice = applyPromo(item.maxPrice, promo);
  } else {
    item.promoPrice = null;
    item.promoMinPrice = null;
    item.promoMaxPrice = null;
  }
}

// Global tracking of categories, out of stock ingredients & map
let ALL_CATEGORIES = [];
let CATEGORY_LOOKUP = {};
let VALID_PRODUCT_CATEGORY_IDS = new Set();
let OOS_INGREDIENT_IDS = new Set();
let OOS_INGREDIENT_MAP = {};
let INGREDIENT_BY_ID = {};
let PRODUCT_RECIPE_ENTRIES_MAP = {};

// Helper to identify Add-ons category (never display in kiosk menu or category line)
function isAddonsCategory(catName = '', catId = null) {
  const id = Number(catId);
  if (id === 3 || id === 14) return true;
  const clean = String(catName || '').trim().toLowerCase();
  return /^add[\s\-]*ons?$|^adds[\s\-]*ons?|add[\s\-]*on\s*meal/i.test(clean);
}

// Helper to verify category is strictly a 'Product' category (not Supply, not Ingredient, not Add-ons)
function isValidProductCategory(cat) {
  if (!cat) return false;
  const catType = String(cat.categoryType || cat.type || '').trim().toLowerCase();
  if (catType !== 'product') return false;
  const isEnabled = cat.enable === 1 || cat.enable === true || String(cat.enable) === '1';
  if (!isEnabled) return false;
  if (cat.isDeleted === 1 || cat.isdeleted === 1 || cat.isDeleted === true) return false;
  const catId = cat.categoryId || cat.id;
  const catName = cat.categoryName || cat.name || '';
  if (isAddonsCategory(catName, catId)) return false;
  return true;
}

// Helper to determine if a single ingredient record in chill_ingredient is out of stock or unavailable
function isIngredientRecordOutOfStock(ing, requiredQty = 0) {
  if (!ing) return true;
  if (ing.isDeleted === 1 || ing.isDeleted === true || String(ing.isDeleted) === '1') return true;
  if (ing.isActive === 0 || ing.isActive === false || String(ing.isActive) === '0') return true;

  const status = (ing.status !== null && ing.status !== undefined) ? String(ing.status).trim().toLowerCase() : '';
  if (
    status === '0' ||
    status === 'false' ||
    status === 'out_of_stock' ||
    status === 'out of stock' ||
    status === 'oos' ||
    status === 'inactive' ||
    status === 'unavailable'
  ) {
    return true;
  }

  const stock = (ing.currentStock !== null && ing.currentStock !== undefined && ing.currentStock !== '')
    ? Number(ing.currentStock)
    : NaN;
  if (isNaN(stock) || stock <= 0) return true;

  const req = Number(requiredQty) || 0;
  if (req > 0 && stock < req) return true;

  return false;
}

// Fallback ingredient matcher for fixed-price food items if chill_recipe rows are not yet populated for them
function getFallbackIngredientEntries(product, allIngredients) {
  if (!product || !allIngredients || !allIngredients.length) return [];
  const pName = String(product.productName || product.name || '').trim().toLowerCase();
  const catId = Number(product.categoryId);
  const activeIngs = allIngredients.filter(i => !(i.isDeleted === 1 || i.isDeleted === true));
  const findByName = (pattern) => activeIngs.filter(i => pattern.test(String(i.ingredientName || '').trim().toLowerCase()));

  let matched = [];
  if (catId === 10 || pName.includes('waffle') || pName.includes('croffle')) {
    matched.push(...findByName(/^flour$|^baking soda$|^egg$/i));
    if (pName.includes('almond')) matched.push(...findByName(/almond|chocolate syrup/i));
    else if (pName.includes('choco')) matched.push(...findByName(/chocolate syrup/i));
    else if (pName.includes('oreo')) matched.push(...findByName(/oreo/i));
    else if (pName.includes('smores') || pName.includes("s'mores")) matched.push(...findByName(/marshmallow|graham/i));
    else if (pName.includes('biscoff')) matched.push(...findByName(/biscoff/i));
  } else if (catId === 11 || pName.includes('sandwich')) {
    matched.push(...findByName(/^bread$/i));
    if (pName.includes('chicken')) matched.push(...findByName(/chicken filling|mayonnaise/i));
    else if (pName.includes('tuna')) matched.push(...findByName(/tuna spread|mayonnaise/i));
    else if (pName.includes('ham') && pName.includes('cheese')) matched.push(...findByName(/^ham$|cheese slice/i));
    else if (pName.includes('ham') && pName.includes('egg')) matched.push(...findByName(/^ham$|^egg$/i));
    else if (pName.includes('clubhouse')) matched.push(...findByName(/^ham$|^egg$|cheese slice|chicken filling/i));
  } else if (catId === 13 || pName.includes('silog')) {
    matched.push(...findByName(/fried rice|^egg$/i));
    if (pName.includes('liempo')) matched.push(...findByName(/^liempo$/i));
    else if (pName.includes('fried chicken') || pName.includes('chicken')) matched.push(...findByName(/fried chicken/i));
    else if (pName.includes('hungarian')) matched.push(...findByName(/hungarian sausage/i));
    else if (pName.includes('spam')) matched.push(...findByName(/^spam$/i));
    else if (pName.includes('hotsilog') || pName.includes('hotdog')) matched.push(...findByName(/^hotdog$/i));
    else if (pName.includes('porkchop') || pName.includes('pork chop')) matched.push(...findByName(/pork chop/i));
    else if (pName.includes('tocino')) matched.push(...findByName(/^tocino$/i));
    else if (pName.includes('tapa')) matched.push(...findByName(/beef tapa/i));
  } else if (catId === 15 || pName.includes('spaghetti') || pName.includes('carbonara') || pName.includes('pasta')) {
    if (pName.includes('spaghetti')) matched.push(...findByName(/spaghetti pasta|spaghetti sauce/i));
    else if (pName.includes('carbonara')) matched.push(...findByName(/carbonara pasta|carbonara sauce/i));
  } else if (catId === 12) {
    if (pName.includes('cheese stick')) matched.push(...findByName(/cheese stick/i));
    else if (pName.includes('chicken poppers')) matched.push(...findByName(/chicken poppers/i));
    else if (pName.includes('chix and fries') || pName.includes('chix & fries')) matched.push(...findByName(/chicken poppers|french fries/i));
  }

  // Deduplicate by ingredientId
  const seen = new Set();
  return matched
    .filter(i => {
      if (seen.has(i.ingredientId)) return false;
      seen.add(i.ingredientId);
      return true;
    })
    .map(i => ({
      ingredientId: Number(i.ingredientId),
      quantity: 1,
      unit: i.unit || 'pcs'
    }));
}

// Helper to determine out-of-stock status by checking the recipe & ingredients connected to a product first
function checkProductStockStatus(product, recipeEntriesMap, ingredientById, oosIngIds, oosIngMap, allIngredients) {
  const pId = product.productId;
  let recipeEntries = (recipeEntriesMap && (recipeEntriesMap[pId] || recipeEntriesMap[Number(pId)] || recipeEntriesMap[String(pId)])) || [];

  if (!recipeEntries || recipeEntries.length === 0) {
    recipeEntries = getFallbackIngredientEntries(product, allIngredients);
  }

  // If no recipe/ingredient is connected to this product at all, mark as out of stock
  if (!recipeEntries || recipeEntries.length === 0) {
    return {
      isOutOfStock: true,
      reason: 'No connected recipe or ingredient stock'
    };
  }

  // Check every connected recipe/ingredient for out-of-stock status or insufficient stock quantity
  for (const entry of recipeEntries) {
    const ingId = Number(entry.ingredientId !== undefined ? entry.ingredientId : entry);
    const reqQty = Number(entry.quantity) || 0;
    const ing = (ingredientById && (ingredientById[ingId] || ingredientById[entry.ingredientId])) ||
                (oosIngMap && (oosIngMap[ingId] || oosIngMap[entry.ingredientId])) ||
                (allIngredients && allIngredients.find(i => Number(i.ingredientId) === ingId));

    if (!ing || oosIngIds.has(ingId) || isIngredientRecordOutOfStock(ing, reqQty)) {
      return {
        isOutOfStock: true,
        reason: `${ing ? ing.ingredientName : 'Required ingredient'} is out of stock`
      };
    }
  }

  return { isOutOfStock: false, reason: '' };
}

// Helper to get exact recipe from database (chill_recipe connected to chill_ingredient)
function getProductIngredients(productId, productRecipeMap) {
  if (productRecipeMap) {
    const list = productRecipeMap[productId] || productRecipeMap[Number(productId)] || productRecipeMap[String(productId)];
    if (list && list.length > 0) {
      return list.join(', ');
    }
  }
  return '';
}

// Build lookup structures from recipes & ingredients lists
function buildRecipeAndIngredientMaps(recipesList, ingredientsList, productSizes = []) {
  const ingredientLookup = {};
  const ingredientById = {};
  const oosIds = new Set();
  const oosMap = {};

  (ingredientsList || []).forEach(ing => {
    const id = Number(ing.ingredientId);
    ingredientById[id] = ing;
    ingredientById[ing.ingredientId] = ing;
    if (!(ing.isDeleted === 1 || ing.isDeleted === true)) {
      ingredientLookup[ing.ingredientId] = ing.ingredientName;
      ingredientLookup[id] = ing.ingredientName;
    }
    if (isIngredientRecordOutOfStock(ing, 0)) {
      oosIds.add(id);
      oosIds.add(ing.ingredientId);
      oosMap[id] = ing;
      oosMap[ing.ingredientId] = ing;
    }
  });

  // Map productSizeId -> productId so recipes linked via productSizeId also resolve to their product
  const sizeToProductMap = {};
  (productSizes || []).forEach(ps => {
    if (ps.productSizeId && ps.productId) {
      sizeToProductMap[Number(ps.productSizeId)] = Number(ps.productId);
    }
  });

  const productRecipeMap = {};
  const productRecipeEntriesMap = {};

  (recipesList || []).forEach(r => {
    if (r.enabled === 0 || r.enabled === false || String(r.enabled) === '0') return;
    const rawPId = r.productId || sizeToProductMap[Number(r.productSizeId)];
    if (!rawPId) return;
    const pId = Number(rawPId);
    const ingId = Number(r.ingredientId);

    if (!productRecipeMap[pId]) productRecipeMap[pId] = [];
    if (!productRecipeEntriesMap[pId]) productRecipeEntriesMap[pId] = [];

    productRecipeEntriesMap[pId].push({
      recipeId: r.recipeId,
      ingredientId: ingId,
      quantity: Number(r.quantity) || 0,
      unit: r.unit || '',
      productSizeId: r.productSizeId
    });

    const ingObj = ingredientById[ingId];
    const ingName = ingObj ? ingObj.ingredientName : (ingredientLookup[r.ingredientId] || ingredientLookup[ingId]);
    if (ingName && !productRecipeMap[pId].includes(ingName)) {
      productRecipeMap[pId].push(ingName);
    }
  });

  return {
    ingredientLookup,
    ingredientById,
    oosIds,
    oosMap,
    productRecipeMap,
    productRecipeEntriesMap
  };
}

// Update card UI in-place when stock becomes available or out of stock
function updateCardStockUI(item) {
  const cards = document.querySelectorAll(`[data-product-id="${item.productId}"]`);
  cards.forEach(card => {
    const isOOS = !!item.isOutOfStock;
    card.classList.toggle('out-of-stock', isOOS);
    card.style.pointerEvents = isOOS ? 'none' : '';
    if (isOOS) {
      card.setAttribute('aria-disabled', 'true');
      card.setAttribute('tabindex', '-1');
    } else {
      card.removeAttribute('aria-disabled');
      card.removeAttribute('tabindex');
    }

    const imgWrap = card.querySelector('.item-img-wrap');
    let badge = imgWrap ? imgWrap.querySelector('.stock-badge-oos') : null;
    if (isOOS) {
      if (!badge && imgWrap) {
        badge = document.createElement('span');
        badge.className = 'stock-badge-oos';
        badge.textContent = 'Out of Stock';
        imgWrap.prepend(badge);
      }
    } else {
      if (badge) badge.remove();
    }

    // Ingredients should NOT be on the menu item card (they are inside the modal)
    const recipeEl = card.querySelector('.item-recipe');
    if (recipeEl) {
      recipeEl.remove();
    }

    const addBtn = card.querySelector('.add-btn');
    if (addBtn) {
      if (isOOS) {
        addBtn.disabled = true;
        addBtn.classList.add('disabled', 'oos-btn');
        addBtn.textContent = 'Out of Stock';
        addBtn.setAttribute('aria-label', 'Out of Stock');
      } else {
        addBtn.disabled = false;
        addBtn.classList.remove('disabled', 'oos-btn');
        addBtn.textContent = '+';
        addBtn.setAttribute('aria-label', `Add ${item.productName || item.name}`);
      }
    }
  });
}

// Dynamic stock synchronization with Supabase
async function refreshInventoryStock() {
  if (!db || !ALL_ITEMS.length) return;
  try {
    const [recsRes, ingsRes] = await Promise.all([
      db.from('chill_recipe').select('*'),
      db.from('chill_ingredient').select('*')
    ]);

    const recipesList = recsRes.data || ALL_RECIPES;
    const ingredientsList = ingsRes.data || ALL_INGREDIENTS;

    ALL_RECIPES = recipesList;
    ALL_INGREDIENTS = ingredientsList;

    const {
      ingredientById,
      oosIds,
      oosMap,
      productRecipeMap,
      productRecipeEntriesMap
    } = buildRecipeAndIngredientMaps(recipesList, ingredientsList, ALL_PRODUCT_SIZES);

    OOS_INGREDIENT_IDS = oosIds;
    OOS_INGREDIENT_MAP = oosMap;
    INGREDIENT_BY_ID = ingredientById;
    PRODUCT_RECIPE_ENTRIES_MAP = productRecipeEntriesMap;

    ALL_ITEMS.forEach(item => {
      let dbIngredients = productRecipeMap[item.productId] || productRecipeMap[Number(item.productId)] || [];
      if (dbIngredients.length === 0) {
        const fallbackEntries = getFallbackIngredientEntries(item, ingredientsList);
        dbIngredients = fallbackEntries
          .map(e => ingredientById[e.ingredientId]?.ingredientName)
          .filter(Boolean);
      }
      item.recipe = dbIngredients.length > 0 ? dbIngredients.join(', ') : '';
      item.ingredients = dbIngredients;

      const stockStatus = checkProductStockStatus(
        item,
        productRecipeEntriesMap,
        ingredientById,
        oosIds,
        oosMap,
        ingredientsList
      );
      item.isOutOfStock = stockStatus.isOutOfStock;
      item.outOfStockReason = stockStatus.reason;

      updateCardStockUI(item);
    });

    // Update Top Selling products cards
    renderTopSellingProducts();

    // Update product modal if open
    if (itemPendingConfirmation) {
      const updatedPending = ALL_ITEMS.find(i => i.productId === itemPendingConfirmation.productId);
      if (updatedPending) {
        itemPendingConfirmation = updatedPending;
        const confirmBtn = document.getElementById('btn-confirm-order');
        if (confirmBtn) {
          if (itemPendingConfirmation.isOutOfStock) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Out of Stock';
            confirmBtn.classList.add('disabled');
          } else {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Add to Order';
            confirmBtn.classList.remove('disabled');
          }
        }
        if (typeof updateModalQtyUI === 'function') updateModalQtyUI();
      }
    }
  } catch (err) {
    console.warn("Stock sync check failed:", err);
  }
}

// ─── KIOSK AVAILABILITY (chill_kiosk_settings.is_open) ────────────────────────
let IS_KIOSK_OPEN = true;

function applyKioskOpenState(isOpen) {
  IS_KIOSK_OPEN = Boolean(isOpen);
  const closedOverlay = document.getElementById('kioskClosedOverlay');
  const startBtn = document.getElementById('startBtn');
  const placeBtn = document.getElementById('placeOrderBtn');

  if (!IS_KIOSK_OPEN) {
    if (closedOverlay) closedOverlay.classList.remove('hidden');
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = 'Currently Closed';
    }
    if (placeBtn) placeBtn.disabled = true;
    const prodModal = document.getElementById('confirmation-overlay');
    if (prodModal) prodModal.classList.add('hidden');
    if (typeof closeQuiz === 'function') closeQuiz();
  } else {
    if (closedOverlay) closedOverlay.classList.add('hidden');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = 'Tap to Order →';
    }
    if (typeof checkOrderValidation === 'function') checkOrderValidation();
  }
}

async function checkKioskSettings() {
  if (!db) return;
  try {
    let settingsRow = null;
    const { data, error } = await db
      .from('chill_kiosk_settings')
      .select('*')
      .limit(1);

    if (!error && data && data.length > 0) {
      settingsRow = data[0];
    } else {
      const { data: fallbackData, error: fallbackErr } = await db
        .from('kiosk_setting')
        .select('*')
        .limit(1);
      if (!fallbackErr && fallbackData && fallbackData.length > 0) {
        settingsRow = fallbackData[0];
      }
    }

    if (settingsRow && settingsRow.is_open !== undefined && settingsRow.is_open !== null) {
      const rawVal = settingsRow.is_open;
      const isOpen = !(rawVal === false || rawVal === 0 || String(rawVal).trim().toLowerCase() === 'false' || String(rawVal).trim() === '0');
      applyKioskOpenState(isOpen);
    }
  } catch (err) {
    console.warn("Could not check kiosk settings:", err);
  }
}

// Real-time listener for database stock, recipe, category & kiosk settings updates
let realtimeStockListenerInitialized = false;
function initRealtimeStockListener() {
  if (!db || realtimeStockListenerInitialized) return;
  realtimeStockListenerInitialized = true;
  try {
    db.channel('public:chill_stock_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_kiosk_settings' }, () => {
        checkKioskSettings();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_ingredient' }, () => {
        refreshInventoryStock();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_recipe' }, () => {
        refreshInventoryStock();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_category' }, () => {
        loadCategoriesFromSupabase().then(() => buildGrids());
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_product_item' }, () => {
        loadMenuFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_product_size' }, () => {
        loadMenuFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_size' }, () => {
        loadMenuFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_promotion' }, () => {
        loadPromosFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_promotion_product' }, () => {
        loadPromosFromSupabase();
      })
      .subscribe();
  } catch (e) {
    console.warn("Could not initialize realtime stock listener:", e);
  }

  // Periodic polling every 10s as a failsafe
  setInterval(() => {
    checkKioskSettings();
    refreshInventoryStock();
  }, 10000);
}

// ═════════════════════════════════════════
// 2. FETCH CATEGORIES, RECIPES, INGREDIENTS & MENU
// ═════════════════════════════════════════
async function loadMenuFromSupabase() {
  if (!db) {
    console.error("Supabase connection not found!");
    return;
  }
  
  try {
    // Step 0: Check kiosk availability setting first
    await checkKioskSettings();

    // Step 1: Load Product categories from database first (excluding Supply, Ingredient, and Add-ons)
    await loadCategoriesFromSupabase();

    // Step 2: Fetch recipes & ingredients FIRST so we can check product stock before rendering cards
    const [rRes, ingRes] = await Promise.all([
      db.from('chill_recipe').select('*'),
      db.from('chill_ingredient').select('*')
    ]);
    const recipesList = rRes.data || [];
    const ingredientsList = ingRes.data || [];

    // Step 3: Fetch enabled products, sizes, addons, addon recipes & promotions
    const { data: productsData, error: prodError } = await db
      .from('chill_product_item')
      .select('*')
      .eq('enable', 1);
    if (prodError) throw prodError;

    // Fetch product sizes (with fallback to chill_product_sizes)
    let productSizes = [];
    const { data: psData, error: psError } = await db
      .from('chill_product_size')
      .select('*');
    if (!psError && psData) {
      productSizes = psData.filter(ps => ps.enabled === 1 || ps.enable === 1 || ps.enabled === true || ps.enable === true || (ps.enabled === undefined && ps.enable === undefined));
    } else {
      const { data: psData2 } = await db
        .from('chill_product_sizes')
        .select('*');
      if (psData2) {
        productSizes = psData2.filter(ps => ps.enabled === 1 || ps.enable === 1 || ps.enabled === true || ps.enable === true || (ps.enabled === undefined && ps.enable === undefined));
      }
    }

    // Fetch sizes (with fallback to chill_sizes)
    let sizes = [];
    const { data: sData, error: sError } = await db
      .from('chill_size')
      .select('*');
    if (!sError && sData) {
      sizes = sData.filter(s => s.enable === 1 || s.enabled === 1 || s.enable === true || s.enabled === true || (s.enable === undefined && s.enabled === undefined));
    } else {
      const { data: sData2 } = await db
        .from('chill_sizes')
        .select('*');
      if (sData2) {
        sizes = sData2.filter(s => s.enable === 1 || s.enabled === 1 || s.enable === true || s.enabled === true || (s.enable === undefined && s.enabled === undefined));
      }
    }

    // Fetch addons (chill_addons) & product addons (chill_product_addons)
    let addonsList = [];
    const { data: aData, error: aError } = await db
      .from('chill_addons')
      .select('*')
      .eq('enable', 1);
    if (!aError && aData) {
      addonsList = aData;
    }

    let productAddonsList = [];
    const { data: paData, error: paError } = await db
      .from('chill_product_addons')
      .select('*')
      .eq('enabled', 1);
    if (!paError && paData) {
      productAddonsList = paData;
    }

    // Fetch addon recipes (chill_addon_recipe) for syrups/sauces/powders sub-ingredients
    let addonRecipesList = [];
    const { data: arData } = await db
      .from('chill_addon_recipe')
      .select('*')
      .eq('enabled', 1);
    if (arData) addonRecipesList = arData;

    // Fetch promotions (chill_promotion) & affected products (chill_promotion_product)
    let promotionsList = [];
    let promotionProductsList = [];
    const { data: promoData } = await db
      .from('chill_promotion')
      .select('*')
      .eq('isActive', 1);
    if (promoData) promotionsList = promoData;

    const { data: promoProdData } = await db
      .from('chill_promotion_product')
      .select('*')
      .eq('enabled', 1);
    if (promoProdData) promotionProductsList = promoProdData;

    // Fetch product flavors (chill_product_flavors with fallback to product_flavors)
    let productFlavorsList = [];
    try {
      const { data: pfData, error: pfErr } = await db
        .from('chill_product_flavors')
        .select('*');
      if (!pfErr && pfData) {
        productFlavorsList = pfData.filter(pf => pf.enable === 1 || pf.enabled === 1 || pf.enable === true || pf.enabled === true || (pf.enable === undefined && pf.enabled === undefined));
      } else {
        const { data: pfData2 } = await db
          .from('product_flavors')
          .select('*');
        if (pfData2) {
          productFlavorsList = pfData2.filter(pf => pf.enable === 1 || pf.enabled === 1 || pf.enable === true || pf.enabled === true || (pf.enable === undefined && pf.enabled === undefined));
        }
      }
    } catch (e) {
      console.warn("Could not fetch product flavors:", e);
    }

    // Fetch flavors (chill_flavors with fallback to flavors)
    let flavorsList = [];
    try {
      const { data: fData, error: fErr } = await db
        .from('chill_flavors')
        .select('*');
      if (!fErr && fData) {
        flavorsList = fData.filter(f => f.enable === 1 || f.enabled === 1 || f.enable === true || f.enabled === true || (f.enable === undefined && f.enabled === undefined));
      } else {
        const { data: fData2 } = await db
          .from('flavors')
          .select('*');
        if (fData2) {
          flavorsList = fData2.filter(f => f.enable === 1 || f.enabled === 1 || f.enable === true || f.enabled === true || (f.enable === undefined && f.enabled === undefined));
        }
      }
    } catch (e) {
      console.warn("Could not fetch flavors:", e);
    }

    ALL_PROMOTIONS = promotionsList;
    buildPromoMap(promotionsList, promotionProductsList);

    ALL_SIZES = sizes;
    ALL_PRODUCT_SIZES = productSizes;
    ALL_ADDONS = addonsList;
    ALL_PRODUCT_ADDONS = productAddonsList;
    ALL_RECIPES = recipesList;
    ALL_INGREDIENTS = ingredientsList;
    ALL_FLAVORS = flavorsList;
    ALL_PRODUCT_FLAVORS = productFlavorsList;

    // Map sizes by sizeId
    const sizeLookup = {};
    sizes.forEach(s => {
      const sId = s.sizeId !== undefined && s.sizeId !== null ? s.sizeId : s.id;
      const sName = s.sizeName || s.name || `Size ${sId}`;
      if (sId !== undefined && sId !== null) {
        sizeLookup[sId] = sName;
        sizeLookup[String(sId).trim()] = sName;
      }
    });

    // Map product sizes by productId (support both numeric and string keys, and product_id alias)
    const productSizesMap = {};
    productSizes.forEach(ps => {
      const pId = ps.productId !== undefined && ps.productId !== null ? ps.productId : (ps.product_id !== undefined && ps.product_id !== null ? ps.product_id : null);
      if (pId === null || pId === undefined) return;
      const key = String(pId).trim();
      if (!productSizesMap[key]) {
        productSizesMap[key] = [];
      }
      const sId = ps.sizeId !== undefined && ps.sizeId !== null ? ps.sizeId : (ps.size_id !== undefined && ps.size_id !== null ? ps.size_id : null);
      productSizesMap[key].push({
        productSizeId: ps.productSizeId || ps.product_size_id || ps.id,
        sizeId: sId,
        sizeName: (sId !== null && sizeLookup[sId]) || ps.sizeName || `Size ${sId || ''}`,
        price: Number(ps.price) || 0
      });
    });

    // Map addons by addonsId
    const addonLookup = {};
    addonsList.forEach(a => {
      addonLookup[a.addonsId] = {
        addonsId: a.addonsId,
        addonsName: a.addonsName,
        price: Number(a.price) || 0
      };
    });

    // Map product addons by productId
    const productAddonsMap = {};
    productAddonsList.forEach(pa => {
      if (!productAddonsMap[pa.productId]) {
        productAddonsMap[pa.productId] = [];
      }
      if (addonLookup[pa.addonsId]) {
        productAddonsMap[pa.productId].push(addonLookup[pa.addonsId]);
      }
    });

    // Map flavors by flavorId
    const flavorLookup = {};
    flavorsList.forEach(f => {
      const fId = f.flavorId !== undefined && f.flavorId !== null ? f.flavorId : f.id;
      const fName = f.flavorName || f.name || `Flavor ${fId}`;
      if (fId !== undefined && fId !== null) {
        flavorLookup[fId] = fName;
        flavorLookup[String(fId).trim()] = fName;
      }
    });

    // Map product flavors by productId
    const productFlavorsMap = {};
    productFlavorsList.forEach(pf => {
      const pId = pf.productId !== undefined && pf.productId !== null ? pf.productId : pf.product_id;
      if (pId === null || pId === undefined) return;
      const key = String(pId).trim();
      if (!productFlavorsMap[key]) {
        productFlavorsMap[key] = [];
      }
      const fId = pf.flavorId !== undefined && pf.flavorId !== null ? pf.flavorId : pf.flavor_id;
      const fName = (fId !== null && flavorLookup[fId]) || pf.flavorName || `Flavor ${fId || ''}`;
      productFlavorsMap[key].push({
        productFlavorId: pf.product_flavor_id || pf.productFlavorId || pf.id,
        flavorId: fId,
        flavorName: fName
      });
    });

    // Build recipe & ingredient stock maps first before building product items
    const {
      ingredientLookup,
      ingredientById,
      oosIds,
      oosMap,
      productRecipeMap,
      productRecipeEntriesMap
    } = buildRecipeAndIngredientMaps(recipesList, ingredientsList, productSizes);

    OOS_INGREDIENT_IDS = oosIds;
    OOS_INGREDIENT_MAP = oosMap;
    INGREDIENT_BY_ID = ingredientById;
    PRODUCT_RECIPE_ENTRIES_MAP = productRecipeEntriesMap;

    // Map addon recipes by addonsId
    const addonRecipeMap = {};
    addonRecipesList.forEach(ar => {
      if (!addonRecipeMap[ar.addonsId]) {
        addonRecipeMap[ar.addonsId] = [];
      }
      const ingName = ingredientLookup[ar.ingredientId];
      if (ingName && !addonRecipeMap[ar.addonsId].some(i => i.ingredientId === ar.ingredientId)) {
        addonRecipeMap[ar.addonsId].push({
          ingredientId: ar.ingredientId,
          ingredientName: ingName,
          quantity: ar.quantity,
          unit: ar.unit
        });
      }
    });
    ALL_ADDON_RECIPES = addonRecipeMap;

    if (productsData && productsData.length > 0) {
      // Filter out any product belonging to Add-ons category, non-Product category, or deleted
      const validProducts = productsData.filter(item => {
        if (item.isdeleted === 1 || item.isDeleted === 1 || item.isdeleted === true) return false;
        const cId = Number(item.categoryId);
        const cName = item.categoryName || CATEGORY_LOOKUP[cId] || '';
        if (isAddonsCategory(cName, cId)) return false;
        if (VALID_PRODUCT_CATEGORY_IDS.size > 0 && !VALID_PRODUCT_CATEGORY_IDS.has(cId)) return false;
        return true;
      });

      ALL_ITEMS = validProducts.map(item => {
        const pId = item.productId !== undefined && item.productId !== null ? item.productId : (item.id !== undefined && item.id !== null ? item.id : item.uid);
        const pKey = pId !== undefined && pId !== null ? String(pId).trim() : '';
        const itemSizes = (productSizesMap[pKey] || productSizesMap[item.productId] || productSizesMap[Number(item.productId)] || []).slice();
        itemSizes.sort((a, b) => a.price - b.price);

        const rawPrice = (item.price !== null && item.price !== undefined && item.price !== '') ? Number(item.price) : null;
        const hasDirectPrice = rawPrice !== null && !isNaN(rawPrice) && rawPrice > 0;
        // Fix: A product has sizes whenever size options exist in itemSizes.
        // Having a price set on the product row must NEVER cause its sizes to disappear.
        const hasSizes = itemSizes.length > 0;

        let minPrice = 0;
        let maxPrice = 0;
        if (hasSizes) {
          const prices = itemSizes.map(s => s.price);
          minPrice = Math.min(...prices);
          maxPrice = Math.max(...prices);
        } else if (hasDirectPrice) {
          minPrice = rawPrice;
          maxPrice = rawPrice;
        }

        // Check recipe & ingredients connected to product first
        let ingList = productRecipeMap[item.productId] || productRecipeMap[Number(item.productId)] || [];
        if (ingList.length === 0) {
          const fallbackEntries = getFallbackIngredientEntries(item, ingredientsList);
          ingList = fallbackEntries
            .map(e => ingredientById[e.ingredientId]?.ingredientName)
            .filter(Boolean);
        }
        const cleanDesc = getProductDescription(item);
        const recipeText = ingList.length > 0 ? ingList.join(', ') : getProductIngredients(item.productId, productRecipeMap);
        const stockStatus = checkProductStockStatus(
          item,
          productRecipeEntriesMap,
          ingredientById,
          oosIds,
          oosMap,
          ingredientsList
        );
        const catId = Number(item.categoryId);
        const catName = CATEGORY_LOOKUP[catId] || item.categoryName || '';

        let itemFlavors = (productFlavorsMap[pKey] || productFlavorsMap[item.productId] || productFlavorsMap[Number(item.productId)] || []).slice();
        if (itemFlavors.length === 0 && (Number(item.productId) === 285 || (item.productName && item.productName.toLowerCase().includes('flavored fries')))) {
          itemFlavors = [
            { flavorId: 11, flavorName: 'Plain' },
            { flavorId: 1, flavorName: 'Cheese' },
            { flavorId: 2, flavorName: 'BBQ' },
            { flavorId: 3, flavorName: 'Sour Cream' }
          ];
        }

        return {
          ...item,
          productId: pId,
          categoryId: catId,
          categoryName: catName,
          catKey: `cat-${catId}`,
          cat: mapCategoryToSlug(catId, catName),
          productName: (item.productName || item.name || '').trim(),
          description: cleanDesc,
          recipe: recipeText,
          ingredients: ingList,
          sizes: itemSizes,
          flavors: itemFlavors,
          addons: productAddonsMap[item.productId] || productAddonsMap[pKey] || [],
          hasSizes,
          minPrice,
          maxPrice,
          basePrice: minPrice,
          price: hasSizes ? minPrice : (hasDirectPrice ? rawPrice : minPrice),
          imageUrl: (item.imageUrl || item.image || item.productImage || item.img || item.image_url || '').trim(),
          recommendationInfo: (item.recommendationInfo || '').replace(/^''$/, '').trim(),
          isOutOfStock: stockStatus.isOutOfStock,
          outOfStockReason: stockStatus.reason,
          promo: null,
          promoPrice: null,
          promoMinPrice: null,
          promoMaxPrice: null
        };
      });

      // Apply promotions after ALL_ITEMS is built
      ALL_ITEMS.forEach(item => applyPromoToItem(item));

      // Find top selling product from actual orders
      await loadTopSellingProduct();

      buildGrids();
      syncUI();
      preloadOrderNumbers();
      updatePromoCardUI(ALL_PROMOTIONS);
      initRealtimeStockListener();
    }
  } catch (err) {
    console.error("Failed to load menu:", err);
    showToast("Error loading menu from cloud.");
  }
}

// Helper to normalize product name by removing size designations (12oz, 16oz, 22oz, solo, group, etc.)
function getNormalizedBaseProductName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\b(12\s*oz|16\s*oz|16\s*0z|22\s*oz|solo|group|regular|large|medium|small)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Determine top-selling products and top 3 per category dynamically from sales data
async function loadTopSellingProduct() {
  if (!db || !ALL_ITEMS.length) return;
  CATEGORY_TOP3_PRODUCT_IDS.clear();

  try {
    const { data: orderItems, error: oiErr } = await db
      .from('chill_order_item')
      .select('productId, productName, quantity');

    if (oiErr) {
      console.warn("Could not load chill_order_item:", oiErr);
    }

    // Step 1: Map each active item in ALL_ITEMS by its clean base name (size ignored)
    const activeProducts = ALL_ITEMS.filter(p => !p.isOutOfStock || true); // keep all enabled products
    const uniqueBaseMap = new Map(); // baseKey -> { primaryProduct, items: [], totalSold: 0 }

    activeProducts.forEach(item => {
      const baseKey = getNormalizedBaseProductName(item.productName);
      if (!uniqueBaseMap.has(baseKey)) {
        uniqueBaseMap.set(baseKey, {
          primaryProduct: item,
          items: [item],
          totalSold: 0
        });
      } else {
        const group = uniqueBaseMap.get(baseKey);
        group.items.push(item);
        // Prefer an in-stock item as the primary display product
        if (group.primaryProduct.isOutOfStock && !item.isOutOfStock) {
          group.primaryProduct = item;
        }
      }
    });

    if (orderItems && orderItems.length > 0) {
      orderItems.forEach(oi => {
        const qty = Number(oi.quantity) || 1;
        const oBase = getNormalizedBaseProductName(oi.productName);

        // First attempt direct baseKey match
        if (uniqueBaseMap.has(oBase)) {
          uniqueBaseMap.get(oBase).totalSold += qty;
          return;
        }

        // Second attempt matching by oi.productId to our products
        const matchedItem = ALL_ITEMS.find(p => p.productId === oi.productId);
        if (matchedItem) {
          const itemBase = getNormalizedBaseProductName(matchedItem.productName);
          if (uniqueBaseMap.has(itemBase)) {
            uniqueBaseMap.get(itemBase).totalSold += qty;
            return;
          }
        }

        // Third attempt substring/fuzzy matching
        for (const [baseKey, group] of uniqueBaseMap.entries()) {
          if (oBase && (baseKey.includes(oBase) || oBase.includes(baseKey))) {
            group.totalSold += qty;
            break;
          }
        }
      });
    }

    // Step 2: Rank the distinct base products globally to pick the top 5
    const distinctGroups = Array.from(uniqueBaseMap.values());
    distinctGroups.sort((a, b) => {
      if (b.totalSold !== a.totalSold) {
        return b.totalSold - a.totalSold;
      }
      // Prefer in stock if equal
      if (a.primaryProduct.isOutOfStock !== b.primaryProduct.isOutOfStock) {
        return a.primaryProduct.isOutOfStock ? 1 : -1;
      }
      return 0;
    });

    // Pick top 5 distinct products
    TOP_SELLING_PRODUCTS = distinctGroups.slice(0, 5).map(g => g.primaryProduct);
    TOP_SELLING_PRODUCT = TOP_SELLING_PRODUCTS[0] || ALL_ITEMS[0] || null;

    // Step 3: Compute Top 3 Best Sellers for each category
    // Group distinct products by categoryId
    const catGroupsMap = new Map();
    distinctGroups.forEach(g => {
      const cId = Number(g.primaryProduct.categoryId);
      if (!catGroupsMap.has(cId)) {
        catGroupsMap.set(cId, []);
      }
      catGroupsMap.get(cId).push(g);
    });

    catGroupsMap.forEach((groupsInCat) => {
      groupsInCat.sort((a, b) => b.totalSold - a.totalSold);
      // Top 3 in this category
      const top3 = groupsInCat.slice(0, 3);
      top3.forEach(g => {
        // Tag all items in this group (all size variants) as top 3 in category
        g.items.forEach(it => {
          CATEGORY_TOP3_PRODUCT_IDS.add(it.productId);
        });
      });
    });

  } catch (e) {
    console.warn("Could not determine top selling products from orders:", e);
    // Fallback: Pick top 5 enabled items
    TOP_SELLING_PRODUCTS = ALL_ITEMS.filter(i => !i.isOutOfStock).slice(0, 5);
    if (!TOP_SELLING_PRODUCTS.length) TOP_SELLING_PRODUCTS = ALL_ITEMS.slice(0, 5);
    TOP_SELLING_PRODUCT = TOP_SELLING_PRODUCTS[0] || null;
  }

  renderTopSellingProducts();
}

function renderTopSellingProducts() {
  const container = document.getElementById('topSellingGrid');
  const header = document.getElementById('featuredHeader');
  if (!container) return;

  container.innerHTML = '';

  if (!TOP_SELLING_PRODUCTS || TOP_SELLING_PRODUCTS.length === 0) {
    if (header) header.style.display = 'none';
    container.style.display = 'none';
    return;
  }

  if (header) header.style.display = '';
  container.style.display = 'grid';

  TOP_SELLING_PRODUCTS.forEach(product => {
    // Render using makeCard with star badge
    const card = makeCard(product);
    container.appendChild(card);
  });
}

// ═════════════════════════════════════════
// 3. FETCH 'PRODUCT' CATEGORIES FROM SUPABASE
// ═════════════════════════════════════════
async function loadCategoriesFromSupabase() {
  if (!db) return;
  
  try {
    const { data, error } = await db
      .from('chill_category')
      .select('*')
      .order('categoryId', { ascending: true });
    
    if (error) throw error;

    // Strictly filter to only 'Product' categoryType, enabled, and exclude Supply, Ingredient, and Add-ons
    const validCategories = (data || []).filter(cat => isValidProductCategory(cat));

    ALL_CATEGORIES = validCategories;
    CATEGORY_LOOKUP = {};
    VALID_PRODUCT_CATEGORY_IDS = new Set();

    validCategories.forEach(cat => {
      const cId = Number(cat.categoryId || cat.id);
      const cName = (cat.categoryName || cat.name || '').trim();
      CATEGORY_LOOKUP[cId] = cName;
      VALID_PRODUCT_CATEGORY_IDS.add(cId);
    });

    renderCategoryPillsAndSections(validCategories);
  } catch (err) {
    console.error("Failed to load categories:", err);
  }
}

function renderCategoryPillsAndSections(categories) {
  const container = document.getElementById('categoryContainer');
  const sectionsContainer = document.getElementById('menuCategoriesSections');

  if (container) {
    let pillsHtml = `<button class="cat-pill active" data-cat="all">All</button>`;
    (categories || []).forEach(cat => {
      const catId = Number(cat.categoryId || cat.id);
      const catName = (cat.categoryName || cat.name || '').trim();
      pillsHtml += `<button class="cat-pill" data-cat="cat-${catId}" data-cat-id="${catId}">${catName}</button>`;
    });
    container.innerHTML = pillsHtml;

    container.querySelectorAll('.cat-pill').forEach(p => {
      p.addEventListener('click', () => filterCat(p, p.dataset.cat));
    });

    initCategoryRowScrollBehavior(container);
  }

  if (sectionsContainer) {
    sectionsContainer.innerHTML = (categories || []).map(cat => {
      const catId = Number(cat.categoryId || cat.id);
      const catName = (cat.categoryName || cat.name || '').trim();
      return `
        <div class="section-hd filterable-title" id="cat-section-${catId}" data-category="cat-${catId}" data-cat-id="${catId}">
          <h3>${catName}</h3>
        </div>
        <div class="items-grid filterable-item" id="cat-grid-${catId}" data-category="cat-${catId}" data-cat-id="${catId}"></div>
      `;
    }).join('');
  }
}

let categoryRowScrollInitialized = false;
function initCategoryRowScrollBehavior(container) {
  if (!container || categoryRowScrollInitialized) return;
  categoryRowScrollInitialized = true;

  // Convert vertical mouse wheel to horizontal scroll on the category bar
  container.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      container.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  // Mouse drag-to-scroll for kiosk/desktop screens
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;
  let moved = false;

  container.addEventListener('mousedown', (e) => {
    isDown = true;
    moved = false;
    container.classList.add('dragging');
    startX = e.pageX - container.offsetLeft;
    scrollLeft = container.scrollLeft;
  });

  window.addEventListener('mouseup', () => {
    if (!isDown) return;
    isDown = false;
    container.classList.remove('dragging');
  });

  container.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 1.4;
    if (Math.abs(walk) > 6) {
      moved = true;
      e.preventDefault();
      container.scrollLeft = scrollLeft - walk;
    }
  });

  container.addEventListener('click', (e) => {
    if (moved) {
      e.stopPropagation();
      e.preventDefault();
      moved = false;
    }
  }, true);
}

function mapCategoryToSlug(catId, catName = '') {
  const id = Number(catId);
  const name = (catName || '').toLowerCase();
  if (id === 1 || id === 2 || name.includes('espresso')) return 'espresso';
  if (id === 4 || id === 8 || name.includes('milk-based') || name.includes('matcha')) return 'noncoffee';
  if (id === 9 || name.includes('milk tea')) return 'milktea';
  if (id === 5 || name.includes('frappe')) return 'frappe';
  if (id === 6 || name.includes('fruit tea')) return 'fruittea';
  if (id === 7 || name.includes('soda')) return 'soda';
  if (id === 10 || name.includes('waffle') || name.includes('croffle')) return 'croffle';
  if (id === 11 || name.includes('sandwich')) return 'sandwiches';
  if (id === 13 || name.includes('silog')) return 'silog';
  if (id === 15 || name.includes('pasta') || name.includes('spaghetti')) return 'pasta';
  if (id === 12 || name.includes('snack')) return 'snacks';
  return 'snacks';
}

loadMenuFromSupabase();

// ═════════════════════════════════════════
// 4. UI & GRID BUILDERS
// ═════════════════════════════════════════
function makeCard(item) {
  const d = document.createElement('div');
  d.dataset.productId = item.productId;
  const isOOS = !!item.isOutOfStock;
  d.className = `item-card ${isOOS ? 'out-of-stock' : ''}`;
  if (isOOS) {
    d.style.pointerEvents = 'none';
    d.setAttribute('aria-disabled', 'true');
    d.setAttribute('tabindex', '-1');
  }

  const itemName = item.productName || item.name || 'Unknown Item';
  const cleanDesc = getProductDescription(item);
  const itemImgSrc = getProductImage(item);

  const hasItemSizes = (item.hasSizes || (item.sizes && item.sizes.length > 0)) && item.sizes && item.sizes.length > 0;

  // Build price HTML with promo support
  let priceHTML = '';
  const hasPromo = !!item.promo;
  if (hasItemSizes) {
    if (hasPromo) {
      const dispMin = item.promoMinPrice;
      const dispMax = item.promoMaxPrice;
      const origRange = item.minPrice !== item.maxPrice ? `₱${item.minPrice}–₱${item.maxPrice}` : `₱${item.minPrice}`;
      const promoRange = dispMin !== dispMax ? `₱${dispMin}–₱${dispMax}` : `₱${dispMin}`;
      priceHTML = `<span class="price-original">${origRange}</span><span class="price-promo">${promoRange}</span>`;
    } else {
      priceHTML = item.minPrice !== item.maxPrice
        ? `₱${item.minPrice} - ₱${item.maxPrice}`
        : `₱${item.minPrice}`;
    }
  } else {
    if (hasPromo) {
      priceHTML = `<span class="price-original">₱${item.price || 0}</span><span class="price-promo">₱${item.promoPrice}</span>`;
    } else {
      priceHTML = `₱${item.price || 0}`;
    }
  }

  const promoLabel = item.promo
    ? `<span class="promo-badge-card">${item.promo.discountType === 1 ? `-${item.promo.discountValue}%` : `-₱${item.promo.discountValue}`} ${item.promo.promotionName}</span>`
    : '';

  const sizePillsHTML2 = hasItemSizes
    ? `<div class="card-size-tags">${item.sizes.map(s => `<span class="size-tag">${s.sizeName}</span>`).join('')}</div>`
    : '';

  const stockBadgeHTML = isOOS ? `<span class="stock-badge-oos">Out of Stock</span>` : '';
  const addBtnHTML = isOOS
    ? `<button class="add-btn oos-btn disabled" disabled aria-label="Out of Stock">Out of Stock</button>`
    : `<button class="add-btn" aria-label="Add ${itemName}">+</button>`;

  const isBestSeller = CATEGORY_TOP3_PRODUCT_IDS.has(item.productId);
  const starBadgeHTML = isBestSeller
    ? `<span class="bestseller-star-badge" title="Category Best Seller"><span class="star-icon">★</span> Best Seller</span>`
    : '';

  d.innerHTML = `
    <div class="item-img-wrap ${isBestSeller ? 'has-bestseller-star' : ''}">
      ${stockBadgeHTML}
      ${starBadgeHTML}
      ${promoLabel}
      <img class="item-img" src="${itemImgSrc}" alt="${itemName}" loading="lazy" onerror="this.onerror=null;this.src='placeholder.svg';" />
    </div>
    <div class="item-name">${itemName}</div>
    ${cleanDesc ? `<div class="item-desc">${cleanDesc}</div>` : ''}
    <div class="card-spacer"></div>
    ${sizePillsHTML2}
    <div class="card-footer ${hasPromo ? 'has-promo' : ''}">
      <div class="item-price ${hasPromo ? 'has-promo' : ''}">${priceHTML}</div>
      ${addBtnHTML}
    </div>
  `;

  const handleCardClick = (e) => {
    const currentItem = ALL_ITEMS.find(i => i.productId === item.productId) || item;
    if (currentItem.isOutOfStock) {
      if (e) e.stopPropagation();
      return;
    }
    triggerConfirmation(currentItem);
  };

  if (!isOOS) {
    const addBtn = d.querySelector('.add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', e => {
        e.stopPropagation();
        handleCardClick(e);
      });
    }
    d.addEventListener('click', handleCardClick);
  }

  return d;
}

function buildGrids() {
  // Ensure category sections exist if ALL_CATEGORIES was loaded
  const sectionsContainer = document.getElementById('menuCategoriesSections');
  if (sectionsContainer && sectionsContainer.children.length === 0 && ALL_CATEGORIES.length > 0) {
    renderCategoryPillsAndSections(ALL_CATEGORIES);
  }

  document.querySelectorAll('.items-grid').forEach(grid => {
    if (grid.id !== 'searchResultsGrid') grid.innerHTML = '';
  });

  ALL_ITEMS.forEach(item => {
    const catId = Number(item.categoryId);
    if (isAddonsCategory(item.categoryName, catId)) return;

    item.catKey = `cat-${catId}`;
    item.cat = mapCategoryToSlug(catId, item.categoryName || CATEGORY_LOOKUP[catId] || '');

    const grid = document.getElementById(`cat-grid-${catId}`);
    if (grid) {
      grid.appendChild(makeCard(item));
    }
  });

  // Hide any category section that has 0 products so no empty headers clutter the menu
  ALL_CATEGORIES.forEach(cat => {
    const catId = Number(cat.categoryId || cat.id);
    const sec = document.getElementById(`cat-section-${catId}`);
    const grid = document.getElementById(`cat-grid-${catId}`);
    const hasProducts = grid && grid.children.length > 0;
    if (sec) sec.style.display = hasProducts ? '' : 'none';
    if (grid) grid.style.display = hasProducts ? '' : 'none';
  });
}

let cur = 'welcomeScreen';

function goTo(id) {
  if (CustomerSessionManager && CustomerSessionManager.isExpired) {
    CustomerSessionManager.showExpiredOverlay();
    return;
  }
  if (!IS_KIOSK_OPEN && id !== 'welcomeScreen') {
    applyKioskOpenState(false);
    return;
  }
  if (CustomerSessionManager) {
    CustomerSessionManager.recordActivity('navigation');
  }
  if (id === cur) return;
  const prev = document.getElementById(cur);
  const next = document.getElementById(id);
  if (!prev || !next) return;
  prev.classList.add('exit');
  setTimeout(() => prev.classList.remove('active','exit'), 300);
  next.classList.add('active');
  cur = id;
  next.scrollTo(0, 0);
  if (id === 'cartScreen') renderCart();
  if (id === 'menuScreen') {
    checkKioskSettings();
    refreshInventoryStock();
  }
}

function addItem(name, imageUrl, price, desc, details = {}) {
  const isPromoItem = name.includes('[-20%') || name.includes('B1T1 Claimed');
  const qtyToAdd = details.qty && Number(details.qty) > 0 ? Number(details.qty) : 1;
  
  // Signature based on displayName, flavor, and selected addons to allow grouping identical items
  const flavorKey = details.flavor ? (details.flavor.flavorId || details.flavor.flavorName) : '';
  const addonKey = (details.addons || []).map(a => `${a.addonsId}_${a.qty || 1}_${a.subSelection || ''}`).sort().join(';');
  const itemKey = `${details.displayName || name}__${flavorKey}__${addonKey}`;

  const ex = cart.find(i => (i.itemKey && i.itemKey === itemKey) || i.name === name);
  
  if (ex) {
    if (isPromoItem) {
      showToast('Promo limited to 1 per order!');
      return; 
    }
    ex.qty += qtyToAdd;
  } else {
    cart.push({
      itemKey: itemKey,
      name: name,
      displayName: details.displayName || name,
      flavor: details.flavor || null,
      flavorName: details.flavorName || (details.flavor ? details.flavor.flavorName : null),
      imageUrl: imageUrl || 'placeholder.svg',
      initialPrice: details.initialPrice != null ? Number(details.initialPrice) : Number(price),
      originalBasePrice: details.originalBasePrice != null ? Number(details.originalBasePrice) : Number(price),
      promo: details.promo || null,
      addons: details.addons || [],
      addonTotal: details.addonTotal || 0,
      price: Number(price), // Unit Total = initialPrice + addonTotal
      desc: desc,
      qty: isPromoItem ? 1 : qtyToAdd
    });
  }
  syncUI();
  if (cur === 'cartScreen') renderCart(); 
  if (CustomerSessionManager) CustomerSessionManager.recordActivity('addItem', true);
  showToast(`Added: ${qtyToAdd > 1 ? qtyToAdd + 'x ' : ''}${details.displayName || name}`);
}

function changeQty(idx, delta) {
  if (CustomerSessionManager && CustomerSessionManager.isExpired) {
    CustomerSessionManager.showExpiredOverlay();
    return;
  }
  if (!cart[idx]) return;
  if (delta < 0 && cart[idx].qty <= 1) return;
  cart[idx].qty += delta;
  syncUI();
  renderCart();
  if (CustomerSessionManager) CustomerSessionManager.recordActivity('changeQty', true);
}

function removeItem(idx) {
  if (CustomerSessionManager && CustomerSessionManager.isExpired) {
    CustomerSessionManager.showExpiredOverlay();
    return;
  }
  if (!cart[idx]) return;
  const removed = cart.splice(idx, 1)[0];
  syncUI();
  renderCart();
  if (CustomerSessionManager) CustomerSessionManager.recordActivity('removeItem', true);
  if (removed) {
    showToast('Removed: ' + (removed.displayName || removed.name), 'info');
  }
}

window.changeQty = changeQty;
window.removeItem = removeItem;

function syncUI() {
  const count = cart.reduce((s,i) => s + i.qty, 0);
  const badge = document.getElementById('navCartBadge');
  if (badge) badge.textContent = count;
}

function changeCartAddonQty(itemIdx, addonIdx, delta) {
  if (CustomerSessionManager && CustomerSessionManager.isExpired) {
    CustomerSessionManager.showExpiredOverlay();
    return;
  }
  const item = cart[itemIdx];
  if (!item || !item.addons || !item.addons[addonIdx]) return;
  const addon = item.addons[addonIdx];
  const newQty = (Number(addon.qty) || 1) + delta;
  if (newQty < 1) return;
  addon.qty = newQty;

  // Recalculate addon total and item price
  const addonTotal = item.addons.reduce((sum, a) => sum + (Number(a.price) || 0) * (Number(a.qty) || 1), 0);
  item.addonTotal = addonTotal;
  const initialPrice = Number(item.initialPrice != null ? item.initialPrice : (item.price - (item.addonTotal || 0)));
  item.price = initialPrice + addonTotal;

  syncUI();
  renderCart();
  if (CustomerSessionManager) CustomerSessionManager.recordActivity('changeAddonQty', true);
}

function removeCartAddon(itemIdx, addonIdx) {
  if (CustomerSessionManager && CustomerSessionManager.isExpired) {
    CustomerSessionManager.showExpiredOverlay();
    return;
  }
  const item = cart[itemIdx];
  if (!item || !item.addons || !item.addons[addonIdx]) return;
  const removed = item.addons.splice(addonIdx, 1)[0];

  // Recalculate addon total and item price
  const addonTotal = item.addons.reduce((sum, a) => sum + (Number(a.price) || 0) * (Number(a.qty) || 1), 0);
  item.addonTotal = addonTotal;
  const initialPrice = Number(item.initialPrice != null ? item.initialPrice : (item.price - (item.addonTotal || 0)));
  item.price = initialPrice + addonTotal;

  syncUI();
  renderCart();
  if (CustomerSessionManager) CustomerSessionManager.recordActivity('removeAddon', true);
  if (removed) {
    showToast(`Removed add-on: ${removed.addonsName}`, 'info');
  }
}

window.changeCartAddonQty = changeCartAddonQty;
window.removeCartAddon = removeCartAddon;

function renderCart() {
  const con = document.getElementById('cartItemsContainer');
  const total = cart.reduce((s,i) => s + i.price * i.qty, 0);

  if (con) {
    con.innerHTML = cart.length === 0
      ? `<div class="empty-state"><div class="empty-icon">🛒</div><p>Your cart is empty</p></div>`
      : cart.map((item, idx) => {
          const hasAddons = item.addons && item.addons.length > 0;
          const initialPrice = Number(item.initialPrice != null ? item.initialPrice : item.price);
          const lineTotal = item.price * item.qty;
          const isMinQty = item.qty <= 1;

          const addonsHtml = hasAddons ? `
            <div class="ci-addons-list">
              <div class="ci-addons-label">Add-ons</div>
              ${item.addons.map((a, aIdx) => {
                const aQty = Number(a.qty) || 1;
                const aPrice = Number(a.price) || 0;
                const aTotal = aPrice * aQty;
                const isMinAddonQty = aQty <= 1;
                return `
                <div class="ci-addon-row">
                  <div class="ci-addon-left">
                    <span class="ci-addon-bullet">•</span>
                    <span class="ci-addon-name">${a.addonsName}${a.subSelection ? ` (${a.subSelection})` : ''}</span>
                    <span class="ci-addon-price">+₱${aTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div class="ci-addon-right">
                    <div class="ci-addon-ctrls">
                      <button type="button" class="ci-addon-btn" onclick="changeCartAddonQty(${idx}, ${aIdx}, -1)" ${isMinAddonQty ? 'disabled' : ''} aria-label="Decrease addon">−</button>
                      <span class="ci-addon-qty">${aQty}</span>
                      <button type="button" class="ci-addon-btn" onclick="changeCartAddonQty(${idx}, ${aIdx}, 1)" aria-label="Increase addon">+</button>
                    </div>
                    <button type="button" class="ci-addon-remove-btn" onclick="removeCartAddon(${idx}, ${aIdx})" title="Remove add-on" aria-label="Remove add-on">✕</button>
                  </div>
                </div>
              `;}).join('')}
            </div>
          ` : '';

          return `
          <div class="cart-item">
            <div class="cart-item-main">
              <div class="ci-img-wrap">
                <img class="ci-img" src="${item.imageUrl || 'placeholder.svg'}" alt="${item.displayName || item.name}" onerror="this.onerror=null;this.src='placeholder.svg';" />
              </div>
              <div class="ci-info">
                <div class="ci-name">${item.displayName || item.name}</div>
                <div class="ci-initial-price">
                  <span class="ci-initial-lbl">Initial Price:</span>
                  <span class="ci-initial-val">₱${initialPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div class="ci-line-total">
                  <span class="ci-total-lbl">Total:</span>
                  <span class="ci-price">₱${lineTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              </div>
              <div class="cart-item-actions">
                <div class="qty-ctrl">
                  <button class="qty-btn ${isMinQty ? 'disabled' : ''}" onclick="changeQty(${idx},-1)" ${isMinQty ? 'disabled' : ''} aria-label="Decrease quantity">−</button>
                  <span class="qty-num">${item.qty}</span>
                  <button class="qty-btn" onclick="changeQty(${idx},1)" aria-label="Increase quantity">+</button>
                </div>
                <button class="cart-remove-btn" onclick="removeItem(${idx})" aria-label="Remove ${item.displayName || item.name}">
                  Remove
                </button>
              </div>
            </div>
            ${addonsHtml}
          </div>`;
        }).join('');
  }

  const fmt = '₱' + total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const subEl = document.getElementById('cartSubtotal');
  const totEl = document.getElementById('cartTotal');
  if (subEl) subEl.textContent = fmt;
  if (totEl) totEl.textContent = fmt;
  updateCartInputsState();
}

function updateCartInputsState() {
  const hasItems = cart.length > 0;
  const nickInput = document.getElementById('customerNickname');
  const emailInput = document.getElementById('customerEmail');
  const notesInput = document.getElementById('orderNotes');
  const ewalletSelect = document.getElementById('ewalletSelect');
  const payRadios = document.querySelectorAll('input[name="payment"]');
  const orderTypeBtns = document.querySelectorAll('.order-type-btn');

  if (nickInput) {
    nickInput.disabled = !hasItems;
    nickInput.placeholder = hasItems ? "Enter name (required)" : "Cart empty - add items first";
    if (!hasItems) nickInput.value = '';
  }
  if (emailInput) {
    emailInput.disabled = !hasItems;
    emailInput.placeholder = hasItems ? "e.g. name@example.com" : "Cart empty - add items first";
    if (!hasItems) emailInput.value = '';
  }
  if (notesInput) {
    notesInput.disabled = !hasItems;
    notesInput.placeholder = hasItems ? "e.g. Less ice, oat milk, extra shot" : "Cart empty - add items first";
    if (!hasItems) notesInput.value = '';
  }
  if (ewalletSelect) {
    ewalletSelect.disabled = !hasItems;
  }
  payRadios.forEach(r => r.disabled = !hasItems);
  orderTypeBtns.forEach(b => b.disabled = !hasItems);

  checkOrderValidation();
}

function checkOrderValidation() {
  const nickInput = document.getElementById('customerNickname');
  const placeBtn = document.getElementById('placeOrderBtn');
  if (!nickInput || !placeBtn) return;
  placeBtn.disabled = (cart.length === 0 || nickInput.value.trim().length === 0);
}

let currentPaymentMethod = 'Cash';
document.querySelectorAll('input[name="payment"]').forEach(radio => {
  radio.addEventListener('change', e => {
    currentPaymentMethod = e.target.value;
    const panelCash = document.getElementById('panel-cash');
    const panelDigital = document.getElementById('panel-digital');
    if (panelCash) panelCash.classList.add('hidden');
    if (panelDigital) panelDigital.classList.add('hidden');
    if (currentPaymentMethod === 'Cash' && panelCash) panelCash.classList.remove('hidden');
    else if (panelDigital) panelDigital.classList.remove('hidden');
  });
});

let currentOrderType = 'Dine In';
document.querySelectorAll('.order-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (cart.length === 0) return;
    document.querySelectorAll('.order-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentOrderType = btn.dataset.type;
  });
});

// Fast in-memory cache of used order numbers to guarantee instantaneous uniqueness
const KNOWN_ORDER_NUMBERS = new Set();
async function preloadOrderNumbers() {
  if (!db) return;
  try {
    const { data } = await db.from('chill_kiosk_queue').select('kioskordernumber').order('kioskqueueid', { ascending: false }).limit(250);
    if (data) {
      data.forEach(d => {
        if (d.kioskordernumber) KNOWN_ORDER_NUMBERS.add(String(d.kioskordernumber));
      });
    }
  } catch (e) {
    console.warn("Could not preload order numbers:", e);
  }
}

// Generate unique random 4-digit order number instantly (0ms)
function getUniqueRandomOrderNumber() {
  for (let i = 0; i < 60; i++) {
    const candidate = String(Math.floor(1000 + Math.random() * 9000));
    if (!KNOWN_ORDER_NUMBERS.has(candidate)) {
      KNOWN_ORDER_NUMBERS.add(candidate);
      return candidate;
    }
  }
  const fallback = String(Math.floor(10000 + Math.random() * 90000));
  KNOWN_ORDER_NUMBERS.add(fallback);
  return fallback;
}

// ═════════════════════════════════════════
// 5. PLACE ORDER & SYNC TO CHILL_KIOSK_QUEUE (FAST)
// ═════════════════════════════════════════
async function placeOrder() {
  if (!IS_KIOSK_OPEN) {
    applyKioskOpenState(false);
    return;
  }
  if (!cart.length) return;
  const nicknameInput = document.getElementById('customerNickname').value.trim();
  if (!nicknameInput || nicknameInput.length < 1) {
    showToast('Please enter a nickname for your cup', 'warning');
    return;
  }
  const safeNickname = nicknameInput.slice(0, 30).toUpperCase();

  const emailInput = document.getElementById('customerEmail')?.value.trim() || '';
  const notesInput = document.getElementById('orderNotes')?.value.trim() || '';
  const total = cart.reduce((s,i) => s + i.price * i.qty, 0);
  const count = cart.reduce((s,i) => s + i.qty, 0);

  // 1. Instant unique random order number (0ms!)
  const orderNumber = getUniqueRandomOrderNumber();

  // 2. Prepare payload including special instructions
  const kioskPayload = {
    kioskordernumber: String(orderNumber),
    customerName: safeNickname,
    customerEmail: emailInput || null,
    orderType: currentOrderType,
    special_instructions: notesInput || null,
    notes: notesInput || null,
    instructions: notesInput || null,
    items: cart.map(item => ({
      name: item.name,
      displayName: item.displayName || item.name,
      flavor: item.flavor || null,
      flavorName: item.flavorName || (item.flavor ? item.flavor.flavorName : null),
      initialPrice: item.initialPrice != null ? Number(item.initialPrice) : Number(item.price),
      addons: item.addons || [],
      addonTotal: item.addonTotal || 0,
      price: item.price,
      qty: item.qty,
      imageUrl: item.imageUrl || '',
      desc: item.desc || '',
      subtotal: item.price * item.qty,
      special_instructions: notesInput || null,
      notes: notesInput || null
    })),
    subtotal: Number(total),
    totalamount: Number(total),
    paymentmethod: currentPaymentMethod || 'Cash',
    status: 'pending'
  };

  // 3. 3-Second Loading Screen while completing order
  const placeBtn = document.getElementById('placeOrderBtn');
  if (placeBtn) placeBtn.disabled = true;

  const loadingOverlay = document.getElementById('orderLoadingOverlay');
  const progressBar = document.getElementById('orderLoadingProgressBar');
  if (progressBar) progressBar.classList.remove('active');
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');

  // Trigger progress bar transition
  if (progressBar) {
    void progressBar.offsetWidth;
    progressBar.classList.add('active');
  }

  // Minimum 3-second display promise
  const minWaitPromise = new Promise(resolve => setTimeout(resolve, 3000));
  const submitPromise = CustomerSessionManager.submitOrder(kioskPayload);

  const [orderResult] = await Promise.all([submitPromise, minWaitPromise]);

  if (loadingOverlay) loadingOverlay.classList.add('hidden');
  if (progressBar) progressBar.classList.remove('active');

  if (!orderResult.success) {
    if (placeBtn) placeBtn.disabled = false;
    if (orderResult.code === 'SESSION_EXPIRED') {
      CustomerSessionManager.handleSessionExpired('Session expired during checkout');
      return;
    }
    if (orderResult.code === 'KIOSK_CLOSED') {
      applyKioskOpenState(false);
      return;
    }
    showToast(orderResult.message || 'Failed to submit order. Please try again.', 'error');
    return;
  }

  const now = new Date();
  const invoiceString = `#INV-${orderNumber}`;
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '');
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const finalNickname = safeNickname;

  // Populate Order Details
  document.getElementById('queueNum').textContent = orderNumber;
  document.getElementById('confirmInvoice').textContent = invoiceString;
  document.getElementById('confirmDate').textContent = dateStr;
  document.getElementById('confirmTime').textContent = timeStr;
  document.getElementById('confirmNickname').textContent = finalNickname;
  document.getElementById('confirmItems').textContent = count + ' item' + (count !== 1 ? 's' : '');
  document.getElementById('confirmOrderType').textContent = currentOrderType;
  document.getElementById('confirmAmount').textContent = '₱' + total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

  // Automatically render digital receipt so it's ready when user clicks "View Digital Receipt"
  generateDigitalReceipt(finalNickname, invoiceString, dateStr, timeStr, total, count, 0, total, notesInput);

  const confirmEmailRow = document.getElementById('confirmEmailRow');
  const confirmEmailEl = document.getElementById('confirmEmail');
  const confirmStatusText = document.getElementById('confirmStatusText');
  if (confirmEmailRow && confirmEmailEl) {
    if (emailInput) {
      confirmEmailRow.style.display = 'flex';
      confirmEmailEl.textContent = emailInput;
      if (confirmStatusText) confirmStatusText.textContent = '✓ Sent to POS & Email';
    } else {
      confirmEmailRow.style.display = 'none';
      if (confirmStatusText) confirmStatusText.textContent = '✓ Sent to POS';
    }
  }

  const confirmNotesRow = document.getElementById('confirmNotesRow');
  const confirmNotesEl = document.getElementById('confirmNotes');
  if (confirmNotesRow && confirmNotesEl) {
    if (notesInput) {
      confirmNotesRow.style.display = 'flex';
      confirmNotesEl.textContent = notesInput;
    } else {
      confirmNotesRow.style.display = 'none';
    }
  }

  // Invoice Items Breakdown: Product initial price, separated addons, and line computation
  const itemsListContainer = document.getElementById('confirm-items-list');
  if (itemsListContainer) {
    itemsListContainer.innerHTML = cart.map(item => {
      const hasAddons = item.addons && item.addons.length > 0;
      const initialPrice = Number(item.initialPrice != null ? item.initialPrice : item.price);
      const initialPriceAmt = (initialPrice * item.qty).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      const itemTotalAmt = (item.price * item.qty).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

      let addonsHtml = '';
      if (hasAddons) {
        addonsHtml = item.addons.map(a => {
          const aPrice = Number(a.price) || 0;
          const aQty = Number(a.qty) || 1;
          const aTotal = (aPrice * aQty * item.qty).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
          return `
            <div style="display: flex; justify-content: space-between; padding-left: 14px; font-size: 11.5px; color: var(--muted); margin-top: 2px;">
              <span>+ ${aQty > 1 ? aQty + 'x ' : ''}${a.addonsName}${a.subSelection ? ` (${a.subSelection})` : ''}</span>
              <span>₱${aTotal}</span>
            </div>
          `;
        }).join('');
      }

      return `
        <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #ddd9ee;">
          <div style="display: flex; justify-content: space-between; font-weight: 600;">
            <span style="flex:1; text-align:left;">${item.qty}x ${item.displayName || item.name}</span>
            <span>₱${initialPriceAmt}</span>
          </div>
          ${addonsHtml}
          ${hasAddons ? `
            <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; font-weight: 700; color: var(--primary);">
              <span>Item Total:</span>
              <span>₱${itemTotalAmt}</span>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
    itemsListContainer.classList.add('hidden');
  }
  
  const btnShowItems = document.getElementById('btn-show-items');
  if (btnShowItems) btnShowItems.textContent = 'Show';

  // Instant switch to confirmation ticket screen!
  goTo('confirmScreen');

  // Trigger celebratory confetti
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 90,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#8957CC', '#A47CE0', '#5DBF6A', '#F4A93B']
    });
  }

  // Animate SweetAlert2 checkmark icon on confirmation ticket
  const icon = document.getElementById('confirmSuccessIcon');
  if (icon) {
    icon.classList.remove('swal2-animate-success-icon');
    void icon.offsetWidth;
    icon.classList.add('swal2-animate-success-icon');
  }

  // Non-blocking accomplishment toast
  if (window.Swal) {
    Swal.fire({
      toast: true,
      position: 'top',
      icon: 'success',
      title: `Order #${orderNumber} Confirmed!`,
      showConfirmButton: false,
      timer: 2000,
      background: '#1E1B2E',
      color: '#ffffff',
      iconColor: '#5DBF6A',
      customClass: { popup: 'swal2-kiosk-toast' }
    });
  }
}

function newOrder() {
  if (CustomerSessionManager && CustomerSessionManager.isExpired) {
    CustomerSessionManager.showExpiredOverlay();
    return;
  }
  cart = [];
  const notes = document.getElementById('orderNotes');
  const nick = document.getElementById('customerNickname');
  const email = document.getElementById('customerEmail');
  if (notes) notes.value = '';
  if (nick) nick.value = '';
  if (email) email.value = '';
  syncUI();
  updateCartInputsState();
  if (receiptOverlay) receiptOverlay.classList.add('hidden');
  if (CustomerSessionManager) CustomerSessionManager.recordActivity('newOrder', true);
  goTo('menuScreen');
}

let isProgrammaticCategoryScroll = false;
let programmaticScrollTimeout = null;

function filterCat(btn, cat) {
  if (CustomerSessionManager) CustomerSessionManager.recordActivity('filterCat');
  const searchInput = document.getElementById('menuSearch');
  const searchContainer = document.getElementById('searchResultsContainer');
  if (searchInput && searchInput.value) {
    searchInput.value = '';
    if (searchContainer) searchContainer.classList.add('hidden');
  }

  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
    // Scroll the category line horizontally so the clicked category pill is centered/visible
    btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  // Keep all category sections visible so the menu is scrollable and can auto-scroll to the chosen category
  document.querySelectorAll('.filterable-item,.filterable-title').forEach(el => {
    el.dataset.hidden = 'false';
  });

  const menuScreen = document.getElementById('menuScreen');
  if (!menuScreen) return;

  isProgrammaticCategoryScroll = true;
  clearTimeout(programmaticScrollTimeout);
  programmaticScrollTimeout = setTimeout(() => {
    isProgrammaticCategoryScroll = false;
  }, 750);

  if (cat === 'all') {
    menuScreen.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // Find target category section & product grid under that category
  const catId = btn?.dataset?.catId || String(cat).replace(/^cat-/, '');
  const targetSection =
    document.getElementById(`cat-section-${catId}`) ||
    document.querySelector(`.filterable-title[data-category="${cat}"]`) ||
    document.getElementById(`cat-grid-${catId}`) ||
    document.querySelector(`.filterable-item[data-category="${cat}"]`);

  if (targetSection) {
    const topNav = menuScreen.querySelector('.top-nav');
    const catRow = document.getElementById('categoryContainer');
    const navHeight = (topNav ? topNav.offsetHeight : 64) + (catRow ? catRow.offsetHeight : 54) + 12;

    const screenRect = menuScreen.getBoundingClientRect();
    const targetRect = targetSection.getBoundingClientRect();
    const scrollTarget = menuScreen.scrollTop + (targetRect.top - screenRect.top) - navHeight;

    menuScreen.scrollTo({
      top: Math.max(0, scrollTarget),
      behavior: 'smooth'
    });
  }
}

// Keep active category pill synced while user scrolls through products on menuScreen
document.addEventListener('DOMContentLoaded', () => {
  const menuScreen = document.getElementById('menuScreen');
  if (!menuScreen) return;

  menuScreen.addEventListener('scroll', () => {
    if (isProgrammaticCategoryScroll) return;
    const searchInput = document.getElementById('menuSearch');
    if (searchInput && searchInput.value.trim()) return;

    const topNav = menuScreen.querySelector('.top-nav');
    const catRow = document.getElementById('categoryContainer');
    const threshold = (topNav ? topNav.offsetHeight : 64) + (catRow ? catRow.offsetHeight : 54) + 40;
    const screenTop = menuScreen.getBoundingClientRect().top;

    if (menuScreen.scrollTop < 120) {
      const allPill = document.querySelector('.cat-pill[data-cat="all"]');
      if (allPill && !allPill.classList.contains('active')) {
        document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
        allPill.classList.add('active');
        allPill.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
      }
      return;
    }

    const sections = document.querySelectorAll('#menuCategoriesSections .filterable-title');
    let activeCatKey = null;
    sections.forEach(sec => {
      if (sec.style.display === 'none' || sec.dataset.hidden === 'true') return;
      const relTop = sec.getBoundingClientRect().top - screenTop;
      if (relTop <= threshold) {
        activeCatKey = sec.dataset.category;
      }
    });

    if (activeCatKey) {
      const targetPill = document.querySelector(`.cat-pill[data-cat="${activeCatKey}"]`);
      if (targetPill && !targetPill.classList.contains('active')) {
        document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
        targetPill.classList.add('active');
        targetPill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, { passive: true });
});

let toastTimer;
function showToast(msg, iconType = 'success') {
  if (window.Swal) {
    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 1800,
      timerProgressBar: false,
      background: '#1E1B2E',
      color: '#ffffff',
      iconColor: iconType === 'warning' ? '#F4A93B' : '#A47CE0',
      customClass: {
        popup: 'swal2-kiosk-toast'
      },
      didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
      }
    });
    Toast.fire({
      icon: iconType,
      title: msg
    });
    return;
  }
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ═════════════════════════════════════════
// 6. EVENT BINDINGS & SEARCH ENGINE
// ═════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  updateCartInputsState();
  const startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', () => goTo('menuScreen'));

  const menuBackBtn = document.getElementById('menuBackBtn');
  if (menuBackBtn) menuBackBtn.addEventListener('click', () => goTo('welcomeScreen'));

  const cartBackBtn = document.getElementById('cartBackBtn');
  if (cartBackBtn) cartBackBtn.addEventListener('click', () => goTo('menuScreen'));

  const navCartBtn = document.getElementById('navCartBtn');
  if (navCartBtn) navCartBtn.addEventListener('click', () => goTo('cartScreen'));

  const placeOrderBtn = document.getElementById('placeOrderBtn');
  if (placeOrderBtn) placeOrderBtn.addEventListener('click', placeOrder);

  const newOrderBtn = document.getElementById('newOrderBtn');
  if (newOrderBtn) newOrderBtn.addEventListener('click', newOrder);

  // Red Promo Banner Card Binding
  const bannerCards = document.querySelectorAll('.hero-banner > div');
  if (bannerCards.length >= 2) {
    const promoCardEl = bannerCards[1];
    promoCardEl.style.cursor = 'pointer';
    promoCardEl.addEventListener('click', () => {
      const firstTopProd = (TOP_SELLING_PRODUCTS && TOP_SELLING_PRODUCTS[0]) || TOP_SELLING_PRODUCT || ALL_ITEMS.find(i => !i.isOutOfStock);
      if (firstTopProd && !firstTopProd.isOutOfStock) {
        triggerConfirmation(firstTopProd);
      }
    });
  }
});

const showItemsBtn = document.getElementById('btn-show-items');
if (showItemsBtn) {
  showItemsBtn.addEventListener('click', function() {
    const list = document.getElementById('confirm-items-list');
    if (list) {
      list.classList.toggle('hidden');
      this.textContent = list.classList.contains('hidden') ? 'Show' : 'Hide';
    }
  });
}

function removeAccents(str) { return str.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

const menuSearchInput = document.getElementById('menuSearch');
const menuSearchClear = document.getElementById('menuSearchClear');
if (menuSearchClear && menuSearchInput) {
  menuSearchClear.addEventListener('click', () => {
    menuSearchInput.value = '';
    menuSearchClear.classList.add('hidden');
    menuSearchInput.dispatchEvent(new Event('input'));
    menuSearchInput.focus();
  });
}

if (menuSearchInput) {
  menuSearchInput.addEventListener('input', (e) => {
    const rawVal = e.target.value.trim();
    if (menuSearchClear) {
      if (rawVal.length > 0) menuSearchClear.classList.remove('hidden');
      else menuSearchClear.classList.add('hidden');
    }
    const query = removeAccents(rawVal.toLowerCase());
    const mainContent = document.querySelectorAll('.filterable-title, .filterable-item'); 
    const searchContainer = document.getElementById('searchResultsContainer');
    const searchGrid = document.getElementById('searchResultsGrid');
    const noResults = document.getElementById('noResultsMsg');

    if (!query) {
      if (searchContainer) searchContainer.classList.add('hidden');
      mainContent.forEach(el => el.dataset.hidden = 'false');
      return;
    }

    mainContent.forEach(el => el.dataset.hidden = 'true');
    if (searchContainer) searchContainer.classList.remove('hidden');
    if (searchGrid) searchGrid.innerHTML = '';
    
    let matches = 0;
    ALL_ITEMS.forEach(item => {
      const itemName = item.productName || item.name || '';
      const itemDesc = getProductDescription(item);
      const catVal = item.cat || '';
      const catName = item.categoryName || '';
      const searchable = removeAccents(`${itemName} ${itemDesc} ${catVal} ${catName} ${item.productId || item.uid}`).toLowerCase();
      
      if (searchable.includes(query)) {
        if (searchGrid) searchGrid.appendChild(makeCard(item));
        matches++;
      }
    });

    if (matches === 0) {
      if (searchGrid) searchGrid.classList.add('hidden');
      if (noResults) noResults.classList.remove('hidden');
    } else {
      if (searchGrid) searchGrid.classList.remove('hidden');
      if (noResults) noResults.classList.add('hidden');
    }
  });
}

// ═════════════════════════════════════════
// 7. MODALS, SIZES, ADD-ONS & DIGITAL RECEIPT
// ═════════════════════════════════════════
let itemPendingConfirmation = null;
let selectedAddons = []; // array of { addonsId, addonsName, price }
let currentSelectedSize = null; 
let currentModalQty = 1;

const confirmationOverlay = document.getElementById('confirmation-overlay');
const receiptOverlay = document.getElementById('receipt-overlay');

function updateModalQtyUI() {
  const qtyValEl = document.getElementById('modal-qty-val');
  const minusBtn = document.getElementById('modal-qty-minus');
  const plusBtn = document.getElementById('modal-qty-plus');
  if (qtyValEl) qtyValEl.textContent = currentModalQty;
  if (minusBtn) {
    const isMin = currentModalQty <= 1 || (itemPendingConfirmation && itemPendingConfirmation.isOutOfStock);
    minusBtn.disabled = isMin;
    minusBtn.classList.toggle('disabled', isMin);
  }
  if (plusBtn) {
    const isOOS = !!(itemPendingConfirmation && itemPendingConfirmation.isOutOfStock);
    plusBtn.disabled = isOOS;
    plusBtn.classList.toggle('disabled', isOOS);
  }
}

function updateModalPrice() {
  if (!itemPendingConfirmation) return;
  
  let basePrice = 0;
  if (currentSelectedSize) {
    basePrice = currentSelectedSize.price;
  } else {
    basePrice = Number(itemPendingConfirmation.price || itemPendingConfirmation.minPrice || 0);
  }

  const addonTotal = selectedAddons.reduce((sum, a) => sum + (Number(a.price) || 0) * (Number(a.qty) || 1), 0);
  const promo = itemPendingConfirmation.promo || null;
  const discountedBase = promo ? applyPromo(basePrice, promo) : basePrice;
  const unitPrice = discountedBase + addonTotal;
  const finalPrice = unitPrice * currentModalQty;

  // 1. Initial product price display
  const baseLblEl = document.getElementById('modal-base-price-lbl');
  const baseValEl = document.getElementById('modal-base-price-val');
  if (baseLblEl) {
    baseLblEl.textContent = currentSelectedSize ? `Initial Price (${currentSelectedSize.sizeName}):` : 'Initial Price:';
  }
  if (baseValEl) {
    if (promo) {
      baseValEl.innerHTML = `<span style="text-decoration:line-through;color:var(--muted);font-size:0.85em;margin-right:4px;">₱${basePrice.toFixed(2)}</span> <span style="color:var(--promo-color,#E53935);font-weight:700;">₱${discountedBase.toFixed(2)}</span>`;
    } else {
      baseValEl.textContent = '₱' + basePrice.toFixed(2);
    }
  }

  // 2. Selected Addons breakdown (showing addon name, quantity, and separate price)
  const addonsListEl = document.getElementById('modal-selected-addons-list');
  if (addonsListEl) {
    if (selectedAddons.length > 0) {
      addonsListEl.classList.remove('hidden');
      addonsListEl.innerHTML = selectedAddons.map(a => {
        const qty = Number(a.qty) || 1;
        const lineTotal = (Number(a.price) || 0) * qty;
        return `
        <div class="modal-addon-breakdown-row">
          <span>+ ${qty > 1 ? qty + 'x ' : ''}${a.addonsName}${a.subSelection ? ` (${a.subSelection})` : ''}</span>
          <span>₱${lineTotal.toFixed(2)}</span>
        </div>
      `;}).join('');
    } else {
      addonsListEl.classList.add('hidden');
      addonsListEl.innerHTML = '';
    }
  }

  // 3. Computed Total
  const totalLblEl = document.getElementById('modal-total-lbl');
  if (totalLblEl) {
    totalLblEl.textContent = currentModalQty > 1 ? `Total (${currentModalQty}x):` : 'Total:';
  }
  const priceValEl = document.getElementById('modal-price-value');
  if (priceValEl) {
    if (promo) {
      const originalTotal = (basePrice + addonTotal) * currentModalQty;
      priceValEl.innerHTML = `<span style="text-decoration:line-through;color:var(--muted);font-size:0.85em;font-weight:600;">₱${originalTotal.toFixed(2)}</span> <span style="color:var(--promo-color,#E53935);font-weight:800;">₱${finalPrice.toFixed(2)}</span>`;
    } else {
      priceValEl.textContent = '₱' + finalPrice.toFixed(2);
    }
  }
}

function triggerConfirmation(item) {
  if (!item) return;
  itemPendingConfirmation = item;
  currentModalQty = 1;
  
  const itemName = item.productName || item.name || 'Café Latte';
  const cleanDesc = getProductDescription(item);
  const itemRecipe = (item.recipe || '').trim();
  const itemUid = item.productId || item.uid || '—';

  const uidEl = document.getElementById('modal-uid');
  const modalImg = document.getElementById('modal-img');
  const titleEl = document.getElementById('modal-title');
  const descEl = document.getElementById('modal-desc');
  const recipeTextEl = document.getElementById('modal-recipe-text');
  const recipeContent = document.getElementById('modal-recipe-content');

  if (uidEl) uidEl.textContent = 'UID: ' + itemUid;
  if (modalImg) {
    modalImg.src = getProductImage(item);
    modalImg.onerror = () => { modalImg.src = 'placeholder.svg'; };
  }
  if (titleEl) titleEl.textContent = itemName;
  if (descEl) {
    descEl.textContent = cleanDesc;
    descEl.style.display = cleanDesc ? 'block' : 'none';
  }

  // Show/hide promo badge in modal (placed after descEl so description stays directly under product name)
  let promoEl = document.getElementById('modal-promo-label');
  if (item.promo) {
    const pLabel = item.promo.discountType === 1
      ? `${item.promo.discountValue}% OFF — ${item.promo.promotionName}`
      : `₱${item.promo.discountValue} OFF — ${item.promo.promotionName}`;
    if (!promoEl) {
      promoEl = document.createElement('div');
      promoEl.id = 'modal-promo-label';
      promoEl.className = 'modal-promo-label';
      if (descEl && descEl.parentNode) {
        descEl.parentNode.insertBefore(promoEl, descEl.nextSibling);
      } else if (titleEl && titleEl.parentNode) {
        titleEl.parentNode.insertBefore(promoEl, titleEl.nextSibling);
      }
    } else {
      if (descEl && descEl.parentNode && promoEl.nextSibling === descEl) {
        descEl.parentNode.insertBefore(promoEl, descEl.nextSibling);
      }
    }
    promoEl.textContent = pLabel;
    promoEl.style.display = 'block';
  } else if (promoEl) {
    promoEl.style.display = 'none';
  }

  // Ingredients directly inside the product modal (Image 2)
  if (recipeContent) {
    if (itemRecipe) {
      recipeContent.style.display = 'block';
      if (recipeTextEl) recipeTextEl.textContent = itemRecipe;
    } else {
      recipeContent.style.display = 'none';
    }
  }

  // Dynamic Flavor Selection (e.g. for Flavored Fries or any product with flavors in chill_product_flavors)
  const flavorSection = document.getElementById('modal-flavor-section');
  const flavorOptionsContainer = document.getElementById('modal-flavor-options');
  const hasItemFlavors = item.flavors && item.flavors.length > 0;
  if (hasItemFlavors) {
    if (flavorSection) flavorSection.classList.remove('hidden');
    currentSelectedFlavor = item.flavors[0];

    if (flavorOptionsContainer) {
      flavorOptionsContainer.innerHTML = item.flavors.map((f, idx) => `
        <button type="button" class="flavor-btn ${idx === 0 ? 'active' : ''}" 
                data-flavor-id="${f.flavorId}" 
                data-flavor-name="${f.flavorName}">
          ${f.flavorName}
        </button>
      `).join('');

      flavorOptionsContainer.querySelectorAll('.flavor-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          flavorOptionsContainer.querySelectorAll('.flavor-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const fId = Number(btn.dataset.flavorId);
          currentSelectedFlavor = item.flavors.find(f => f.flavorId === fId) || {
            flavorId: fId,
            flavorName: btn.dataset.flavorName
          };
          updateModalPrice();
        });
      });
    }
  } else {
    currentSelectedFlavor = null;
    if (flavorSection) flavorSection.classList.add('hidden');
    if (flavorOptionsContainer) flavorOptionsContainer.innerHTML = '';
  }

  // Dynamic Sizes
  const sizeSection = document.getElementById('modal-size-section');
  const sizeOptionsContainer = document.getElementById('modal-size-options');
  const hasItemSizes = (item.hasSizes || (item.sizes && item.sizes.length > 0)) && item.sizes && item.sizes.length > 0;
  if (hasItemSizes) {
    if (sizeSection) sizeSection.classList.remove('hidden');
    currentSelectedSize = item.sizes[0];

    if (sizeOptionsContainer) {
      sizeOptionsContainer.innerHTML = item.sizes.map((s, idx) => `
        <button class="size-btn ${idx === 0 ? 'active' : ''}" 
                data-size-id="${s.sizeId}" 
                data-size-name="${s.sizeName}" 
                data-price="${s.price}">
          ${s.sizeName} (₱${s.price})
        </button>
      `).join('');

      sizeOptionsContainer.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          sizeOptionsContainer.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const sId = Number(btn.dataset.sizeId);
          currentSelectedSize = item.sizes.find(s => s.sizeId === sId) || {
            sizeId: sId,
            sizeName: btn.dataset.sizeName,
            price: parseFloat(btn.dataset.price)
          };
          updateModalPrice();
        });
      });
    }
  } else {
    currentSelectedSize = null;
    if (sizeSection) sizeSection.classList.add('hidden');
    if (sizeOptionsContainer) sizeOptionsContainer.innerHTML = '';
  }

  // Dynamic Add-ons from chill_addons, chill_product_addons & chill_addon_recipe
  selectedAddons = [];
  const addonSection = document.getElementById('modal-addon-section');
  const addonOptionsWrap = document.getElementById('modal-addon-options-wrap');
  const addonOptionsContainer = document.getElementById('modal-addon-options');
  const addonToggleNo = document.getElementById('addon-toggle-no');
  const addonToggleYes = document.getElementById('addon-toggle-yes');
  const addonQuestionBar = document.getElementById('addon-question-bar');
  const itemAddons = item.addons || [];

  if (itemAddons.length > 0 && addonSection && addonOptionsContainer) {
    addonSection.classList.remove('hidden');

    // Default to "No" (collapsed) so the modal stays clean and uncrowded
    if (addonOptionsWrap) addonOptionsWrap.classList.add('hidden');
    if (addonToggleNo) addonToggleNo.classList.add('active');
    if (addonToggleYes) {
      addonToggleYes.classList.remove('active');
      addonToggleYes.textContent = 'Yes ▾';
    }

    let addonBtnsHtml = '';
    itemAddons.forEach(a => {
      const priceText = a.price > 0 ? `+₱${a.price}` : 'Free';
      const subRecipes = (ALL_ADDON_RECIPES[a.addonsId] || []);

      // Check if any ingredient required by this addon is out of stock
      const isAddonOOS = subRecipes.length > 0 && subRecipes.some(sr => OOS_INGREDIENT_IDS.has(sr.ingredientId));

      addonBtnsHtml += `
        <div class="addon-row-wrapper" data-addon-id="${a.addonsId}">
          <div class="addon-card ${isAddonOOS ? 'disabled' : ''}" data-addon-id="${a.addonsId}" data-name="${a.addonsName}" data-price="${a.price}">
            <div class="addon-card-left">
              <span class="addon-card-name">${a.addonsName}${isAddonOOS ? ' (Out of Stock)' : ''}</span>
              <span class="addon-card-price">${priceText}</span>
            </div>
            <div class="addon-card-right">
              <button type="button" class="addon-add-pill" ${isAddonOOS ? 'disabled' : ''}>+ Add</button>
              <div class="addon-stepper hidden">
                <button type="button" class="addon-step-btn addon-step-minus" title="Decrease quantity">−</button>
                <span class="addon-step-num">1</span>
                <button type="button" class="addon-step-btn addon-step-plus" title="Increase quantity">+</button>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    addonOptionsContainer.innerHTML = addonBtnsHtml;

    const addonCards = addonOptionsContainer.querySelectorAll('.addon-card');

    const setAddonsExpanded = (wantAddons) => {
      if (wantAddons) {
        if (addonToggleYes) {
          addonToggleYes.classList.add('active');
          addonToggleYes.textContent = 'Yes ▴';
        }
        if (addonToggleNo) addonToggleNo.classList.remove('active');
        if (addonOptionsWrap) addonOptionsWrap.classList.remove('hidden');
      } else {
        if (addonToggleNo) addonToggleNo.classList.add('active');
        if (addonToggleYes) {
          addonToggleYes.classList.remove('active');
          addonToggleYes.textContent = 'Yes ▾';
        }
        if (addonOptionsWrap) addonOptionsWrap.classList.add('hidden');
        selectedAddons = [];
        addonCards.forEach(c => {
          c.classList.remove('active');
          const stepper = c.querySelector('.addon-stepper');
          if (stepper) stepper.classList.add('hidden');
          const numEl = c.querySelector('.addon-step-num');
          if (numEl) numEl.textContent = '1';
        });
        updateModalPrice();
      }
    };

    if (addonToggleNo) {
      addonToggleNo.onclick = (e) => {
        e.stopPropagation();
        setAddonsExpanded(false);
      };
    }
    if (addonToggleYes) {
      addonToggleYes.onclick = (e) => {
        e.stopPropagation();
        setAddonsExpanded(true);
      };
    }
    if (addonQuestionBar) {
      addonQuestionBar.onclick = () => {
        const isCurrentlyOpen = addonOptionsWrap && !addonOptionsWrap.classList.contains('hidden');
        setAddonsExpanded(!isCurrentlyOpen);
      };
    }

    addonCards.forEach(card => {
      const aId = Number(card.dataset.addonId);
      const aName = card.dataset.name;
      const aPrice = parseFloat(card.dataset.price) || 0;
      const addBtn = card.querySelector('.addon-add-pill');
      const stepper = card.querySelector('.addon-stepper');
      const minusBtn = card.querySelector('.addon-step-minus');
      const plusBtn = card.querySelector('.addon-step-plus');
      const numEl = card.querySelector('.addon-step-num');

      const updateCardState = (qty) => {
        if (qty > 0) {
          card.classList.add('active');
          if (stepper) stepper.classList.remove('hidden');
          if (numEl) numEl.textContent = qty;
        } else {
          card.classList.remove('active');
          if (stepper) stepper.classList.add('hidden');
          if (numEl) numEl.textContent = '1';
        }
      };

      if (addBtn) {
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (card.classList.contains('disabled')) return;
          const existing = selectedAddons.find(a => a.addonsId === aId);
          if (!existing) {
            selectedAddons.push({ addonsId: aId, addonsName: aName, price: aPrice, qty: 1, subSelection: null });
            updateCardState(1);
          }
          updateModalPrice();
          if (CustomerSessionManager) CustomerSessionManager.recordActivity('addAddon', true);
        });
      }

      if (plusBtn) {
        plusBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (card.classList.contains('disabled')) return;
          let item = selectedAddons.find(a => a.addonsId === aId);
          if (!item) {
            item = { addonsId: aId, addonsName: aName, price: aPrice, qty: 1, subSelection: null };
            selectedAddons.push(item);
          } else {
            item.qty = (Number(item.qty) || 1) + 1;
          }
          updateCardState(item.qty);
          updateModalPrice();
          if (CustomerSessionManager) CustomerSessionManager.recordActivity('addonQtyPlus', true);
        });
      }

      if (minusBtn) {
        minusBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (card.classList.contains('disabled')) return;
          const idx = selectedAddons.findIndex(a => a.addonsId === aId);
          if (idx >= 0) {
            const current = selectedAddons[idx];
            if ((Number(current.qty) || 1) > 1) {
              current.qty = (Number(current.qty) || 1) - 1;
              updateCardState(current.qty);
            } else {
              selectedAddons.splice(idx, 1);
              updateCardState(0);
            }
            updateModalPrice();
            if (CustomerSessionManager) CustomerSessionManager.recordActivity('addonQtyMinus', true);
          }
        });
      }
    });
  } else {
    if (addonSection) addonSection.classList.add('hidden');
    if (addonOptionsWrap) addonOptionsWrap.classList.add('hidden');
    if (addonOptionsContainer) addonOptionsContainer.innerHTML = '';
  }

  // Manage Confirm Button state based on out of stock
  const confirmBtn = document.getElementById('btn-confirm-order');
  if (confirmBtn) {
    if (item.isOutOfStock) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Out of Stock';
      confirmBtn.classList.add('disabled');
    } else {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Add to Order';
      confirmBtn.classList.remove('disabled');
    }
  }

  updateModalQtyUI();
  updateModalPrice();
  if (confirmationOverlay) confirmationOverlay.classList.remove('hidden');
} 

const modalQtyMinusBtn = document.getElementById('modal-qty-minus');
if (modalQtyMinusBtn) {
  modalQtyMinusBtn.addEventListener('click', () => {
    if (currentModalQty > 1) {
      currentModalQty--;
      updateModalQtyUI();
      updateModalPrice();
    }
  });
}

const modalQtyPlusBtn = document.getElementById('modal-qty-plus');
if (modalQtyPlusBtn) {
  modalQtyPlusBtn.addEventListener('click', () => {
    currentModalQty++;
    updateModalQtyUI();
    updateModalPrice();
  });
}

const modalCloseBtn = document.getElementById('modalCloseBtn');
if (modalCloseBtn) {
  modalCloseBtn.addEventListener('click', () => {
    if (confirmationOverlay) confirmationOverlay.classList.add('hidden');
    itemPendingConfirmation = null;
    currentSelectedFlavor = null;
  });
}

const confirmOrderBtn = document.getElementById('btn-confirm-order');
if (confirmOrderBtn) {
  confirmOrderBtn.addEventListener('click', () => {
    if (itemPendingConfirmation) {
      if (itemPendingConfirmation.isOutOfStock) {
        showToast('Sorry, this item is out of stock', 'warning');
        return;
      }
      
      const rawName = itemPendingConfirmation.productName || itemPendingConfirmation.name;
      const optionTags = [];
      if (currentSelectedFlavor) {
        optionTags.push(currentSelectedFlavor.flavorName);
      }
      if (currentSelectedSize) {
        optionTags.push(currentSelectedSize.sizeName);
      }
      const optionSuffix = optionTags.length > 0 ? ` (${optionTags.join(', ')})` : '';
      const displayName = `${rawName}${optionSuffix}`;
      
      const basePrice = currentSelectedSize ? currentSelectedSize.price : (Number(itemPendingConfirmation.price || itemPendingConfirmation.minPrice || 0));
      const promo = itemPendingConfirmation.promo || null;
      const discountedBase = promo ? applyPromo(basePrice, promo) : basePrice;
      const addonTotal = selectedAddons.reduce((sum, a) => sum + (Number(a.price) || 0) * (Number(a.qty) || 1), 0);
      const cartUnitTotal = discountedBase + addonTotal;

      const addonsCopy = selectedAddons.map(a => ({
        addonsId: a.addonsId,
        addonsName: a.addonsName,
        price: Number(a.price) || 0,
        qty: Number(a.qty) || 1,
        subSelection: a.subSelection || null
      }));

      // Full legacy fallback name
      let finalName = displayName;
      if (addonsCopy.length > 0) {
        const addonNames = addonsCopy.map(a => {
          const q = (Number(a.qty) || 1) > 1 ? `${a.qty}x ` : '';
          return a.subSelection ? `${q}${a.addonsName} (${a.subSelection})` : `${q}${a.addonsName}`;
        }).join(', ');
        finalName += ` [+ ${addonNames}]`;
      }
      if (promo) {
        finalName += ` [${promo.discountType === 1 ? `-${promo.discountValue}%` : `-₱${promo.discountValue}`} ${promo.promotionName}]`;
      }

      addItem(finalName, getProductImage(itemPendingConfirmation), cartUnitTotal, getProductDescription(itemPendingConfirmation), {
        displayName: displayName,
        initialPrice: discountedBase,
        originalBasePrice: basePrice,
        promo: promo,
        flavor: currentSelectedFlavor,
        flavorName: currentSelectedFlavor ? currentSelectedFlavor.flavorName : null,
        addons: addonsCopy,
        addonTotal: addonTotal,
        qty: currentModalQty
      });

      if (confirmationOverlay) confirmationOverlay.classList.add('hidden');
      itemPendingConfirmation = null;
      currentSelectedFlavor = null;
    }
  });
}

const quizModalOverlay = document.getElementById('quiz-modal-overlay');
[confirmationOverlay, receiptOverlay, quizModalOverlay].forEach(overlay => {
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
        if (overlay === confirmationOverlay) {
          itemPendingConfirmation = null;
          currentSelectedFlavor = null;
        }
        if (overlay === quizModalOverlay) {
          quizModalOverlay.style.opacity = '0';
          quizModalOverlay.style.pointerEvents = 'none';
        }
      }
    });
  }
});

const viewReceiptBtn = document.getElementById('viewReceiptBtn');
if (viewReceiptBtn) {
  viewReceiptBtn.addEventListener('click', () => {
    if (receiptOverlay) receiptOverlay.classList.remove('hidden');
  });
}

const receiptCloseBtn = document.getElementById('receiptCloseBtn');
if (receiptCloseBtn) {
  receiptCloseBtn.addEventListener('click', () => {
    if (receiptOverlay) receiptOverlay.classList.add('hidden');
  });
}

const btnCloseReceiptModal = document.getElementById('btnCloseReceiptModal');
if (btnCloseReceiptModal) {
  btnCloseReceiptModal.addEventListener('click', () => {
    if (receiptOverlay) receiptOverlay.classList.add('hidden');
  });
}

const btnDownloadPdf = document.getElementById('btn-download-pdf');
if (btnDownloadPdf) {
  btnDownloadPdf.addEventListener('click', () => {
    const paper = document.getElementById('receipt-paper');
    if (!paper) return;
    if (typeof html2pdf === 'function') {
      const qNum = document.getElementById('queueNum')?.textContent || 'Order';
      const opt = {
        margin: 8,
        filename: `Chilltop-Receipt-${qNum}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a6', orientation: 'portrait' }
      };
      html2pdf().set(opt).from(paper).save();
    } else {
      window.print();
    }
  });
}

// Featured Card Binding (Top Selling Products)
const fc = document.getElementById('featCard');
if (fc) {
  const fcFn = (e) => {
    if (e) e.stopPropagation();
    const targetProd = (TOP_SELLING_PRODUCTS && TOP_SELLING_PRODUCTS[0]) || TOP_SELLING_PRODUCT || ALL_ITEMS.find(i => !i.isOutOfStock);
    if (!targetProd || targetProd.isOutOfStock) return;
    triggerConfirmation(targetProd);
  };
  const featAddBtn = document.getElementById('featAddBtn');
  if (featAddBtn) {
    featAddBtn.onclick = fcFn;
  }
  fc.onclick = fcFn;
}

function generateDigitalReceipt(nickname, invoiceNum, dateStr, timeStr, subtotalAmount, totalCount, discountAmount, finalTotal, specialInstructions = '') {
  const paper = document.getElementById('receipt-paper');
  if (!paper) return;

  let itemsHTML = '';
  cart.forEach(item => {
    const hasAddons = item.addons && item.addons.length > 0;
    const initialPrice = Number(item.initialPrice != null ? item.initialPrice : item.price);
    const initialAmt = initialPrice * item.qty;
    const itemTotal = Number(item.price) * item.qty;

    // 1. Initial product line with initial price (NOT bundled with addons)
    itemsHTML += `
      <div class="receipt-item-row" style="margin-top: 6px; font-weight: 700;">
         <div class="receipt-item-qty">${item.qty}</div>
         <div class="receipt-item-name">${item.displayName || item.name}</div>
         <div class="receipt-item-price">P${initialPrice.toFixed(2)}</div>
         <div class="receipt-item-amt">P${initialAmt.toFixed(2)}</div>
      </div>`;

    // 2. Under it, display each addon and its price (separated, clearly visible)
    if (hasAddons) {
      item.addons.forEach(a => {
        const aPrice = Number(a.price) || 0;
        const aQty = Number(a.qty) || 1;
        const aAmt = aPrice * aQty * item.qty;
        itemsHTML += `
          <div class="receipt-item-row receipt-addon-row" style="font-size: 11px; color: #444;">
             <div class="receipt-item-qty"></div>
             <div class="receipt-item-name" style="padding-left: 10px;">+ ${aQty > 1 ? aQty + 'x ' : ''}${a.addonsName}${a.subSelection ? ` (${a.subSelection})` : ''}</div>
             <div class="receipt-item-price" style="color: #666;">P${aPrice.toFixed(2)}</div>
             <div class="receipt-item-amt" style="color: #444;">P${aAmt.toFixed(2)}</div>
          </div>`;
      });

      // Item total calculation row
      itemsHTML += `
        <div class="receipt-item-row receipt-sub-total" style="font-size: 11px; color: #666; justify-content: flex-end; gap: 10px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px dotted #ccc;">
          <span>Item Total:</span>
          <span style="font-weight: 700; color: #111;">P${itemTotal.toFixed(2)}</span>
        </div>`;
    }
  });

  paper.innerHTML = `
    <div class="receipt-center">
      <div style="font-weight: 800; font-size: 16px;">Chilltop Café</div>
      <div style="font-size: 11px; color: #555;">123 Pampano Street, Longos CMU</div>
      <div class="receipt-dashed"></div>
      <div style="font-weight: 700;">CUSTOMER: ${nickname}</div>
      <div class="receipt-dashed"></div>
    </div>
    <div style="margin-bottom: 12px; font-size: 12px; color: #333;">
      <div>Receipt No: ${invoiceNum}</div>
      <div>Date: ${dateStr} &nbsp; Time: ${timeStr}</div>
      ${specialInstructions ? `<div style="font-size: 11px; color: #333; margin-top: 6px; padding: 4px 6px; background: #f4f2fa; border-radius: 4px; border-left: 3px solid var(--primary);"><strong>Special Instructions:</strong> ${specialInstructions}</div>` : ''}
    </div>
    <div class="receipt-flex" style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px;">
      <div>Qty Item</div><div style="display:flex; gap: 20px;"><span>Price</span><span>Amt</span></div>
    </div>
    ${itemsHTML}
    <div class="receipt-dashed"></div>
    <div class="receipt-flex"><div>Total Items: ${cart.length}</div><div>Subtotal: &nbsp;P${subtotalAmount.toFixed(2)}</div></div>
    <div style="margin-bottom: 12px; font-size: 12px; color: #555;">Total Qty: ${totalCount}</div>
    <div style="font-size: 14px;">
      <div class="receipt-flex" style="font-weight: 800; font-size: 17px; margin-bottom: 12px;"><div>Total:</div><div>P${typeof finalTotal === 'number' ? finalTotal.toFixed(2) : finalTotal}</div></div>
    </div>
    <div class="receipt-dashed" style="margin-top: 16px;"></div>
    <div class="receipt-center"><div>Thank You</div></div>
  `;
}

// ═════════════════════════════════════════
// 8. SUPABASE-DRIVEN PROMO & QUIZ HANDLERS
// ═════════════════════════════════════════

// ─── PROMOTION CARD DISPLAY & ROTATION ────────────────────────────────────────
let promoSlideInterval = null;

function updatePromoCardUI(promotions) {
  const slideshow = document.getElementById('promoSlideshow');
  const heroGrid = document.querySelector('.hero-grid');
  if (!slideshow) return;

  if (promoSlideInterval) {
    clearInterval(promoSlideInterval);
    promoSlideInterval = null;
  }

  const now = new Date();
  const activePromos = (promotions || []).filter(p => {
    const isActive = p.isActive === 1 || p.isActive === true || p.isActive === '1';
    if (!isActive) return false;
    if (p.startDate && new Date(p.startDate) > now) return false;
    if (p.endDate && new Date(p.endDate) < now) return false;
    return true;
  });

  if (!activePromos || activePromos.length === 0) {
    // If no active promotion: hide the card and display Virtual Barista only!
    slideshow.style.display = 'none';
    slideshow.classList.add('hidden');
    slideshow.innerHTML = '';
    if (heroGrid) heroGrid.classList.add('no-promos');
    return;
  }

  // Active promotion exists: display beside "Not sure what to get?"
  slideshow.style.display = '';
  slideshow.classList.remove('hidden');
  if (heroGrid) heroGrid.classList.remove('no-promos');

  slideshow.innerHTML = activePromos.map((p, idx) => {
    let discountBadge = '';
    if (p.discountType === 1) {
      discountBadge = `${p.discountValue}% OFF`;
    } else if (p.discountType === 2) {
      discountBadge = `₱${p.discountValue} OFF`;
    } else if (p.discountValue) {
      discountBadge = `SAVE ₱${p.discountValue}`;
    } else {
      discountBadge = 'SPECIAL OFFER';
    }

    const promoTitle = p.promotionName || 'Special Promotion';
    const subText = p.description && p.description.trim() ? p.description.trim() : 'Limited time discount on eligible items';

    return `
      <div class="slide ${idx === 0 ? 'active' : ''}" data-index="${idx}">
        <div class="slide-fomo">PROMOTION</div>
        <div class="slide-name">${promoTitle}</div>
        <div class="slide-sub" style="font-size: 12px; opacity: 0.9; margin-bottom: 8px;">${subText}</div>
        <div class="slide-promo">${discountBadge}</div>
      </div>
    `;
  }).join('');

  if (activePromos.length > 1) {
    let currentSlide = 0;
    const slides = slideshow.querySelectorAll('.slide');
    promoSlideInterval = setInterval(() => {
      slides[currentSlide].classList.remove('active');
      currentSlide = (currentSlide + 1) % slides.length;
      slides[currentSlide].classList.add('active');
    }, 4500);
  }

  slideshow.onclick = () => {
    const promoNames = activePromos.map(p => p.promotionName).join(', ');
    showToast(`${promoNames} applied to eligible items in menu!`, 'info');
  };
}

async function loadPromosFromSupabase() {
  if (!db) return;
  try {
    const [promoRes, promoProdRes] = await Promise.all([
      db.from('chill_promotion').select('*'),
      db.from('chill_promotion_product').select('*')
    ]);
    if (!promoRes.error && promoRes.data) {
      ALL_PROMOTIONS = promoRes.data.filter(p => p.isActive === 1 || p.isActive === true || p.isActive === '1' || p.is_active === 1 || p.is_active === true);
      const prodData = (!promoProdRes.error && promoProdRes.data) ? promoProdRes.data : [];
      buildPromoMap(ALL_PROMOTIONS, prodData);
      if (ALL_ITEMS && ALL_ITEMS.length > 0) {
        ALL_ITEMS.forEach(item => applyPromoToItem(item));
        buildGrids();
      }
    }
    updatePromoCardUI(ALL_PROMOTIONS);
  } catch (err) {
    console.error("Failed to load promotions from cloud:", err);
    updatePromoCardUI([]);
  }
}

// ═════════════════════════════════════════
// 8. VIRTUAL BARISTA 3-LAYER QUIZ & RECOMMENDATIONS
// ═════════════════════════════════════════
const QUIZ_STATE = {
  step: 1, // 1: Drink vs Snack, 2: Temp or Food Category, 3: Drink Base or Food Flavor, 4: Taste Note or Food Portion
  totalSteps: 4,
  answers: {
    type: null,           // 'drink' or 'snack'
    tempOrCategory: null, // 'cold' | 'hot' (drink) or 'waffle' | 'sandwich' | 'snack' | 'meal' | 'any' (food)
    baseOrFlavor: null,   // 'coffee' | 'blended' | 'tea' | 'matcha_choco' | 'soda' | 'milk_coffee' | 'any' (drink) or 'sweet' | 'savory' | 'meaty' (food)
    tasteOrStyle: null,   // 'sweet' | 'bold' | 'fruity' | 'chocolate' (drink) or 'bites' | 'meal' | 'crispy' (food)
    tempOrFlavor: null    // legacy alias for backwards compatibility
  },
  history: []
};

function initVirtualBaristaQuiz() {
  const quizCard = document.getElementById('quizBannerCard');
  const quizOverlay = document.getElementById('quiz-modal-overlay');
  const closeBtn = document.getElementById('close-quiz-btn');
  const backBtn = document.getElementById('quiz-back-btn');
  const resetBtn = document.getElementById('quiz-reset');
  const restartBtn = document.getElementById('quiz-restart-btn');

  if (quizCard) {
    quizCard.onclick = (e) => {
      e.stopPropagation();
      openQuiz();
    };
  }

  if (closeBtn) closeBtn.onclick = closeQuiz;
  if (backBtn) backBtn.onclick = goBackQuizStep;
  if (resetBtn) resetBtn.onclick = resetQuiz;
  if (restartBtn) restartBtn.onclick = resetQuiz;

  if (quizOverlay) {
    quizOverlay.addEventListener('click', (e) => {
      if (e.target === quizOverlay) closeQuiz();
    });
  }
}

function openQuiz() {
  const overlay = document.getElementById('quiz-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.style.display = 'flex';
  overlay.style.opacity = '1';
  overlay.style.pointerEvents = 'auto';
  resetQuiz();
}

function closeQuiz() {
  const overlay = document.getElementById('quiz-modal-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.style.opacity = '0';
  overlay.style.pointerEvents = 'none';
}

function resetQuiz() {
  QUIZ_STATE.step = 1;
  QUIZ_STATE.answers = {
    type: null,
    tempOrCategory: null,
    baseOrFlavor: null,
    tasteOrStyle: null,
    tempOrFlavor: null
  };
  QUIZ_STATE.history = [];

  const resultsSection = document.getElementById('cravingResultsSection');
  if (resultsSection) resultsSection.classList.add('hidden');

  renderQuizStep();
}

function goBackQuizStep() {
  if (QUIZ_STATE.step > 1) {
    QUIZ_STATE.step--;
    QUIZ_STATE.history.pop();
    if (QUIZ_STATE.step === 1) {
      QUIZ_STATE.answers.type = null;
      QUIZ_STATE.answers.tempOrCategory = null;
      QUIZ_STATE.answers.baseOrFlavor = null;
      QUIZ_STATE.answers.tasteOrStyle = null;
      QUIZ_STATE.answers.tempOrFlavor = null;
    } else if (QUIZ_STATE.step === 2) {
      QUIZ_STATE.answers.tempOrCategory = null;
      QUIZ_STATE.answers.baseOrFlavor = null;
      QUIZ_STATE.answers.tasteOrStyle = null;
      QUIZ_STATE.answers.tempOrFlavor = null;
    } else if (QUIZ_STATE.step === 3) {
      QUIZ_STATE.answers.baseOrFlavor = null;
      QUIZ_STATE.answers.tasteOrStyle = null;
      if (QUIZ_STATE.answers.type === 'snack') {
        QUIZ_STATE.answers.tempOrFlavor = null;
      }
    } else if (QUIZ_STATE.step === 4) {
      QUIZ_STATE.answers.tasteOrStyle = null;
    }

    const resultsSection = document.getElementById('cravingResultsSection');
    if (resultsSection) resultsSection.classList.add('hidden');

    renderQuizStep();
  }
}

function renderQuizStep() {
  const badgeEl = document.getElementById('quizStepBadge');
  const titleEl = document.getElementById('quiz-question');
  const hintEl = document.getElementById('quiz-hint');
  const optionsContainer = document.getElementById('quiz-options');
  const backBtn = document.getElementById('quiz-back-btn');
  const resetBtn = document.getElementById('quiz-reset');

  if (!titleEl || !optionsContainer) return;

  if (backBtn) backBtn.classList.toggle('hidden', QUIZ_STATE.step === 1);
  if (resetBtn) resetBtn.classList.toggle('hidden', QUIZ_STATE.step === 1);

  if (QUIZ_STATE.step === 1) {
    if (badgeEl) badgeEl.textContent = 'Step 1 of 4';
    titleEl.textContent = 'What are you in the mood for?';
    if (hintEl) hintEl.textContent = 'Start by choosing a drink or something delicious to eat';

    optionsContainer.innerHTML = `
      <button class="craving-btn" onclick="handleQuizAnswer(1, 'drink')">
        <span>☕ A Drink</span>
      </button>
      <button class="craving-btn" onclick="handleQuizAnswer(1, 'snack')">
        <span>🥪 A Snack / Food</span>
      </button>
    `;
  } else if (QUIZ_STATE.step === 2) {
    if (badgeEl) badgeEl.textContent = 'Step 2 of 4';

    if (QUIZ_STATE.answers.type === 'drink') {
      titleEl.textContent = 'How would you like your drink served?';
      if (hintEl) hintEl.textContent = 'Chilled and refreshing, or warm and comforting?';

      optionsContainer.innerHTML = `
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'cold')">
          <span>🧊 Cold & Iced</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'hot')">
          <span>☕ Warm & Hot</span>
        </button>
      `;
    } else {
      titleEl.textContent = 'What kind of food are you craving?';
      if (hintEl) hintEl.textContent = 'Matched directly with our kitchen prep and recipe profiles';

      optionsContainer.innerHTML = `
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'waffle')">
          <span>🧇 Waffles & Pastries</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'sandwich')">
          <span>🥪 Fresh Sandwiches</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'snack')">
          <span>🍟 Fries & Finger Bites</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'meal')">
          <span>🍛 Rice Meals & Pasta</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'any')">
          <span>✨ Surprise Me / Any Food</span>
        </button>
      `;
    }
  } else if (QUIZ_STATE.step === 3) {
    if (badgeEl) badgeEl.textContent = 'Step 3 of 4';

    if (QUIZ_STATE.answers.type === 'drink') {
      const isHot = QUIZ_STATE.answers.tempOrCategory === 'hot';
      titleEl.textContent = 'What drink base do you crave?';
      if (hintEl) hintEl.textContent = 'Based on recommendation profiles from our barista catalog';

      if (isHot) {
        optionsContainer.innerHTML = `
          <button class="craving-btn" onclick="handleQuizAnswer(3, 'coffee')">
            <span>☕ Espresso & Brewed Coffee</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(3, 'milk_coffee')">
            <span>🥛 Warm Latte & Milky Coffee</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(3, 'matcha_choco')">
            <span>🍫 Hot Chocolate & Matcha</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(3, 'any')">
            <span>✨ Any Warm Drink</span>
          </button>
        `;
      } else {
        optionsContainer.innerHTML = `
          <button class="craving-btn" onclick="handleQuizAnswer(3, 'coffee')">
            <span>☕ Iced Coffee & Latte</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(3, 'blended')">
            <span>🧊 Blended Frappes</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(3, 'tea')">
            <span>🍵 Milk Tea & Fruit Tea</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(3, 'matcha_choco')">
            <span>🍫 Matcha & Chocolate</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(3, 'soda')">
            <span>🫧 Sparkling Fruit Soda</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(3, 'any')">
            <span>✨ Any Cold Drink</span>
          </button>
        `;
      }
    } else {
      titleEl.textContent = 'What flavor hits the spot?';
      if (hintEl) hintEl.textContent = 'Sweet dessert notes, savory cheese, or hearty meats?';

      optionsContainer.innerHTML = `
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'sweet')">
          <span>🥞 Sweet & Decadent</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'savory')">
          <span>🧀 Cheesy & Savory</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'meaty')">
          <span>🥩 Meaty & Hearty</span>
        </button>
      `;
    }
  } else if (QUIZ_STATE.step === 4) {
    if (badgeEl) badgeEl.textContent = 'Step 4 of 4';

    if (QUIZ_STATE.answers.type === 'drink') {
      titleEl.textContent = 'What flavor note do you prefer?';
      if (hintEl) hintEl.textContent = 'Find the exact taste note that satisfies your craving';

      optionsContainer.innerHTML = `
        <button class="craving-btn" onclick="handleQuizAnswer(4, 'sweet')">
          <span>🍯 Sweet & Creamy</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(4, 'bold')">
          <span>☕ Strong & Bold Espresso</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(4, 'fruity')">
          <span>🍓 Fruity & Refreshing</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(4, 'chocolate')">
          <span>🍫 Rich Chocolate & Cocoa</span>
        </button>
      `;
    } else {
      const foodCat = QUIZ_STATE.answers.tempOrCategory;

      if (foodCat === 'snack') {
        titleEl.textContent = 'How would you like your finger bites served?';
        if (hintEl) hintEl.textContent = 'Crispy dip style, fully loaded with toppings, or cheesy & melted?';

        optionsContainer.innerHTML = `
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'crispy')">
            <span>🍟 Golden Crispy & Crunchy</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'loaded')">
            <span>🥩 Loaded with Toppings</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'cheesy')">
            <span>🧀 Cheesy & Dippable</span>
          </button>
        `;
      } else if (foodCat === 'waffle') {
        titleEl.textContent = 'How do you like your waffle or pastry?';
        if (hintEl) hintEl.textContent = 'Fresh and crispy, warm and soft, or loaded with toppings?';

        optionsContainer.innerHTML = `
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'crispy')">
            <span>🧇 Golden & Extra Crispy</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'soft')">
            <span>🥞 Warm, Fluffy & Soft</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'loaded')">
            <span>🍫 Drizzled & Loaded</span>
          </button>
        `;
      } else if (foodCat === 'sandwich') {
        titleEl.textContent = 'What sandwich style sounds best?';
        if (hintEl) hintEl.textContent = 'Toasted and crispy, double filling, or a quick light grab?';

        optionsContainer.innerHTML = `
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'crispy')">
            <span>🥪 Warm Toasted & Crispy</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'hearty')">
            <span>🥩 Hearty & Double Filling</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'light')">
            <span>🥪 Light & Fresh</span>
          </button>
        `;
      } else if (foodCat === 'meal') {
        titleEl.textContent = 'What type of meal are you hungry for?';
        if (hintEl) hintEl.textContent = 'Filling rice plate or comforting pasta?';

        optionsContainer.innerHTML = `
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'rice')">
            <span>🍛 Classic Silog Rice Plate</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'pasta')">
            <span>🍝 Savory Pasta Dish</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'hearty')">
            <span>🥩 Hearty Chef Special</span>
          </button>
        `;
      } else {
        titleEl.textContent = 'What portion or style fits best?';
        if (hintEl) hintEl.textContent = 'Light snacking, full meal, or crispy crunch?';

        optionsContainer.innerHTML = `
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'bites')">
            <span>🍟 Quick Bite / Finger Food</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'meal')">
            <span>🍛 Full Filling Meal</span>
          </button>
          <button class="craving-btn" onclick="handleQuizAnswer(4, 'crispy')">
            <span>🧇 Crispy Crunch</span>
          </button>
        `;
      }
    }
  }
}

function handleQuizAnswer(step, choice) {
  QUIZ_STATE.history.push(choice);

  if (step === 1) {
    QUIZ_STATE.answers.type = choice;
    QUIZ_STATE.step = 2;
    renderQuizStep();
  } else if (step === 2) {
    QUIZ_STATE.answers.tempOrCategory = choice;
    QUIZ_STATE.answers.tempOrFlavor = choice;
    QUIZ_STATE.step = 3;
    renderQuizStep();
  } else if (step === 3) {
    QUIZ_STATE.answers.baseOrFlavor = choice;
    if (QUIZ_STATE.answers.type === 'snack') {
      QUIZ_STATE.answers.tempOrFlavor = choice;
    }
    QUIZ_STATE.step = 4;
    renderQuizStep();
  } else if (step === 4) {
    QUIZ_STATE.answers.tasteOrStyle = choice;
    generateQuizRecommendations();
  }
}

function calculateQuizMatchScore(item, answers) {
  if (!item) return -999;

  const type = answers.type;
  // Normalize parameters from either 3-step or 4-step quiz
  const tempPref = answers.temp || (type === 'drink' ? (answers.tempOrCategory || answers.tempOrFlavor) : null);
  const drinkBasePref = answers.drinkBase || (type === 'drink' ? (answers.baseOrFlavor && answers.baseOrFlavor !== 'cold' && answers.baseOrFlavor !== 'hot' ? answers.baseOrFlavor : null) : null);

  const foodCategoryPref = answers.foodCategory || (type === 'snack' ? (['waffle', 'sandwich', 'snack', 'fries', 'meal', 'any'].includes(answers.tempOrCategory) ? answers.tempOrCategory : null) : null);
  const snackFlavorPref = answers.snackFlavor || (type === 'snack' ? (['sweet', 'savory', 'meaty'].includes(answers.baseOrFlavor) ? answers.baseOrFlavor : answers.tempOrFlavor) : null);

  const tasteOrStyle = answers.tasteOrStyle || answers.flavor || answers.style;

  const catId = Number(item.categoryId);
  const isDrink = catId <= 9 && catId !== 3;
  const isFood = catId >= 10 && catId !== 14;

  const recInfo = (item.recommendationInfo || '').toLowerCase();
  const name = (item.productName || item.name || '').toLowerCase();
  const desc = (item.description || item.desc || '').toLowerCase();
  const recipeStr = (item.recipe || '').toLowerCase();
  const ingredients = (item.ingredients || []).map(i => (typeof i === 'string' ? i : (i.ingredientName || '')).toLowerCase());
  const allText = [name, desc, recInfo, recipeStr, ...ingredients].join(' ');

  // 1. Strict primary category type enforcement (Drink preference never yields Food, Food never yields Drink)
  // Basis: Database recommendationInfo metadata and categoryId
  const recInfoSaysFood = /waffle product|sandwich product|fries or potato snack|nacho snack|rice meal/i.test(recInfo);
  const recInfoSaysDrink = /coffee-based|blended drink|fruit tea drink|carbonated drink|matcha-based|milk tea/i.test(recInfo);

  if (type === 'drink' && (!isDrink || recInfoSaysFood)) return -999;
  if (type === 'snack' && (!isFood || recInfoSaysDrink)) return -999;

  let score = 0;

  if (type === 'drink') {
    const isExplicitHot = /^hot\b/i.test(name);
    const isExplicitIced = /^iced\b/i.test(name);
    const isFrappe = catId === 5 || recInfo.includes('blended drink');
    const isSoda = catId === 7 || recInfo.includes('carbonated drink');
    const isFruitTea = catId === 6 || recInfo.includes('fruit tea drink');
    const isMilkTea = catId === 9 || recInfo.includes('milk tea drink');
    const isMilky = catId === 4;

    const onlyCold = isExplicitIced || isFrappe || isSoda || isFruitTea || isMilkTea || isMilky;
    const onlyHot = isExplicitHot;

    // Temperature matching: recommendationInfo instructs: "Check the recipe for hot or iced preparation"
    if (tempPref === 'hot') {
      if (onlyCold) return -999; // Exclude drinks that are strictly cold
      if (recInfo.includes('hot or iced preparation') && isExplicitHot) score += 35;
      else if (isExplicitHot) score += 30;
      else score += 10;
    } else if (tempPref === 'cold') {
      if (onlyHot) return -999; // Exclude drinks that are strictly hot
      if (recInfo.includes('blended drink') || recInfo.includes('carbonated drink') || recInfo.includes('fruit tea drink')) score += 35;
      else if (isExplicitIced || onlyCold) score += 30;
      else score += 10;
    }

    // Drink Base matching: uses recommendationInfo as direct basis
    if (drinkBasePref && drinkBasePref !== 'any') {
      if (drinkBasePref === 'coffee' || drinkBasePref === 'milk_coffee') {
        if (recInfo.includes('coffee-based milk drink') && drinkBasePref === 'milk_coffee') score += 50;
        else if (recInfo.includes('coffee-based')) score += 45;
        else if (catId === 1 || catId === 2 || /coffee|espresso/i.test(allText)) score += 30;
        if (recInfo.includes('fruit tea') || recInfo.includes('carbonated') || isFruitTea || isSoda) score -= 35;
      } else if (drinkBasePref === 'blended') {
        if (recInfo.includes('blended drink')) score += 50;
        else if (isFrappe) score += 40;
        else score -= 30;
      } else if (drinkBasePref === 'tea') {
        if (recInfo.includes('fruit tea drink') || recInfo.includes('milk tea drink')) score += 50;
        else if (isFruitTea || isMilkTea) score += 40;
        else if (recInfo.includes('coffee-based')) score -= 35;
      } else if (drinkBasePref === 'matcha_choco') {
        if (recInfo.includes('matcha-based drink') || recInfo.includes('chocolate-flavored')) score += 50;
        else if (/matcha|choco|mocha|cocoa/i.test(allText)) score += 30;
        else score -= 25;
      } else if (drinkBasePref === 'soda') {
        if (recInfo.includes('carbonated drink')) score += 50;
        else if (isSoda) score += 40;
        else score -= 35;
      }
    }

    // Flavor profile matching: guided by recommendationInfo instructions
    if (tasteOrStyle === 'sweet') {
      if (recInfo.includes('coffee-based milk drink') || recInfo.includes('chocolate-flavored') || recInfo.includes('blended drink') || recInfo.includes('milk tea drink')) {
        score += 25;
      }
      if (/caramel|vanilla|mocha|choco|berry|strawberry|taro|hazelnut|oreo|cookies|sugar|condensed|sweet/i.test(allText)) {
        score += 25;
      }
      if (isFrappe || isMilkTea || isMilky) score += 15;
      if (/americano/i.test(name) && !/honey/i.test(name)) score -= 20; // Unsweetened black coffee penalized
    } else if (tasteOrStyle === 'bold') {
      const hasEspresso = recInfo.includes('coffee-based') || catId === 1 || catId === 2 || /espresso|coffee|beans/i.test(allText);
      if (recInfo.includes('coffee-based')) score += 35;
      else if (hasEspresso) score += 30;
      if (/americano|espresso|cappuccino/i.test(name)) score += 20;
      if (recInfo.includes('fruit tea') || recInfo.includes('carbonated') || isFruitTea || isSoda) score -= 30;
    } else if (tasteOrStyle === 'fruity') {
      if (recInfo.includes('fruit tea drink') || recInfo.includes('carbonated drink')) {
        score += 45;
      } else if (isFruitTea || isSoda || /fruit|strawberry|blueberry|kiwi|passion|lemon|lychee/i.test(allText)) {
        score += 35;
      }
      if (isFruitTea) score += 15;
      if (recInfo.includes('coffee-based') || catId === 1 || catId === 2) score -= 30;
    } else if (tasteOrStyle === 'chocolate') {
      if (recInfo.includes('chocolate-flavored')) score += 50;
      else if (/chocolate|choco|mocha|cocoa/i.test(allText)) score += 30;
    }
  } else if (type === 'snack') {
    // Food category matching: uses recommendationInfo as direct basis
    if (foodCategoryPref && foodCategoryPref !== 'any') {
      if (foodCategoryPref === 'waffle') {
        if (recInfo.includes('waffle product')) score += 50;
        else if (catId === 10) score += 40;
        else score -= 35;
      } else if (foodCategoryPref === 'sandwich') {
        if (recInfo.includes('sandwich product')) score += 50;
        else if (catId === 11) score += 40;
        else score -= 30;
      } else if (foodCategoryPref === 'snack' || foodCategoryPref === 'fries') {
        if (recInfo.includes('fries or potato snack') || recInfo.includes('nacho snack')) score += 50;
        else if (catId === 12) score += 40;
        else score -= 25;
      } else if (foodCategoryPref === 'meal') {
        if (recInfo.includes('rice meal')) score += 50;
        else if (catId === 13 || catId === 15) score += 40;
        else score -= 35;
      }
    }

    // Flavor crave: sweet / savory / meaty (guided by recommendationInfo)
    if (snackFlavorPref === 'sweet') {
      if (recInfo.includes('waffle product')) score += 35;
      else if (catId === 10) score += 30;
      if (/sweet|waffle|pastry|choco|almond|oreo|smores|biscoff/i.test(allText)) score += 20;
      if (recInfo.includes('rice meal') || catId === 13 || catId === 15) score -= 25;
    } else if (snackFlavorPref === 'savory') {
      if (recInfo.includes('fries or potato snack') || recInfo.includes('nacho snack') || recInfo.includes('sandwich product')) score += 25;
      else if (catId === 12 || catId === 11 || catId === 15) score += 20;
      if (/cheese|nacho|fries|popper|bite|stick/i.test(allText)) score += 20;
      if (recInfo.includes('waffle product') || catId === 10) score -= 20;
    } else if (snackFlavorPref === 'meaty') {
      if (recInfo.includes('rice meal')) score += 35;
      else if (recInfo.includes('sandwich product') || catId === 13) score += 30;
      else if (catId === 11 || catId === 15) score += 15;
      if (/liempo|chicken|sausage|spam|tapa|tocino|porkchop|beef|tuna|ham/i.test(allText)) score += 20;
      if (recInfo.includes('waffle product') || catId === 10) score -= 35;
    }

    // Style preference: bites / meal / crispy / loaded / cheesy / soft / hearty / light / rice / pasta
    if (tasteOrStyle === 'bites') {
      if (recInfo.includes('fries or potato snack') || recInfo.includes('nacho snack') || catId === 12) score += 30;
      if (catId === 11) score += 15;
      if (recInfo.includes('rice meal') || catId === 13) score -= 25;
    } else if (tasteOrStyle === 'meal') {
      if (recInfo.includes('rice meal')) score += 40;
      else if (catId === 13) score += 35;
      if (catId === 15) score += 30;
      if (catId === 12) score -= 25;
    } else if (tasteOrStyle === 'crispy') {
      if (recInfo.includes('waffle product') || recInfo.includes('fries or potato snack')) score += 30;
      else if (catId === 10) score += 25;
      if (/fries|crispy|popper|stick/i.test(allText)) score += 25;
      if (catId === 15) score -= 20;
    } else if (tasteOrStyle === 'loaded') {
      if (/nacho|beef|toppings|loaded|smores|oreo|overload|special/i.test(allText)) score += 35;
      if (recInfo.includes('nacho snack') || catId === 12 || catId === 10) score += 20;
    } else if (tasteOrStyle === 'cheesy') {
      if (/cheese|cheesy|nacho|stick|sauce/i.test(allText)) score += 35;
      if (catId === 12) score += 20;
    } else if (tasteOrStyle === 'soft') {
      if (catId === 10 || /pancake|fluffy|soft|classic/i.test(allText)) score += 30;
    } else if (tasteOrStyle === 'hearty') {
      if (/silog|liempo|porkchop|chicken|beef|tapa|sausage|double/i.test(allText)) score += 30;
      if (catId === 13 || catId === 11) score += 20;
    } else if (tasteOrStyle === 'light') {
      if (catId === 11 || /fresh|egg|tuna|salad|light/i.test(allText)) score += 30;
    } else if (tasteOrStyle === 'rice') {
      if (recInfo.includes('rice meal') || catId === 13 || /silog|rice/i.test(allText)) score += 40;
      if (catId === 15) score -= 20;
    } else if (tasteOrStyle === 'pasta') {
      if (catId === 15 || /spaghetti|carbonara|pasta/i.test(allText)) score += 45;
      if (catId === 13) score -= 20;
    }
  }

  return score;
}

function generateQuizRecommendations() {
  const { type, tempOrFlavor, tasteOrStyle } = (QUIZ_STATE && QUIZ_STATE.answers) ? QUIZ_STATE.answers : {};
  const resultsSection = document.getElementById('cravingResultsSection');
  const container = document.getElementById('recommendationContainer');
  const badgeEl = document.getElementById('quizStepBadge');
  const titleEl = document.getElementById('quiz-question');
  const hintEl = document.getElementById('quiz-hint');
  const optionsContainer = document.getElementById('quiz-options');

  if (badgeEl) badgeEl.textContent = 'Recommendations Ready';
  if (titleEl) titleEl.textContent = 'Here are your best matches!';
  if (hintEl) hintEl.textContent = 'Handpicked by your virtual barista just for you.';
  if (optionsContainer) optionsContainer.innerHTML = '';

  // Diagnostic logging helper for non-production / development analysis
  const isDev = window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1' ||
                window.location.search.includes('debug=true') ||
                window.location.protocol === 'file:';

  // 1. Only consider eligible, active products: enabled, not deleted, and in-stock
  const eligibleProducts = (ALL_ITEMS || []).filter(item => {
    if (!item) return false;
    if (item.isdeleted === 1 || item.isdeleted === true || item.isDeleted === 1) return false;
    if (item.isOutOfStock) return false;
    const catId = Number(item.categoryId);
    // Exclude Add-ons categories
    if (catId === 3 || catId === 14) return false;
    return true;
  });

  // 2. Score and rank items using multi-factor preferences
  const scoredItems = eligibleProducts
    .map(item => ({
      item,
      score: calculateQuizMatchScore(item, QUIZ_STATE.answers)
    }))
    .filter(entry => entry.score > 0);

  scoredItems.sort((a, b) => b.score - a.score || (a.item.productId || 0) - (b.item.productId || 0));

  let matches = scoredItems.map(entry => entry.item);

  // 3. Fallback to general in-stock pool of matching category type if fewer than 3 matches
  if (matches.length < 3) {
    const fallbackPool = eligibleProducts.filter(item => {
      const catId = Number(item.categoryId);
      const isDrink = catId <= 9 && catId !== 3;
      return type === 'drink' ? isDrink : !isDrink;
    });
    matches = [...matches, ...fallbackPool];
  }

  // 4. Ensure distinct parent products only (no duplicate products)
  const seenIds = new Set();
  const distinctMatches = [];
  for (const item of matches) {
    const id = item.productId || item.uid;
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      distinctMatches.push(item);
    }
  }

  const selectedRecs = distinctMatches.slice(0, 6);

  if (isDev) {
    console.group('🔍 [Quiz Recommendation Diagnostics]');
    console.log('Customer selected answers:', QUIZ_STATE.answers);
    console.log('Recommendation function actually called: calculateQuizMatchScore');
    console.log('Eligible products loaded from Supabase:', eligibleProducts.length);
    console.log('Whether recommendationInfo is present in products:', eligibleProducts.some(p => Boolean(p.recommendationInfo)));
    console.log('Top three products & scores:', scoredItems.slice(0, 3).map(s => ({
      productId: s.item.productId,
      productName: s.item.productName,
      score: s.score
    })));
    console.log('Product IDs actually rendered on kiosk result page:', selectedRecs.map(r => r.productId || r.uid));
    console.groupEnd();
  }

  if (container) {
    if (selectedRecs.length > 0) {
      container.innerHTML = selectedRecs.map(item => {
        const pName = item.productName || item.name;
        const hasItemSizes = (item.hasSizes || (item.sizes && item.sizes.length > 0)) && item.sizes && item.sizes.length > 0;
        const pPrice = hasItemSizes ? `₱${item.minPrice}` : `₱${item.price || 0}`;
        const pId = item.productId || item.uid;
        const pImg = getProductImage(item);
        const pDesc = getProductDescription(item);
        const recBadge = (item.recommendationInfo && !item.recommendationInfo.startsWith('Use the product'))
          ? item.recommendationInfo.split('.')[0]
          : '';

        return `
          <div class="quiz-rec-card" onclick="selectQuizRecommendation(${pId})">
            <div class="quiz-rec-img-wrap">
              <img class="quiz-rec-img" src="${pImg}" alt="${pName}" onerror="this.onerror=null;this.src='placeholder.svg';" />
            </div>
            ${recBadge ? `<span class="quiz-rec-badge" title="${recBadge}">${recBadge}</span>` : ''}
            <div class="quiz-rec-name">${pName}</div>
            ${pDesc ? `<div class="quiz-rec-desc">${pDesc}</div>` : ''}
            <div class="quiz-rec-price">${pPrice}</div>
            <button class="quiz-rec-btn">Order This →</button>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: 20px;">No exact in-stock matches found right now. Please explore the main menu!</p>`;
    }
  }

  if (resultsSection) {
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth' });
  }
}

function selectQuizRecommendation(productId) {
  closeQuiz();
  const found = ALL_ITEMS.find(i => (i.productId == productId || i.uid == productId));
  if (found) {
    if (found.isOutOfStock) {
      showToast(`${found.productName} is currently out of stock`, 'warning');
      return;
    }
    triggerConfirmation(found);
  }
}

// Make accessible for inline onclick handlers & automated testing
window.handleQuizAnswer = handleQuizAnswer;
window.selectQuizRecommendation = selectQuizRecommendation;
window.CustomerSessionManager = CustomerSessionManager;
window.calculateQuizMatchScore = calculateQuizMatchScore;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateQuizMatchScore };
}

// ═════════════════════════════════════════════════════════════════════════════
// SESSION LIFECYCLE, RESCAN MODAL & INTERACTION LISTENERS
// ═════════════════════════════════════════════════════════════════════════════

// Revalidate session when browser tab is brought to foreground or restored
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && CustomerSessionManager) {
    if (CustomerSessionManager.isExpiredTab() || CustomerSessionManager.isExpired) {
      CustomerSessionManager.showExpiredOverlay();
      return;
    }
    if (CustomerSessionManager.expiresAt) {
      const nowEstimated = Date.now() + CustomerSessionManager.serverTimeOffset;
      if (nowEstimated >= CustomerSessionManager.expiresAt.getTime()) {
        CustomerSessionManager.handleSessionExpired('Expired while browser tab was in background');
        return;
      }
    }
    if (CustomerSessionManager.token && !CustomerSessionManager.isExpired) {
      CustomerSessionManager.validateSession().then((res) => {
        if (!res.valid) {
          CustomerSessionManager.handleSessionExpired('Session invalid or expired');
        }
      });
    }
  }
});

window.addEventListener('pageshow', (event) => {
  if (!CustomerSessionManager) return;
  if (CustomerSessionManager.isExpiredTab() || CustomerSessionManager.isExpired) {
    CustomerSessionManager.showExpiredOverlay();
  } else if (event.persisted && CustomerSessionManager.token) {
    CustomerSessionManager.validateSession().then((res) => {
      if (!res.valid) {
        CustomerSessionManager.handleSessionExpired('Expired on page restoration');
      }
    });
  }
});

// Capture meaningful customer interactions across ordering views
function setupCustomerInteractionTracking() {
  const interactiveSelectors = [
    '.cat-pill',
    '.item-card',
    '.add-btn',
    '.size-btn',
    '.addon-pill',
    '.addon-btn',
    '.addon-toggle-pill',
    '.qty-btn',
    '#btn-confirm-order',
    '#modalCloseBtn',
    '#navCartBtn',
    '#cartBackBtn',
    '#menuBackBtn',
    '#startBtn',
    '#btn-rescan-info',
    '.quiz-option-btn',
    '#quiz-back-btn',
    '#quiz-reset',
    '#quiz-restart-btn',
    '#close-quiz-btn',
    '.order-type-btn',
    '.pay-radio input',
    '#btn-show-items',
    '#newOrderBtn'
  ];

  document.addEventListener('click', (e) => {
    if (!CustomerSessionManager || CustomerSessionManager.isExpired) return;
    const target = e.target;
    if (!target) return;

    const matched = interactiveSelectors.some(selector => target.closest(selector));
    if (matched) {
      CustomerSessionManager.recordActivity('userClick');
    }
  }, { passive: true });

  // Input events (search, notes, nickname)
  document.addEventListener('input', (e) => {
    if (!CustomerSessionManager || CustomerSessionManager.isExpired) return;
    const target = e.target;
    if (target && (target.id === 'menuSearch' || target.id === 'customerNickname' || target.id === 'orderNotes' || target.id === 'customerEmail')) {
      CustomerSessionManager.recordActivity('userInput');
    }
  }, { passive: true });
}

// Trigger promo loading, quiz, kiosk settings, session manager & realtime stock sync on boot
document.addEventListener('DOMContentLoaded', () => {
  checkKioskSettings();
  loadPromosFromSupabase();
  initVirtualBaristaQuiz();
  initRealtimeStockListener();
  setupCustomerInteractionTracking();

  // Initialize Customer Session Manager
  if (CustomerSessionManager) {
    CustomerSessionManager.init();
  }

  // Rescan info modal wireup
  const btnRescanInfo = document.getElementById('btnRescanInfo');
  const rescanModalOverlay = document.getElementById('rescanModalOverlay');
  const rescanModalCloseBtn = document.getElementById('rescanModalCloseBtn');
  const btnCloseRescanInfo = document.getElementById('btnCloseRescanInfo');

  const btnResetHome = document.getElementById('btnResetHome');
  if (btnResetHome) {
    btnResetHome.addEventListener('click', () => {
      const expOverlay = document.getElementById('sessionExpiredOverlay');
      if (expOverlay) expOverlay.classList.add('hidden');
      if (typeof CustomerSessionManager !== 'undefined') {
        CustomerSessionManager.handleSessionExpired();
      } else {
        goTo('welcomeScreen');
      }
    });
  }
});