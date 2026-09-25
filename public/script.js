let ALL_ITEMS = [];
let ALL_SIZES = [];
let ALL_PRODUCT_SIZES = [];
let ALL_ADDONS = [];
let ALL_PRODUCT_ADDONS = [];
let ALL_RECIPES = [];
let ALL_INGREDIENTS = [];
let ALL_ADDON_RECIPES = {};
let TOP_SELLING_PRODUCT = null;
let cart = [];

// ═════════════════════════════════════════
// 1. SUPABASE DATABASE CONNECTION
// ═════════════════════════════════════════
const SUPABASE_URL = 'https://nkhyzzevgyteaehwexsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raHl6emV2Z3l0ZWFlaHdleHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzgzNzEsImV4cCI6MjEwMTE1NDM3MX0.tDJzxwg5Vjsynbi9612tjiO19YqYAstJIyeYAOPczs8';

const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Contextual emoji helper for items
function getItemEmoji(item) {
  if (item && item.emoji) return item.emoji;
  const name = (item && (item.productName || item.name) || '').toLowerCase();
  const cat = Number(item && item.categoryId || 0);

  if (name.includes('matcha')) return '🍵';
  if (name.includes('fries')) return '🍟';
  if (name.includes('nacho') || name.includes('cheese stick')) return '🧀';
  if (name.includes('poppers') || name.includes('chix') || name.includes('chicken')) return '🍗';
  if (name.includes('burger') || name.includes('sandwich')) return '🥪';
  if (name.includes('waffle') || name.includes('croffle')) return '🧇';
  if (name.includes('spaghetti') || name.includes('pasta') || name.includes('carbonara')) return '🍝';
  if (name.includes('silog') || name.includes('tocino') || name.includes('tapa') || name.includes('liempo') || name.includes('porkchop') || name.includes('spam') || name.includes('hotsilog') || name.includes('hungarian')) return '🍳';
  if (name.includes('tea') && !name.includes('fruit')) return '🧋';
  if (name.includes('fruit') || name.includes('lemon') || name.includes('passion') || name.includes('berry') || name.includes('mango') || name.includes('lychee') || name.includes('peach') || name.includes('strawberry')) return '🍓';
  if (name.includes('soda') || name.includes('fizz')) return '🫧';
  if (name.includes('frappe')) return '🥤';
  if (name.includes('milk')) return '🥛';
  if (cat === 1 || cat === 2) return '☕';
  if (cat === 4) return '🥛';
  if (cat === 5) return '🥤';
  if (cat === 6) return '🍓';
  if (cat === 7) return '🫧';
  if (cat === 8) return '🍵';
  if (cat === 9) return '🧋';
  if (cat === 10) return '🧇';
  if (cat === 11) return '🥪';
  if (cat === 12) return '🍟';
  if (cat === 13) return '🍳';
  if (cat === 15) return '🍝';
  return '☕';
}

