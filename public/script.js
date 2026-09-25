let ALL_ITEMS = [];
let ALL_SIZES = [];
let ALL_PRODUCT_SIZES = [];
let ALL_ADDONS = [];
let ALL_PRODUCT_ADDONS = [];
let ALL_RECIPES = [];
let ALL_INGREDIENTS = [];
let ALL_ADDON_RECIPES = {};
let ALL_PROMOTIONS = [];        // Active promotions from chill_promotion
let PROMO_PRODUCT_IDS = {};    // Map: productId -> promotion object
let TOP_SELLING_PRODUCT = null;
let cart = [];

// ═════════════════════════════════════════
// 1. SUPABASE DATABASE CONNECTION
// ═════════════════════════════════════════
const SUPABASE_URL = 'https://nkhyzzevgyteaehwexsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raHl6emV2Z3l0ZWFlaHdleHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzgzNzEsImV4cCI6MjEwMTE1NDM3MX0.tDJzxwg5Vjsynbi9612tjiO19YqYAstJIyeYAOPczs8';

const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Product image helper using Supabase imageUrl with reliable fallbacks
function getProductImage(item) {
  if (item && item.imageUrl && typeof item.imageUrl === 'string' && item.imageUrl.trim() !== '') {
    const url = item.imageUrl.trim();
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
      return url;
    }
    if (url.startsWith('/storage/') || url.startsWith('storage/')) {
      return `${SUPABASE_URL}/${url.replace(/^\//, '')}`;
    }
    if (url.startsWith('/data/') || url.startsWith('/storage/emulated/') || url.startsWith('file://')) {
      return 'placeholder.svg';
    }
    return url;
  }
  return 'placeholder.svg';
}