// Helper to determine ingredients for each product
function getProductIngredients(productId, productName, categoryId, productRecipeMap) {
  // 1. Database-backed chill_recipe ingredients (connected to chill_ingredient)
  if (productRecipeMap[productId] && productRecipeMap[productId].length > 0) {
    return productRecipeMap[productId].join(', ');
  }

  // 2. Realistic recipe ingredients based on product name & category
  const name = (productName || '').toLowerCase();
  const cat = Number(categoryId || 0);

  if (name.includes('americano')) {
    return name.includes('iced') ? 'Espresso, Cold Water, Ice' : 'Espresso, Hot Water';
  }
  if (name.includes('spanish')) return 'Espresso, Condensed Milk, Fresh Milk, Ice';
  if (name.includes('latte')) {
    if (name.includes('vanilla')) return 'Espresso, Steamed Milk, Vanilla Syrup';
    if (name.includes('caramel')) return 'Espresso, Steamed Milk, Caramel Sauce';
    if (name.includes('hazelnut')) return 'Espresso, Steamed Milk, Hazelnut Syrup';
    if (name.includes('matcha')) return 'Matcha Powder, Steamed Milk, Vanilla';
    return name.includes('iced') ? 'Espresso, Fresh Milk, Ice' : 'Espresso, Steamed Milk';
  }
  if (name.includes('cappuccino')) return 'Espresso, Steamed Milk, Milk Foam';
  if (name.includes('mocha')) return 'Espresso, Dark Chocolate Sauce, Fresh Milk';
  if (name.includes('matcha')) return 'Matcha Powder, Fresh Milk, Vanilla';
  if (name.includes('chocolate')) return 'Chocolate Syrup, Fresh Milk, Whipped Cream';
  if (name.includes('milk tea')) return 'Brewed Black Tea, Fresh Milk, Tapioca Pearls, Brown Sugar';
  if (name.includes('fruit tea')) {
    if (name.includes('passion')) return 'Brewed Jasmine Tea, Passion Fruit, Ice';
    if (name.includes('strawberry')) return 'Brewed Jasmine Tea, Strawberry Syrup, Ice';
    if (name.includes('lychee')) return 'Brewed Jasmine Tea, Lychee Syrup, Ice';
    if (name.includes('lemon')) return 'Brewed Jasmine Tea, Fresh Lemon, Ice';
    return 'Brewed Green Tea, Fruit Syrup, Ice';
  }
  if (name.includes('soda') || name.includes('fizz')) return 'Carbonated Soda, Fruit Syrup, Fresh Calamansi, Ice';
  if (name.includes('frappe')) return 'Blended Espresso, Ice, Fresh Milk, Whipped Cream';
  if (name.includes('croffle') || name.includes('waffle')) return 'Butter Croissant Dough, Sweet Glaze, Whipped Cream';
  if (name.includes('sandwich') || name.includes('burger')) return 'Toasted Bread, Sliced Ham, Cheddar Cheese, Mayo Dressing';
  if (name.includes('fries')) return 'Crispy Potato Fries, Barbecue & Cheese Seasoning';
  if (name.includes('nacho')) return 'Crispy Corn Tortilla, Seasoned Ground Beef, Melted Cheese Sauce';
  if (name.includes('cheese stick')) return 'Golden Cheese Sticks, Garlic Mayonnaise Dip';
  if (name.includes('silog') || name.includes('tapa') || name.includes('tocino') || name.includes('liempo') || name.includes('porkchop') || name.includes('spam')) {
    return 'Garlic Sinangag Rice, Sunny-Side Fried Egg, House Marinated Protein';
  }
  if (name.includes('spaghetti') || name.includes('pasta') || name.includes('carbonara')) {
    return 'Al Dente Pasta, Cream Sauce, Bacon Bits, Parmesan Cheese';
  }
  if (cat === 1 || cat === 2) return 'House Espresso Blend, Purified Water';
  if (cat === 4 || cat === 8) return 'Fresh Dairy Milk, Sweetener, Ice';
  if (cat === 9) return 'Brewed Tea Blend, Creamer, Tapioca Pearls';
  if (cat === 5) return 'Blended Ice Base, Flavoring, Fresh Milk';
  if (cat === 6) return 'Green Tea Infusion, Fruit Puree, Ice';
  if (cat === 12) return 'Savory Finger Food, Signature Dip';
  if (cat === 13) return 'Garlic Fried Rice, Fried Egg, Savory Main';
  if (cat === 15) return 'Italian Pasta, House Sauce, Seasoning';
  return 'Fresh ingredients crafted upon order';
}

// ═════════════════════════════════════════
// 2. FETCH MENU, SIZES, ADDONS & RECIPES
// ═════════════════════════════════════════
async function loadMenuFromSupabase() {
  if (!db) {
    console.error("❌ Supabase connection not found!");
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

    // Map recipe ingredients by productId
    const productRecipeMap = {};
    recipesList.forEach(r => {
      if (!productRecipeMap[r.productId]) {
        productRecipeMap[r.productId] = [];
      }
      const ingName = ingredientLookup[r.ingredientId];
      if (ingName && !productRecipeMap[r.productId].includes(ingName)) {
        productRecipeMap[r.productId].push(ingName);
      }
    });

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
        const recipeText = getProductIngredients(item.productId, item.productName || item.name, item.categoryId, productRecipeMap);

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
          emoji: getItemEmoji(item)
        };
      });

      // Find top selling product from actual orders
      await loadTopSellingProduct();

      buildGrids();
      syncUI();
      preloadOrderNumbers();
      if (typeof initPromoSlideshow === 'function') initPromoSlideshow();
    }
  } catch (err) {
    console.error("❌ Failed to load menu:", err);
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
      if (sorted.length > 0 && sorted[0].score > 0) {
        TOP_SELLING_PRODUCT = sorted[0].product;
      }
    }
  } catch (e) {
    console.warn("Could not determine top selling product from orders:", e);
  }

  if (!TOP_SELLING_PRODUCT) {
    TOP_SELLING_PRODUCT = ALL_ITEMS.find(i => i.productName.toLowerCase().includes('latte')) || ALL_ITEMS[0];
  }

  renderTopSellingCard(TOP_SELLING_PRODUCT);
}

function renderTopSellingCard(product) {
  if (!product) return;
  const featEmoji = document.getElementById('featEmoji');
  const featName = document.getElementById('featName');
  const featDesc = document.getElementById('featDesc');
  const featPrice = document.getElementById('featPrice');
  const featCard = document.getElementById('featCard');
  const featAddBtn = document.getElementById('featAddBtn');

  if (featEmoji) featEmoji.textContent = product.emoji || getItemEmoji(product);
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

  const fn = (e) => {
    if (e) e.stopPropagation();
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
      espresso: '☕ Espresso',
      noncoffee: '🥛 Non-Coffee',
      milktea: '🧋 Milk Tea',
      frappe: '🥤 Frappe',
      fruittea: '🍓 Fruit Tea',
      soda: '🫧 Soda',
      croffle: '🥐 Croffles',
      sandwiches: '🥪 Sandwiches',
      snacks: '🍟 Snacks',
      silog: '🍳 Silog Meals',
      pasta: '🍝 Pasta'
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
    console.error("❌ Failed to load categories:", err);
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
  d.className = 'item-card';

  const itemName = item.productName || item.name || 'Unknown Item';
  // Do NOT display recipe on card; only genuine marketing description if present
  const cleanDesc = (item.description && item.description.trim() && item.description.trim() !== "''") ? item.description.trim() : '';
  const itemEmoji = item.emoji || getItemEmoji(item);

  let priceHTML = '';

  if (item.hasSizes && item.sizes && item.sizes.length > 0) {
    if (item.minPrice !== item.maxPrice) {
      priceHTML = `₱${item.minPrice} - ₱${item.maxPrice}`;
    } else {
      priceHTML = `₱${item.minPrice}`;
    }
  } else {
    priceHTML = `₱${item.price || 0}`;
  }

  let sizePillsHTML = '';
  if (item.hasSizes && item.sizes && item.sizes.length > 0) {
    sizePillsHTML = `
      <div class="card-size-tags">
        ${item.sizes.map(s => `<span class="size-tag">${s.sizeName}</span>`).join('')}
      </div>
    `;
  }

  d.innerHTML = `
    <div class="item-emoji">${itemEmoji}</div>
    <div class="item-name">${itemName}</div>
    ${cleanDesc ? `<div class="item-desc">${cleanDesc}</div>` : ''}
    <div class="card-spacer"></div>
    ${sizePillsHTML}
    <div class="card-footer">
      <div class="item-price">${priceHTML}</div>
      <button class="add-btn" aria-label="Add ${itemName}">+</button>
    </div>
  `;
  const fn = () => triggerConfirmation(item);
  d.querySelector('.add-btn').addEventListener('click', e => { e.stopPropagation(); fn(); });
  d.addEventListener('click', fn);
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
}

function addItem(name, emoji, price, desc) {
  const isPromoItem = name.includes('[-20%') || name.includes('B1T1 Claimed');
  const ex = cart.find(i => i.name === name);
  
  if (ex) {
    if (isPromoItem) {
      showToast('Promo limited to 1 per order!');
      return; 
    }
    ex.qty++;
  } else {
    cart.push({name, emoji, price, desc, qty:1});
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
            <div class="ci-emoji">${item.emoji}</div>
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
      emoji: item.emoji || '☕',
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
        if (error) console.error('❌ Failed to insert to chill_kiosk_queue:', error);
        else console.log('✅ Order recorded in chill_kiosk_queue:', data);
      })
      .catch(err => console.error('❌ Exception inserting to chill_kiosk_queue:', err));
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
  const finalPrice = basePrice + addonTotal;

  const priceValEl = document.getElementById('modal-price-value');
  if (priceValEl) priceValEl.textContent = '₱' + finalPrice;
}