// ─── PROMOTION HELPERS ────────────────────────────────────────────────────────
// Build PROMO_PRODUCT_IDS from fetched promotion data
function buildPromoMap(promotions, promoProducts) {
  PROMO_PRODUCT_IDS = {};
  const now = new Date();

  promotions.forEach(promo => {
    if (!promo.isActive) return;
    // Check date range
    if (promo.startDate && new Date(promo.startDate) > now) return;
    if (promo.endDate && new Date(promo.endDate) < now) return;

    promoProducts.forEach(pp => {
      if (Number(pp.promotionid) !== Number(promo.promotionId)) return;
      if (!pp.enabled) return;
      const pId = Number(pp.productid);
      // Keep the best (highest) discount if multiple promos apply
      const existing = PROMO_PRODUCT_IDS[pId];
      const discountPct = promo.discountType === 1 ? Number(promo.discountValue) : 0; // type 1 = percentage
      const discountFlat = promo.discountType === 2 ? Number(promo.discountValue) : 0; // type 2 = fixed
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
    });
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

// Global tracking of out of stock ingredients & map
let OOS_INGREDIENT_IDS = new Set();
let OOS_INGREDIENT_MAP = {};

// Helper to determine out-of-stock status strictly based on database chill_recipe & chill_ingredient
function checkProductStockStatus(product, recipeMap, oosIngIds, oosIngMap, allIngredients) {
  const pId = product.productId;
  const ingIds = (recipeMap && (recipeMap[pId] || recipeMap[Number(pId)] || recipeMap[String(pId)])) || [];

  // Exact database connection: chill_recipe -> chill_ingredient
  if (ingIds.length > 0) {
    for (const rawIngId of ingIds) {
      const ingId = Number(rawIngId);
      if (oosIngIds.has(ingId) || oosIngIds.has(rawIngId)) {
        const ing = (oosIngMap && (oosIngMap[ingId] || oosIngMap[rawIngId])) || 
                    (allIngredients && allIngredients.find(i => Number(i.ingredientId) === ingId));
        return {
          isOutOfStock: true,
          reason: `${ing ? ing.ingredientName : 'Required ingredient'} is out of stock`
        };
      }
    }
  }

  return { isOutOfStock: false, reason: '' };
}

// Helper to get exact recipe from database (chill_recipe connected to chill_ingredient)
// Strictly database-driven: does NOT make up any ingredients.
function getProductIngredients(productId, productRecipeMap) {
  if (productRecipeMap) {
    const list = productRecipeMap[productId] || productRecipeMap[Number(productId)] || productRecipeMap[String(productId)];
    if (list && list.length > 0) {
      return list.join(', ');
    }
  }
  return '';
}

// Update card UI in-place when stock becomes available or out of stock
function updateCardStockUI(item) {
  const cards = document.querySelectorAll(`[data-product-id="${item.productId}"]`);
  cards.forEach(card => {
    const isOOS = !!item.isOutOfStock;
    card.classList.toggle('out-of-stock', isOOS);

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

    // Dynamic recipe display on card
    let recipeEl = card.querySelector('.item-recipe');
    if (item.recipe) {
      if (!recipeEl) {
        recipeEl = document.createElement('div');
        recipeEl.className = 'item-recipe';
        const spacer = card.querySelector('.card-spacer');
        if (spacer && spacer.parentNode) {
          spacer.parentNode.insertBefore(recipeEl, spacer);
        } else {
          card.appendChild(recipeEl);
        }
      }
      recipeEl.innerHTML = `<strong>Ingredients:</strong> ${item.recipe}`;
    } else if (recipeEl) {
      recipeEl.remove();
    }

    const addBtn = card.querySelector('.add-btn');
    if (addBtn) {
      if (isOOS) {
        addBtn.disabled = true;
        addBtn.classList.add('disabled');
        addBtn.textContent = '✕';
        addBtn.setAttribute('aria-label', 'Out of stock');
      } else {
        addBtn.disabled = false;
        addBtn.classList.remove('disabled');
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

    const ingredientLookup = {};
    const oosIds = new Set();
    const oosMap = {};

    ingredientsList.forEach(ing => {
      ingredientLookup[ing.ingredientId] = ing.ingredientName;
      const stock = (ing.currentStock !== null && ing.currentStock !== undefined) ? Number(ing.currentStock) : null;
      const status = (ing.status !== null && ing.status !== undefined) ? String(ing.status).trim() : null;
      const isOOS = (stock !== null && !isNaN(stock) && stock <= 0) ||
                    status === '0' ||
                    status === 'out_of_stock' ||
                    status === 'Out of Stock' ||
                    status === 'inactive';
      if (isOOS) {
        oosIds.add(ing.ingredientId);
        oosMap[ing.ingredientId] = ing;
      }
    });

    OOS_INGREDIENT_IDS = oosIds;
    OOS_INGREDIENT_MAP = oosMap;

    const productRecipeMap = {};
    const productRecipeIdsMap = {};
    recipesList.forEach(r => {
      const pId = r.productId;
      const numPId = Number(r.productId);
      const ingId = Number(r.ingredientId);

      if (!productRecipeMap[pId]) productRecipeMap[pId] = [];
      if (!productRecipeMap[numPId]) productRecipeMap[numPId] = productRecipeMap[pId];
      if (!productRecipeIdsMap[pId]) productRecipeIdsMap[pId] = [];
      if (!productRecipeIdsMap[numPId]) productRecipeIdsMap[numPId] = productRecipeIdsMap[pId];

      if (!productRecipeIdsMap[pId].includes(ingId)) {
        productRecipeIdsMap[pId].push(ingId);
      }
      const ingName = ingredientLookup[r.ingredientId] || ingredientLookup[ingId];
      if (ingName && !productRecipeMap[pId].includes(ingName)) {
        productRecipeMap[pId].push(ingName);
      }
    });

    ALL_ITEMS.forEach(item => {
      const dbIngredients = productRecipeMap[item.productId] || productRecipeMap[Number(item.productId)] || [];
      item.recipe = dbIngredients.length > 0 ? dbIngredients.join(', ') : '';
      item.ingredients = dbIngredients;

      const stockStatus = checkProductStockStatus(item, productRecipeIdsMap, oosIds, oosMap, ingredientsList);
      item.isOutOfStock = stockStatus.isOutOfStock;
      item.outOfStockReason = stockStatus.reason;

      updateCardStockUI(item);
    });

    // Update Top Selling product card
    if (TOP_SELLING_PRODUCT) {
      const updatedTop = ALL_ITEMS.find(i => i.productId === TOP_SELLING_PRODUCT.productId);
      if (updatedTop) {
        TOP_SELLING_PRODUCT = updatedTop;
        renderTopSellingCard(TOP_SELLING_PRODUCT);
      }
    }

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
      }
    }
  } catch (err) {
    console.warn("Stock sync check failed:", err);
  }
}

// Real-time listener for database stock & recipe updates
let realtimeStockListenerInitialized = false;
function initRealtimeStockListener() {
  if (!db || realtimeStockListenerInitialized) return;
  realtimeStockListenerInitialized = true;
  try {
    db.channel('public:chill_stock_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_ingredient' }, () => {
        refreshInventoryStock();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_recipe' }, () => {
        refreshInventoryStock();
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
  setInterval(refreshInventoryStock, 10000);
}

// ═════════════════════════════════════════
// 2. FETCH MENU, SIZES, ADDONS & RECIPES
// ═════════════════════════════════════════
async function loadMenuFromSupabase() {
  if (!db) {
    console.error("Supabase connection not found!");
    return;
  }
  
  try {
    // 1. Fetch enabled products
    const { data: productsData, error: prodError } = await db
      .from('chill_product_item')
      .select('*')
      .eq('enable', 1);
    if (prodError) throw prodError;

    // 2. Fetch product sizes (with fallback to chill_product_sizes)
    let productSizes = [];
    const { data: psData, error: psError } = await db
      .from('chill_product_size')
      .select('*')
      .eq('enabled', 1);
    if (!psError && psData) {
      productSizes = psData;
    } else {
      const { data: psData2 } = await db
        .from('chill_product_sizes')
        .select('*')
        .eq('enabled', 1);
      if (psData2) productSizes = psData2;
    }

    // 3. Fetch sizes (with fallback to chill_sizes)
    let sizes = [];
    const { data: sData, error: sError } = await db
      .from('chill_size')
      .select('*')
      .eq('enable', 1);
    if (!sError && sData) {
      sizes = sData;
    } else {
      const { data: sData2 } = await db
        .from('chill_sizes')
        .select('*')
        .eq('enable', 1);
      if (sData2) sizes = sData2;
    }

    // 4. Fetch addons (chill_addons) & product addons (chill_product_addons)
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

    // 5. Fetch recipes (chill_recipe) & ingredients (chill_ingredient)
    let recipesList = [];
    const { data: rData } = await db
      .from('chill_recipe')
      .select('*');
    if (rData) recipesList = rData;

    let ingredientsList = [];
    const { data: ingData } = await db
      .from('chill_ingredient')
      .select('*');
    if (ingData) ingredientsList = ingData;

    // 6. Fetch addon recipes (chill_addon_recipe) for syrups/sauces/powders sub-ingredients
    let addonRecipesList = [];
    const { data: arData } = await db
      .from('chill_addon_recipe')
      .select('*')
      .eq('enabled', 1);
    if (arData) addonRecipesList = arData;

    // 7. Fetch promotions (chill_promotion) & affected products (chill_promotion_product)
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

    ALL_PROMOTIONS = promotionsList;
    buildPromoMap(promotionsList, promotionProductsList);

    ALL_SIZES = sizes;
    ALL_PRODUCT_SIZES = productSizes;
    ALL_ADDONS = addonsList;
    ALL_PRODUCT_ADDONS = productAddonsList;
    ALL_RECIPES = recipesList;
    ALL_INGREDIENTS = ingredientsList;

    // Map sizes by sizeId
    const sizeLookup = {};
    sizes.forEach(s => {
      sizeLookup[s.sizeId] = s.sizeName;
    });

    // Map product sizes by productId
    const productSizesMap = {};
    productSizes.forEach(ps => {
      if (!productSizesMap[ps.productId]) {
        productSizesMap[ps.productId] = [];
      }
      productSizesMap[ps.productId].push({
        productSizeId: ps.productSizeId,
        sizeId: ps.sizeId,
        sizeName: sizeLookup[ps.sizeId] || `Size ${ps.sizeId}`,
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

    // Map ingredients by ingredientId
    const ingredientLookup = {};
    ingredientsList.forEach(ing => {
      ingredientLookup[ing.ingredientId] = ing.ingredientName;
    });

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

    // Map recipe ingredients and IDs by productId
    const productRecipeMap = {};
    const productRecipeIdsMap = {};
    recipesList.forEach(r => {
      const pId = r.productId;
      const numPId = Number(r.productId);
      const ingId = Number(r.ingredientId);

      if (!productRecipeMap[pId]) productRecipeMap[pId] = [];
      if (!productRecipeMap[numPId]) productRecipeMap[numPId] = productRecipeMap[pId];
      if (!productRecipeIdsMap[pId]) productRecipeIdsMap[pId] = [];
      if (!productRecipeIdsMap[numPId]) productRecipeIdsMap[numPId] = productRecipeIdsMap[pId];

      if (!productRecipeIdsMap[pId].includes(ingId)) {
        productRecipeIdsMap[pId].push(ingId);
      }
      const ingName = ingredientLookup[r.ingredientId] || ingredientLookup[ingId];
      if (ingName && !productRecipeMap[pId].includes(ingName)) {
        productRecipeMap[pId].push(ingName);
      }
    });

    // Detect out of stock ingredients in database
    const oosIds = new Set();
    const oosMap = {};
    ingredientsList.forEach(ing => {
      const stock = (ing.currentStock !== null && ing.currentStock !== undefined) ? Number(ing.currentStock) : null;
      const status = (ing.status !== null && ing.status !== undefined) ? String(ing.status).trim() : null;
      const isOOS = (stock !== null && !isNaN(stock) && stock <= 0) ||
                    status === '0' ||
                    status === 'out_of_stock' ||
                    status === 'Out of Stock' ||
                    status === 'inactive';
      if (isOOS) {
        oosIds.add(ing.ingredientId);
        oosMap[ing.ingredientId] = ing;
      }
    });
    OOS_INGREDIENT_IDS = oosIds;
    OOS_INGREDIENT_MAP = oosMap;

    if (productsData && productsData.length > 0) {
      ALL_ITEMS = productsData.map(item => {
        const itemSizes = productSizesMap[item.productId] || [];
        itemSizes.sort((a, b) => a.price - b.price);

        const rawPrice = (item.price !== null && item.price !== undefined && item.price !== '') ? Number(item.price) : null;
        const hasDirectPrice = rawPrice !== null && !isNaN(rawPrice) && rawPrice > 0;
        const hasSizes = !hasDirectPrice && itemSizes.length > 0;

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

        const ingList = productRecipeMap[item.productId] || [];
        const cleanDesc = (item.description || item.desc || '').replace(/^''$/, '').trim();
        const recipeText = getProductIngredients(item.productId, productRecipeMap);
        const stockStatus = checkProductStockStatus(item, productRecipeIdsMap, oosIds, oosMap, ingredientsList);

        return {
          ...item,
          productName: (item.productName || item.name || '').trim(),
          description: cleanDesc,
          recipe: recipeText,
          ingredients: ingList,
          sizes: itemSizes,
          addons: productAddonsMap[item.productId] || [],
          hasSizes,
          minPrice,
          maxPrice,
          basePrice: minPrice,
          price: hasDirectPrice ? rawPrice : minPrice,
          imageUrl: item.imageUrl || '',
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

// Determine top-selling product dynamically from sales data
async function loadTopSellingProduct() {
  if (!db || !ALL_ITEMS.length) return;
  try {
    const { data: orderItems } = await db
      .from('chill_order_item')
      .select('productId, productName, quantity');

    if (orderItems && orderItems.length > 0) {
      const activeNames = ALL_ITEMS.map(p => ({
        product: p,
        cleanName: p.productName.toLowerCase().trim()
      }));

      const salesMap = new Map();
      ALL_ITEMS.forEach(p => salesMap.set(p.productId, { product: p, score: 0 }));

      orderItems.forEach(oi => {
        if (salesMap.has(oi.productId)) {
          salesMap.get(oi.productId).score += (oi.quantity || 1);
          return;
        }
        const oName = (oi.productName || '').toLowerCase().replace(/12oz|16oz|160z|22oz|solo|group/gi, '').trim();
        for (const an of activeNames) {
          if (an.cleanName === oName || oName.includes(an.cleanName) || an.cleanName.includes(oName)) {
            salesMap.get(an.product.productId).score += (oi.quantity || 1);
            break;
          }
        }
      });

      const sorted = Array.from(salesMap.values()).sort((a,b) => b.score - a.score);
      // Prefer top seller that is currently in stock
      const inStockTop = sorted.find(s => s.product && !s.product.isOutOfStock);
      if (inStockTop) {
        TOP_SELLING_PRODUCT = inStockTop.product;
      } else if (sorted.length > 0 && sorted[0].score > 0) {
        TOP_SELLING_PRODUCT = sorted[0].product;
      }
    }
  } catch (e) {
    console.warn("Could not determine top selling product from orders:", e);
  }

  if (!TOP_SELLING_PRODUCT) {
    TOP_SELLING_PRODUCT = ALL_ITEMS.find(i => !i.isOutOfStock) || ALL_ITEMS[0];
  }

  renderTopSellingCard(TOP_SELLING_PRODUCT);
}

function renderTopSellingCard(product) {
  if (!product) return;
  const featImg = document.getElementById('featImg');
  const featName = document.getElementById('featName');
  const featDesc = document.getElementById('featDesc');
  const featPrice = document.getElementById('featPrice');
  const featCard = document.getElementById('featCard');
  const featAddBtn = document.getElementById('featAddBtn');

  if (featImg) {
    featImg.src = getProductImage(product);
    featImg.onerror = () => { featImg.src = 'placeholder.svg'; };
  }
  if (featName) featName.textContent = product.productName;
  if (featDesc) {
    const cleanDesc = (product.description && product.description !== "''") ? product.description : '';
    featDesc.textContent = cleanDesc;
    featDesc.style.display = cleanDesc ? 'block' : 'none';
  }
  if (featPrice) {
    if (product.hasSizes && product.sizes.length > 0) {
      featPrice.textContent = (product.minPrice !== product.maxPrice) 
        ? `₱${product.minPrice} - ₱${product.maxPrice}` 
        : `₱${product.minPrice}`;
    } else {
      featPrice.textContent = `₱${product.price || 0}`;
    }
  }

  const isOOS = product.isOutOfStock;
  if (featCard) {
    featCard.classList.toggle('out-of-stock', !!isOOS);
    const existingBadge = featCard.querySelector('.stock-badge-oos');
    if (existingBadge) existingBadge.remove();
    if (isOOS) {
      const b = document.createElement('span');
      b.className = 'stock-badge-oos';
      b.textContent = 'Out of Stock';
      featCard.querySelector('.feat-img-wrap')?.appendChild(b);
    }
  }

  if (featAddBtn) {
    featAddBtn.disabled = !!isOOS;
    featAddBtn.classList.toggle('disabled', !!isOOS);
    featAddBtn.textContent = isOOS ? '✕' : '+';
  }

  const fn = (e) => {
    if (e) e.stopPropagation();
    if (product.isOutOfStock) {
      showToast(`${product.productName} is currently out of stock`, 'warning');
      return;
    }
    triggerConfirmation(product);
  };

  if (featCard) featCard.onclick = fn;
  if (featAddBtn) featAddBtn.onclick = fn;
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
      .eq('categoryType', 'Product')
      .eq('enable', 1);
    
    if (error) throw error;
    
    const container = document.getElementById('categoryContainer');
    if (!container) return;

    let html = `<button class="cat-pill active" data-cat="all">All</button>`;
    
    const slugLabels = {
      espresso: 'Espresso',
      noncoffee: 'Non-Coffee',
      milktea: 'Milk Tea',
      frappe: 'Frappe',
      fruittea: 'Fruit Tea',
      soda: 'Soda',
      croffle: 'Croffles',
      sandwiches: 'Sandwiches',
      snacks: 'Snacks',
      silog: 'Silog Meals',
      pasta: 'Pasta'
    };

    const addedSlugs = new Set();
    
    if (data && data.length > 0) {
      data.forEach(cat => {
        const catName = cat.categoryName || cat.name;
        const catId = cat.categoryId || cat.id;
        if (catId === 3 || catId === 14) return; // Skip add-ons category
        const catVal = mapCategoryToSlug(catId, catName);
        
        if (catVal && !addedSlugs.has(catVal)) {
          addedSlugs.add(catVal);
          const label = slugLabels[catVal] || catName;
          html += `<button class="cat-pill" data-cat="${catVal}">${label}</button>`;
        }
      });
    }
    
    container.innerHTML = html;

    document.querySelectorAll('.cat-pill').forEach(p => {
      p.addEventListener('click', () => filterCat(p, p.dataset.cat));
    });
  } catch (err) {
    console.error("Failed to load categories:", err);
  }
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
loadCategoriesFromSupabase();

// ═════════════════════════════════════════
// 4. UI & GRID BUILDERS
// ═════════════════════════════════════════
function makeCard(item) {
  const d = document.createElement('div');
  d.dataset.productId = item.productId;
  const isOOS = !!item.isOutOfStock;
  d.className = `item-card ${isOOS ? 'out-of-stock' : ''}`;

  const itemName = item.productName || item.name || 'Unknown Item';
  const cleanDesc = (item.description && item.description.trim() && item.description.trim() !== "''") ? item.description.trim() : '';
  const itemImgSrc = getProductImage(item);

  // Build price HTML with promo support
  let priceHTML = '';
  if (item.hasSizes && item.sizes && item.sizes.length > 0) {
    if (item.promo) {
      const dispMin = item.promoMinPrice;
      const dispMax = item.promoMaxPrice;
      priceHTML = dispMin !== dispMax
        ? `<span class="price-original">₱${item.minPrice}–₱${item.maxPrice}</span> <span class="price-promo">₱${dispMin}–₱${dispMax}</span>`
        : `<span class="price-original">₱${item.minPrice}</span> <span class="price-promo">₱${dispMin}</span>`;
    } else {
      priceHTML = item.minPrice !== item.maxPrice
        ? `₱${item.minPrice} - ₱${item.maxPrice}`
        : `₱${item.minPrice}`;
    }
  } else {
    if (item.promo) {
      priceHTML = `<span class="price-original">₱${item.price || 0}</span> <span class="price-promo">₱${item.promoPrice}</span>`;
    } else {
      priceHTML = `₱${item.price || 0}`;
    }
  }

  const promoLabel = item.promo
    ? `<span class="promo-badge-card">${item.promo.discountType === 1 ? `-${item.promo.discountValue}%` : `-₱${item.promo.discountValue}`} ${item.promo.promotionName}</span>`
    : '';

  const sizePillsHTML2 = (item.hasSizes && item.sizes && item.sizes.length > 0)
    ? `<div class="card-size-tags">${item.sizes.map(s => `<span class="size-tag">${s.sizeName}</span>`).join('')}</div>`
    : '';

  const stockBadgeHTML = isOOS ? `<span class="stock-badge-oos">Out of Stock</span>` : '';
  const addBtnHTML = isOOS
    ? `<button class="add-btn disabled" disabled aria-label="Out of stock">✕</button>`
    : `<button class="add-btn" aria-label="Add ${itemName}">+</button>`;

  d.innerHTML = `
    <div class="item-img-wrap">
      ${stockBadgeHTML}
      ${promoLabel}
      <img class="item-img" src="${itemImgSrc}" alt="${itemName}" loading="lazy" onerror="this.onerror=null;this.src='placeholder.svg';" />
    </div>
    <div class="item-name">${itemName}</div>
    ${cleanDesc ? `<div class="item-desc">${cleanDesc}</div>` : ''}
    ${item.recipe ? `<div class="item-recipe"><strong>Ingredients:</strong> ${item.recipe}</div>` : ''}
    <div class="card-spacer"></div>
    ${sizePillsHTML2}
    <div class="card-footer">
      <div class="item-price">${priceHTML}</div>
      ${addBtnHTML}
    </div>
  `;

  const handleCardClick = () => {
    const currentItem = ALL_ITEMS.find(i => i.productId === item.productId) || item;
    if (currentItem.isOutOfStock) {
      showToast(`${currentItem.productName || itemName} is currently out of stock (${currentItem.outOfStockReason || 'unavailable ingredients'})`, 'warning');
      return;
    }
    triggerConfirmation(currentItem);
  };

  const addBtn = d.querySelector('.add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      handleCardClick();
    });
  }
  d.addEventListener('click', handleCardClick);

  return d;
}

function buildGrids() {
  document.querySelectorAll('.items-grid').forEach(grid => {
    if (grid.id !== 'searchResultsGrid') grid.innerHTML = '';
  });

  ALL_ITEMS.forEach(item => {
    const catId = item.categoryId;
    const safeCategory = mapCategoryToSlug(catId, item.categoryName || '');
    item.cat = safeCategory;

    const grid = document.getElementById(safeCategory + 'Grid');
    if (grid) {
      grid.appendChild(makeCard(item));
    }
  });
}

let cur = 'welcomeScreen';

function goTo(id) {
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
  if (id === 'menuScreen') refreshInventoryStock();
}

function addItem(name, imageUrl, price, desc) {
  const isPromoItem = name.includes('[-20%') || name.includes('B1T1 Claimed');
  const ex = cart.find(i => i.name === name);
  
  if (ex) {
    if (isPromoItem) {
      showToast('Promo limited to 1 per order!');
      return; 
    }
    ex.qty++;
  } else {
    cart.push({ name, imageUrl: imageUrl || 'placeholder.svg', price, desc, qty: 1 });
  }
  syncUI();
  if (cur === 'cartScreen') renderCart(); 
  showToast('Added: ' + name);
}

function changeQty(idx, delta) {
  if (!cart[idx]) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  syncUI();
  renderCart();
}

function syncUI() {
  const count = cart.reduce((s,i) => s + i.qty, 0);
  const badge = document.getElementById('navCartBadge');
  if (badge) badge.textContent = count;
}

function renderCart() {
  const con = document.getElementById('cartItemsContainer');
  const total = cart.reduce((s,i) => s + i.price * i.qty, 0);

  if (con) {
    con.innerHTML = cart.length === 0
      ? `<div class="empty-state"><div class="empty-icon">🛒</div><p>Your cart is empty</p></div>`
      : cart.map((item, idx) => {
          return `
          <div class="cart-item">
            <div class="ci-img-wrap">
              <img class="ci-img" src="${item.imageUrl || 'placeholder.svg'}" alt="${item.name}" onerror="this.onerror=null;this.src='placeholder.svg';" />
            </div>
            <div class="ci-info">
              <div class="ci-name">${item.name}</div>
              <div class="ci-price">₱${(item.price*item.qty).toLocaleString()}</div>
            </div>
            <div class="qty-ctrl">
              <button class="qty-btn" onclick="changeQty(${idx},-1)">−</button>
              <span class="qty-num">${item.qty}</span>
              <button class="qty-btn" onclick="changeQty(${idx},1)">+</button>
            </div>
          </div>`;
        }).join('');
  }

  const fmt = '₱' + total.toLocaleString();
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
  placeBtn.disabled = (cart.length === 0 || nickInput.value.trim().length < 3);
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
  if (!cart.length) return;
  const nicknameInput = document.getElementById('customerNickname').value.trim();
  if (nicknameInput.length < 3) {
    showToast('Please enter a nickname (at least 3 letters)', 'warning');
    return;
  }

  const emailInput = document.getElementById('customerEmail')?.value.trim() || '';
  const total = cart.reduce((s,i) => s + i.price * i.qty, 0);
  const count = cart.reduce((s,i) => s + i.qty, 0);

  // 1. Instant unique random order number (0ms!)
  const orderNumber = getUniqueRandomOrderNumber();

  // 2. Prepare payload & sync to Supabase in background (non-blocking)
  const kioskPayload = {
    kioskordernumber: String(orderNumber),
    items: cart.map(item => ({
      name: item.name,
      price: item.price,
      qty: item.qty,
      imageUrl: item.imageUrl || '',
      desc: item.desc || '',
      subtotal: item.price * item.qty
    })),
    subtotal: Number(total),
    totalamount: Number(total),
    paymentmethod: currentPaymentMethod || 'Cash',
    status: 'pending'
  };

  if (db) {
    db.from('chill_kiosk_queue')
      .insert([kioskPayload])
      .then(({ data, error }) => {
        if (error) console.error('Failed to insert to chill_kiosk_queue:', error);
        else console.log('Order recorded in chill_kiosk_queue:', data);
      })
      .catch(err => console.error('Exception inserting to chill_kiosk_queue:', err));
  }

  const now = new Date();
  const invoiceString = `#INV-${orderNumber}`;
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '');
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const finalNickname = nicknameInput.toUpperCase();

  // Populate Order Details
  document.getElementById('queueNum').textContent = orderNumber;
  document.getElementById('confirmInvoice').textContent = invoiceString;
  document.getElementById('confirmDate').textContent = dateStr;
  document.getElementById('confirmTime').textContent = timeStr;
  document.getElementById('confirmNickname').textContent = finalNickname;
  document.getElementById('confirmItems').textContent = count + ' item' + (count !== 1 ? 's' : '');
  document.getElementById('confirmOrderType').textContent = currentOrderType;
  document.getElementById('confirmAmount').textContent = '₱' + total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

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

  const itemsListContainer = document.getElementById('confirm-items-list');
  if (itemsListContainer) {
    itemsListContainer.innerHTML = cart.map(item => `
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px dashed #ddd9ee;">
        <span style="flex:1; text-align:left; font-weight: 600;">${item.qty}x ${item.name}</span>
        <span>₱${(item.price * item.qty).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
      </div>
    `).join('');
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
  cart = [];
  const notes = document.getElementById('orderNotes');
  const nick = document.getElementById('customerNickname');
  const email = document.getElementById('customerEmail');
  if (notes) notes.value = '';
  if (nick) nick.value = '';
  if (email) email.value = '';
  syncUI();
  updateCartInputsState();
  goTo('menuScreen');
}

function filterCat(btn, cat) {
  const searchInput = document.getElementById('menuSearch');
  const searchContainer = document.getElementById('searchResultsContainer');
  if (searchInput && searchInput.value) {
    searchInput.value = '';
    if (searchContainer) searchContainer.classList.add('hidden');
  }
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  
  document.querySelectorAll('.filterable-item,.filterable-title').forEach(el => {
    el.dataset.hidden = (cat !== 'all' && el.dataset.category !== cat) ? 'true' : 'false';
  });
}

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
      const fc = document.getElementById('featCard');
      if (fc) fc.click();
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
if (menuSearchInput) {
  menuSearchInput.addEventListener('input', (e) => {
    const query = removeAccents(e.target.value.trim().toLowerCase());
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
      const itemDesc = item.description || item.desc || '';
      const catVal = item.cat || '';
      const searchable = removeAccents(`${itemName} ${itemDesc} ${catVal} ${item.productId || item.uid}`).toLowerCase();
      
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

const confirmationOverlay = document.getElementById('confirmation-overlay');
const receiptOverlay = document.getElementById('receipt-overlay');

function updateModalPrice() {
  if (!itemPendingConfirmation) return;
  
  let basePrice = 0;
  if (currentSelectedSize) {
    basePrice = currentSelectedSize.price;
  } else {
    basePrice = Number(itemPendingConfirmation.price || itemPendingConfirmation.minPrice || 0);
  }

  const addonTotal = selectedAddons.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const promo = itemPendingConfirmation.promo || null;
  const discountedBase = promo ? applyPromo(basePrice, promo) : basePrice;
  const finalPrice = discountedBase + addonTotal;

  const priceValEl = document.getElementById('modal-price-value');
  if (priceValEl) {
    if (promo) {
      const originalTotal = basePrice + addonTotal;
      priceValEl.innerHTML = `<span style="text-decoration:line-through;color:var(--muted);font-size:0.85em;font-weight:600;">₱${originalTotal}</span> <span style="color:var(--promo-color,#E53935);font-weight:800;">₱${finalPrice}</span>`;
    } else {
      priceValEl.textContent = '₱' + finalPrice;
    }
  }
}

function triggerConfirmation(item) {
  if (!item) return;
  itemPendingConfirmation = item;
  
  const itemName = item.productName || item.name || 'Café Latte';
  const cleanDesc = (item.description && item.description.trim() && item.description.trim() !== "''") ? item.description.trim() : '';
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

  // Show/hide promo badge in modal
  let promoEl = document.getElementById('modal-promo-label');
  if (item.promo) {
    const pLabel = item.promo.discountType === 1
      ? `${item.promo.discountValue}% OFF — ${item.promo.promotionName}`
      : `₱${item.promo.discountValue} OFF — ${item.promo.promotionName}`;
    if (!promoEl) {
      promoEl = document.createElement('div');
      promoEl.id = 'modal-promo-label';
      promoEl.className = 'modal-promo-label';
      if (titleEl && titleEl.parentNode) {
        titleEl.parentNode.insertBefore(promoEl, titleEl.nextSibling);
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

  // Dynamic Sizes
  const sizeSection = document.getElementById('modal-size-section');
  const sizeOptionsContainer = document.getElementById('modal-size-options');
  if (item.hasSizes && item.sizes && item.sizes.length > 0) {
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
  const addonOptionsContainer = document.getElementById('modal-addon-options');
  const itemAddons = item.addons || [];

  if (itemAddons.length > 0 && addonSection && addonOptionsContainer) {
    addonSection.classList.remove('hidden');
    
    let addonBtnsHtml = `
      <div class="addon-row-wrapper">
        <button class="addon-btn active" data-addon="none">
          <span>None</span>
          <span style="font-size:12px;opacity:0.8;">₱0</span>
        </button>
      </div>
    `;
    
    itemAddons.forEach(a => {
      const priceText = a.price > 0 ? `+₱${a.price}` : 'Free';
      const aName = a.addonsName || '';
      const isSyrupOrPowder = (a.addonsId === 3) || /syrup|sauce|powder/i.test(aName);
      const subRecipes = (ALL_ADDON_RECIPES[a.addonsId] || []);

      // Check if addon single ingredient is out of stock
      let isAddonOOS = false;
      if (!isSyrupOrPowder && subRecipes.length === 1) {
        if (OOS_INGREDIENT_IDS.has(subRecipes[0].ingredientId)) isAddonOOS = true;
      }

      if (isSyrupOrPowder && subRecipes.length > 0) {
        // Dropdown container for syrup/sauce/powder varieties
        const optionsHtml = subRecipes.map(sr => {
          const isIngOOS = OOS_INGREDIENT_IDS.has(sr.ingredientId);
          return `<option value="${sr.ingredientName}" ${isIngOOS ? 'disabled' : ''}>${sr.ingredientName}${isIngOOS ? ' (Out of Stock)' : ''}</option>`;
        }).join('');

        addonBtnsHtml += `
          <div class="addon-row-wrapper" data-addon-id="${a.addonsId}">
            <button class="addon-btn" data-addon-id="${a.addonsId}" data-name="${a.addonsName}" data-price="${a.price}" data-has-dropdown="true">
              <span>${a.addonsName}</span>
              <span>${priceText}</span>
            </button>
            <div class="addon-dropdown-wrap hidden" id="addon-dropdown-${a.addonsId}">
              <div style="font-size: 11px; font-weight: 700; color: var(--primary); margin-bottom: 4px;">Choose Flavor / Variety:</div>
              <select class="addon-ingredient-select" id="addon-select-${a.addonsId}">
                ${optionsHtml}
              </select>
            </div>
          </div>
        `;
      } else {
        addonBtnsHtml += `
          <div class="addon-row-wrapper" data-addon-id="${a.addonsId}">
            <button class="addon-btn ${isAddonOOS ? 'disabled' : ''}" ${isAddonOOS ? 'disabled' : ''} data-addon-id="${a.addonsId}" data-name="${a.addonsName}" data-price="${a.price}">
              <span>${a.addonsName}${isAddonOOS ? ' (Out of Stock)' : ''}</span>
              <span>${priceText}</span>
            </button>
          </div>
        `;
      }
    });

    addonOptionsContainer.innerHTML = addonBtnsHtml;

    const noneBtn = addonOptionsContainer.querySelector('.addon-btn[data-addon="none"]');
    const customBtns = addonOptionsContainer.querySelectorAll('.addon-btn:not([data-addon="none"])');

    if (noneBtn) {
      noneBtn.addEventListener('click', () => {
        selectedAddons = [];
        customBtns.forEach(b => {
          b.classList.remove('active');
          const dId = b.dataset.addonId;
          const drop = document.getElementById(`addon-dropdown-${dId}`);
          if (drop) drop.classList.add('hidden');
        });
        noneBtn.classList.add('active');
        updateModalPrice();
      });
    }

    customBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const aId = Number(btn.dataset.addonId);
        const aName = btn.dataset.name;
        const aPrice = parseFloat(btn.dataset.price) || 0;
        const hasDropdown = btn.dataset.hasDropdown === 'true';
        const dropdownWrap = document.getElementById(`addon-dropdown-${aId}`);
        const selectEl = document.getElementById(`addon-select-${aId}`);

        const existingIdx = selectedAddons.findIndex(a => a.addonsId === aId);
        if (existingIdx >= 0) {
          selectedAddons.splice(existingIdx, 1);
          btn.classList.remove('active');
          if (dropdownWrap) dropdownWrap.classList.add('hidden');
        } else {
          const subChoice = (hasDropdown && selectEl) ? selectEl.value : null;
          selectedAddons.push({ addonsId: aId, addonsName: aName, price: aPrice, subSelection: subChoice });
          btn.classList.add('active');
          if (dropdownWrap) dropdownWrap.classList.remove('hidden');
        }

        if (selectedAddons.length === 0) {
          if (noneBtn) noneBtn.classList.add('active');
        } else {
          if (noneBtn) noneBtn.classList.remove('active');
        }
        updateModalPrice();
      });
    });

    // Handle flavor change in dropdown
    addonOptionsContainer.querySelectorAll('.addon-ingredient-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const aId = Number(e.target.id.replace('addon-select-', ''));
        const found = selectedAddons.find(a => a.addonsId === aId);
        if (found) {
          found.subSelection = e.target.value;
        }
      });
    });
  } else {
    if (addonSection) addonSection.classList.add('hidden');
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

  updateModalPrice();
  if (confirmationOverlay) confirmationOverlay.classList.remove('hidden');
} 

const modalCloseBtn = document.getElementById('modalCloseBtn');
if (modalCloseBtn) {
  modalCloseBtn.addEventListener('click', () => {
    if (confirmationOverlay) confirmationOverlay.classList.add('hidden');
    itemPendingConfirmation = null;
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
      let finalName = itemPendingConfirmation.productName || itemPendingConfirmation.name;
      const basePrice = currentSelectedSize ? currentSelectedSize.price : (Number(itemPendingConfirmation.price || itemPendingConfirmation.minPrice || 0));
      const addonTotal = selectedAddons.reduce((sum, a) => sum + (Number(a.price) || 0), 0);

      // Apply promo discount if applicable
      const promo = itemPendingConfirmation.promo || null;
      const discountedBase = promo ? applyPromo(basePrice, promo) : basePrice;
      const cartTotal = discountedBase + addonTotal;

      if (currentSelectedSize) {
        finalName += ` (${currentSelectedSize.sizeName})`;
      }

      if (selectedAddons.length > 0) {
        const addonNames = selectedAddons.map(a => {
          if (a.subSelection) {
            return `${a.addonsName} (${a.subSelection})`;
          }
          return a.addonsName;
        }).join(', ');
        finalName += ` [+ ${addonNames}]`;
      }

      if (promo) {
        finalName += ` [${promo.discountType === 1 ? `-${promo.discountValue}%` : `-₱${promo.discountValue}`} ${promo.promotionName}]`;
      }
      
      addItem(finalName, getProductImage(itemPendingConfirmation), cartTotal, itemPendingConfirmation.description || itemPendingConfirmation.desc);
      if (confirmationOverlay) confirmationOverlay.classList.add('hidden');
      itemPendingConfirmation = null;
    }
  });
}

const quizModalOverlay = document.getElementById('quiz-modal-overlay');
[confirmationOverlay, receiptOverlay, quizModalOverlay].forEach(overlay => {
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
        if (overlay === confirmationOverlay) itemPendingConfirmation = null;
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

// Featured Card Binding (Top Selling Product)
const fc = document.getElementById('featCard');
if (fc) {
  const fcFn = () => {
    if (TOP_SELLING_PRODUCT) {
      triggerConfirmation(TOP_SELLING_PRODUCT);
    } else if (ALL_ITEMS.length > 0) {
      triggerConfirmation(ALL_ITEMS[0]);
    }
  };
  const featAddBtn = document.getElementById('featAddBtn');
  if (featAddBtn) {
    featAddBtn.addEventListener('click', e => { e.stopPropagation(); fcFn(); });
  }
  fc.addEventListener('click', fcFn);
}

function generateDigitalReceipt(nickname, invoiceNum, dateStr, timeStr, subtotalAmount, totalCount, discountAmount, finalTotal) {
  const paper = document.getElementById('receipt-paper');
  if (!paper) return;

  let itemsHTML = '';
  cart.forEach(item => {
    itemsHTML += `
      <div class="receipt-item-row" style="margin-bottom: 2px;"><div style="flex:1;">${item.name}</div></div>
      <div class="receipt-item-row">
         <div class="receipt-item-qty">${item.qty}</div>
         <div class="receipt-item-name"></div>
         <div class="receipt-item-price">P${item.price.toFixed(2)}</div>
         <div class="receipt-item-amt">P${(item.price * item.qty).toFixed(2)}</div>
      </div>`;
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
    </div>
    <div class="receipt-flex" style="font-weight: bold; margin-bottom: 8px;">
      <div>Qty Item</div><div style="display:flex; gap: 20px;"><span>Price</span><span>Amt</span></div>
    </div>
    ${itemsHTML}
    <div class="receipt-dashed"></div>
    <div class="receipt-flex"><div>Items: ${cart.length}</div><div>Subtotal: &nbsp;P${subtotalAmount.toFixed(2)}</div></div>
    <div style="margin-bottom: 12px;">Qty: ${totalCount}</div>
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
      db.from('chill_promotion').select('*').eq('isActive', 1),
      db.from('chill_promotion_product').select('*').eq('enabled', 1)
    ]);
    if (!promoRes.error && promoRes.data) {
      ALL_PROMOTIONS = promoRes.data;
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
  step: 1, // 1: Drink vs Snack, 2: Temp or Flavor, 3: Taste or Portion
  answers: {
    type: null,        // 'drink' or 'snack'
    tempOrFlavor: null,// 'cold' | 'hot' (drink) or 'sweet' | 'savory' | 'meaty' (snack)
    tasteOrStyle: null // 'sweet' | 'bold' | 'fruity' (drink) or 'bites' | 'meal' | 'crispy' (snack)
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
  QUIZ_STATE.answers = { type: null, tempOrFlavor: null, tasteOrStyle: null };
  QUIZ_STATE.history = [];

  const resultsSection = document.getElementById('cravingResultsSection');
  if (resultsSection) resultsSection.classList.add('hidden');

  renderQuizStep();
}

function goBackQuizStep() {
  if (QUIZ_STATE.step > 1) {
    QUIZ_STATE.step--;
    QUIZ_STATE.history.pop();
    if (QUIZ_STATE.step === 1) QUIZ_STATE.answers.type = null;
    if (QUIZ_STATE.step === 2) QUIZ_STATE.answers.tempOrFlavor = null;
    if (QUIZ_STATE.step === 3) QUIZ_STATE.answers.tasteOrStyle = null;

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
    if (badgeEl) badgeEl.textContent = 'Step 1 of 3';
    titleEl.textContent = 'What are you in the mood for?';
    if (hintEl) hintEl.textContent = 'Start by choosing a drink or a snack';

    optionsContainer.innerHTML = `
      <button class="craving-btn" onclick="handleQuizAnswer(1, 'drink')">
        <span>A Drink</span>
      </button>
      <button class="craving-btn" onclick="handleQuizAnswer(1, 'snack')">
        <span>A Snack / Food</span>
      </button>
    `;
  } else if (QUIZ_STATE.step === 2) {
    if (badgeEl) badgeEl.textContent = 'Step 2 of 3';

    if (QUIZ_STATE.answers.type === 'drink') {
      titleEl.textContent = 'How would you like your drink?';
      if (hintEl) hintEl.textContent = 'Chilled and refreshing, or warm and comforting?';

      optionsContainer.innerHTML = `
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'cold')">
          <span>Cold & Iced</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'hot')">
          <span>Warm & Hot</span>
        </button>
      `;
    } else {
      titleEl.textContent = 'What flavor are you craving?';
      if (hintEl) hintEl.textContent = 'Sweet pastries, cheesy savory bites, or hearty meats?';

      optionsContainer.innerHTML = `
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'sweet')">
          <span>Sweet Pastry & Waffles</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'savory')">
          <span>Cheesy & Savory</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'meaty')">
          <span>Meaty & Hearty</span>
        </button>
      `;
    }
  } else if (QUIZ_STATE.step === 3) {
    if (badgeEl) badgeEl.textContent = 'Step 3 of 3';

    if (QUIZ_STATE.answers.type === 'drink') {
      const isCold = QUIZ_STATE.answers.tempOrFlavor === 'cold';
      titleEl.textContent = isCold ? 'What flavor hits the spot?' : 'What warm flavor do you prefer?';
      if (hintEl) hintEl.textContent = 'Sweet & creamy, strong bold espresso, or light & fruity?';

      optionsContainer.innerHTML = `
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'sweet')">
          <span>Sweet & Creamy</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'bold')">
          <span>Strong & Bold Espresso</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'fruity')">
          <span>Fruity & Zesty</span>
        </button>
      `;
    } else {
      titleEl.textContent = 'What style hits the spot?';
      if (hintEl) hintEl.textContent = 'Finger food, hearty rice meal, or crispy pastry?';

      optionsContainer.innerHTML = `
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'bites')">
          <span>Finger Food & Bites</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'meal')">
          <span>Full Meal (Silog / Pasta)</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'crispy')">
          <span>Crispy Croffle / Pastry</span>
        </button>
      `;
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
    QUIZ_STATE.answers.tempOrFlavor = choice;
    QUIZ_STATE.step = 3;
    renderQuizStep();
  } else if (step === 3) {
    QUIZ_STATE.answers.tasteOrStyle = choice;
    generateQuizRecommendations();
  }
}

function generateQuizRecommendations() {
  const { type, tempOrFlavor, tasteOrStyle } = QUIZ_STATE;
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

  let matches = [];

  if (type === 'drink') {
    const isCold = tempOrFlavor === 'cold';

    if (tasteOrStyle === 'sweet') {
      matches = ALL_ITEMS.filter(item => {
        const name = (item.productName || item.name || '').toLowerCase();
        const cat = item.cat || '';
        const isSweet = cat === 'frappe' || cat === 'milktea' || cat === 'noncoffee' || /caramel|vanilla|mocha|milky|chocolate|taro|hazelnut/i.test(name);
        const matchTemp = isCold ? (name.includes('iced') || cat === 'frappe' || cat === 'milktea' || !name.includes('hot')) : (name.includes('hot') || !name.includes('iced'));
        return isSweet && matchTemp;
      });
    } else if (tasteOrStyle === 'bold') {
      matches = ALL_ITEMS.filter(item => {
        const name = (item.productName || item.name || '').toLowerCase();
        const cat = item.cat || '';
        const isBold = cat === 'espresso' || /americano|espresso|cappuccino|spanish/i.test(name);
        const matchTemp = isCold ? (name.includes('iced') || !name.includes('hot')) : (name.includes('hot') || !name.includes('iced'));
        return isBold && matchTemp;
      });
    } else if (tasteOrStyle === 'fruity') {
      matches = ALL_ITEMS.filter(item => {
        const name = (item.productName || item.name || '').toLowerCase();
        const cat = item.cat || '';
        return cat === 'fruittea' || cat === 'soda' || /fruit|passion|berry|strawberry|lemon|lychee|peach|soda|fizz/i.test(name);
      });
    }
  } else {
    // Snack filtering
    if (tempOrFlavor === 'sweet' || tasteOrStyle === 'crispy') {
      matches = ALL_ITEMS.filter(item => {
        const name = (item.productName || item.name || '').toLowerCase();
        const cat = item.cat || '';
        return cat === 'croffle' || /croffle|waffle|pastry|pancake|sweet/i.test(name);
      });
    } else if (tempOrFlavor === 'savory' || tasteOrStyle === 'bites') {
      matches = ALL_ITEMS.filter(item => {
        const name = (item.productName || item.name || '').toLowerCase();
        const cat = item.cat || '';
        return cat === 'snacks' || /fries|nacho|cheese stick|bite|finger/i.test(name);
      });
    } else {
      // Meaty / full meal
      matches = ALL_ITEMS.filter(item => {
        const name = (item.productName || item.name || '').toLowerCase();
        const cat = item.cat || '';
        return cat === 'silog' || cat === 'pasta' || cat === 'sandwiches' || /silog|tapa|tocino|porkchop|spam|burger|sandwich|pasta|spaghetti|carbonara/i.test(name);
      });
    }
  }

  // Filter out any out-of-stock items so customer is only recommended available products
  matches = matches.filter(item => !item.isOutOfStock);

  // Fallback to general in-stock pool if fewer than 3 items matched
  if (matches.length < 3) {
    const fallbackPool = ALL_ITEMS.filter(item => {
      if (item.isOutOfStock) return false;
      const isDrink = ['espresso','noncoffee','milktea','frappe','fruittea','soda'].includes(item.cat);
      return type === 'drink' ? isDrink : !isDrink;
    });
    matches = [...matches, ...fallbackPool].filter((v, i, a) => a.findIndex(t => (t.productId || t.uid) === (v.productId || v.uid)) === i);
  }

  const selectedRecs = matches.slice(0, 6);

  if (container) {
    if (selectedRecs.length > 0) {
      container.innerHTML = selectedRecs.map(item => {
        const pName = item.productName || item.name;
        const pPrice = (item.hasSizes && item.sizes && item.sizes.length > 0) ? `₱${item.minPrice}` : `₱${item.price || 0}`;
        const pId = item.productId || item.uid;
        const pImg = getProductImage(item);

        return `
          <div class="quiz-rec-card" onclick="selectQuizRecommendation(${pId})">
            <div class="quiz-rec-img-wrap">
              <img class="quiz-rec-img" src="${pImg}" alt="${pName}" onerror="this.onerror=null;this.src='placeholder.svg';" />
            </div>
            <div class="quiz-rec-name">${pName}</div>
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

// Make accessible for inline onclick handlers
window.handleQuizAnswer = handleQuizAnswer;
window.selectQuizRecommendation = selectQuizRecommendation;

// Trigger promo loading, quiz & realtime stock sync on boot
document.addEventListener('DOMContentLoaded', () => {
  loadPromosFromSupabase();
  initVirtualBaristaQuiz();
  initRealtimeStockListener();
});