function triggerConfirmation(item) {
  if (!item) return;
  itemPendingConfirmation = item;
  
  const itemName = item.productName || item.name || 'Café Latte';
  const cleanDesc = (item.description && item.description.trim() && item.description.trim() !== "''") ? item.description.trim() : '';
  const itemEmoji = item.emoji || getItemEmoji(item);
  const itemRecipe = (item.recipe || '').trim();
  const itemUid = item.productId || item.uid || '—';

  const uidEl = document.getElementById('modal-uid');
  const emojiEl = document.getElementById('modal-emoji');
  const titleEl = document.getElementById('modal-title');
  const descEl = document.getElementById('modal-desc');
  const recipeTextEl = document.getElementById('modal-recipe-text');
  const recipeContent = document.getElementById('modal-recipe-content');

  if (uidEl) uidEl.textContent = 'UID: ' + itemUid;
  if (emojiEl) emojiEl.textContent = itemEmoji;
  if (titleEl) titleEl.textContent = itemName;
  if (descEl) {
    descEl.textContent = cleanDesc;
    descEl.style.display = cleanDesc ? 'block' : 'none';
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

      if (isSyrupOrPowder && subRecipes.length > 0) {
        // Dropdown container for syrup/sauce/powder varieties
        const optionsHtml = subRecipes.map(sr => `<option value="${sr.ingredientName}">${sr.ingredientName}</option>`).join('');
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
            <button class="addon-btn" data-addon-id="${a.addonsId}" data-name="${a.addonsName}" data-price="${a.price}">
              <span>${a.addonsName}</span>
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
      let finalName = itemPendingConfirmation.productName || itemPendingConfirmation.name;
      const basePrice = currentSelectedSize ? currentSelectedSize.price : (Number(itemPendingConfirmation.price || itemPendingConfirmation.minPrice || 0));
      const addonTotal = selectedAddons.reduce((sum, a) => sum + (Number(a.price) || 0), 0);

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
      
      const itemEmoji = itemPendingConfirmation.emoji || getItemEmoji(itemPendingConfirmation);
      addItem(finalName, itemEmoji, basePrice + addonTotal, itemPendingConfirmation.description || itemPendingConfirmation.desc);
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

// Future implementation: Fetch promotions dynamically from Supabase table 'chill_promotion'
async function loadPromosFromSupabase() {
  if (!db) return;
  try {
    const { data, error } = await db.from('chill_promotion').select('*');
    if (error) throw error;
    
    const slideshow = document.getElementById('promoSlideshow');
    if (!slideshow) return;

    if (data && data.length > 0) {
      // Render promos fetched live from Supabase
      slideshow.innerHTML = data.map((p, idx) => `
        <div class="slide ${idx === 0 ? 'active' : ''}" data-index="${idx}">
          <div class="slide-fomo">${p.promoType || 'Special Offer'}</div>
          <div class="slide-name">${p.promoName || p.name}</div>
          <div class="slide-promo">${p.details || ''}</div>
        </div>
      `).join('');
    } else {
      slideshow.innerHTML = `<div class="slide active"><div class="slide-name">Welcome to ChillVentoryx</div></div>`;
    }
  } catch (err) {
    console.error("❌ Failed to load promotions from cloud:", err);
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
    if (hintEl) hintEl.textContent = 'Start by choosing a drink or a snack ✨';

    optionsContainer.innerHTML = `
      <button class="craving-btn" onclick="handleQuizAnswer(1, 'drink')">
        <span style="font-size:22px;">🥤</span>
        <span>A Drink</span>
      </button>
      <button class="craving-btn" onclick="handleQuizAnswer(1, 'snack')">
        <span style="font-size:22px;">🥐</span>
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
          <span style="font-size:22px;">🧊</span>
          <span>Cold & Iced</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'hot')">
          <span style="font-size:22px;">☕</span>
          <span>Warm & Hot</span>
        </button>
      `;
    } else {
      titleEl.textContent = 'What flavor are you craving?';
      if (hintEl) hintEl.textContent = 'Sweet pastries, cheesy savory bites, or hearty meats?';

      optionsContainer.innerHTML = `
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'sweet')">
          <span style="font-size:22px;">🍫</span>
          <span>Sweet Pastry & Waffles</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'savory')">
          <span style="font-size:22px;">🧀</span>
          <span>Cheesy & Savory</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(2, 'meaty')">
          <span style="font-size:22px;">🍖</span>
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
          <span style="font-size:22px;">🍯</span>
          <span>Sweet & Creamy</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'bold')">
          <span style="font-size:22px;">☕</span>
          <span>Strong & Bold Espresso</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'fruity')">
          <span style="font-size:22px;">🍓</span>
          <span>Fruity & Zesty</span>
        </button>
      `;
    } else {
      titleEl.textContent = 'What style hits the spot?';
      if (hintEl) hintEl.textContent = 'Finger food, hearty rice meal, or crispy pastry?';

      optionsContainer.innerHTML = `
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'bites')">
          <span style="font-size:22px;">🍟</span>
          <span>Finger Food & Bites</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'meal')">
          <span style="font-size:22px;">🍳</span>
          <span>Full Meal (Silog / Pasta)</span>
        </button>
        <button class="craving-btn" onclick="handleQuizAnswer(3, 'crispy')">
          <span style="font-size:22px;">🥐</span>
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

  if (badgeEl) badgeEl.textContent = 'Recommendations Ready ✨';
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

  // Fallback to general category pool if fewer than 3 items matched
  if (matches.length < 3) {
    const fallbackPool = ALL_ITEMS.filter(item => {
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
        const pEmoji = item.emoji || getItemEmoji(item);
        const pId = item.productId || item.uid;

        return `
          <div class="quiz-rec-card" onclick="selectQuizRecommendation(${pId})">
            <div class="quiz-rec-emoji">${pEmoji}</div>
            <div class="quiz-rec-name">${pName}</div>
            <div class="quiz-rec-price">${pPrice}</div>
            <button class="quiz-rec-btn">Order This →</button>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: 20px;">No exact matches found. Please explore the main menu!</p>`;
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
    triggerConfirmation(found);
  }
}

// Make accessible for inline onclick handlers
window.handleQuizAnswer = handleQuizAnswer;
window.selectQuizRecommendation = selectQuizRecommendation;

// Trigger promo loading & quiz on boot
document.addEventListener('DOMContentLoaded', () => {
  loadPromosFromSupabase();
  initVirtualBaristaQuiz();
});