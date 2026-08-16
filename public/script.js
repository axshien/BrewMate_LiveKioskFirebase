let ALL_ITEMS = [];
let cart = [];

// ═════════════════════════════════════════
// 1. SUPABASE DATABASE CONNECTION
// ═════════════════════════════════════════
const SUPABASE_URL = 'https://nkhyzzevgyteaehwexsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raHl6emV2Z3l0ZWFlaHdleHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzgzNzEsImV4cCI6MjEwMTE1NDM3MX0.tDJzxwg5Vjsynbi9612tjiO19YqYAstJIyeYAOPczs8';

const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// ═════════════════════════════════════════
// 2. FETCH MENU FROM SUPABASE CLOUD
// ═════════════════════════════════════════
async function loadMenuFromSupabase() {
  if (!db) {
    console.error("❌ Supabase connection not found!");
    return;
  }
  
  try {
    const { data, error } = await db.from('chill_product_item').select('*');
    if (error) throw error;
    
    if (data && data.length > 0) {
      ALL_ITEMS = data; 
      buildGrids();
      syncUI();
      if (typeof initPromoSlideshow === 'function') initPromoSlideshow();
    }
  } catch (err) {
    console.error("❌ Failed to load menu:", err);
    showToast("Error loading menu from cloud.");
  }
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
      .eq('categoryType', 'Product');
    
    if (error) throw error;
    
    const container = document.getElementById('categoryContainer');
    if (!container) return;

    let html = `<button class="cat-pill active" data-cat="all">All</button>`;
    
    if (data && data.length > 0) {
      data.forEach(cat => {
        const catName = cat.categoryName || cat.name;
        const catId = cat.categoryId || cat.id;
        const catVal = mapCategoryToSlug(catId, catName);
        
        if (catName) {
          html += `<button class="cat-pill" data-cat="${catVal}">${catName}</button>`;
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
  const name = catName.toLowerCase();
  if (catId === 1 || name.includes('espresso')) return 'espresso';
  if (catId === 2 || name.includes('flavored')) return 'espresso';
  if (catId === 4 || name.includes('milk-based')) return 'noncoffee';
  if (catId === 8 || name.includes('matcha')) return 'noncoffee';
  if (catId === 9 || name.includes('milk tea')) return 'milktea';
  if (catId === 5 || name.includes('frappe')) return 'frappe';
  if (catId === 6 || name.includes('fruit tea')) return 'fruittea';
  if (catId === 7 || name.includes('soda')) return 'soda';
  if (catId === 10 || name.includes('waffle')) return 'croffle';
  if (catId === 11 || name.includes('sandwich')) return 'sandwiches';
  if (catId >= 12 && catId <= 15 || name.includes('snack') || name.includes('silog') || name.includes('pasta')) return 'snacks';
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
  d.style.position = 'relative';

  const itemName = item.productName || item.name || 'Unknown Item';
  const itemDesc = item.description || item.desc || '';
  const itemPrice = item.price || 0;
  const itemEmoji = item.emoji || '☕';

  let badgeHTML = '';
  let priceHTML = `₱${itemPrice}`;
  let bannerHTML = '';

  if (item.promo === 'B1T1') {
    badgeHTML = `<div class="promo-badge b1t1">B1T1</div>`;
    bannerHTML = `<div class="promo-banner">🎁 Buy 1 Get 1</div>`;
  } else if (item.promo === '20%') {
    badgeHTML = `<div class="promo-badge discount">-20%</div>`;
    const discountedPrice = Math.floor(itemPrice * 0.8);
    priceHTML = `<span class="price-strike">₱${itemPrice}</span> ₱${discountedPrice}`;
    bannerHTML = `<div class="promo-banner" style="background: #FDEDED; color: #C0392B;">🏷️ 20% OFF (Apply inside)</div>`;
  }

  d.innerHTML = `
    ${badgeHTML}
    <div class="item-emoji">${itemEmoji}</div>
    <div class="item-name">${itemName}</div>
    <div class="item-desc">${itemDesc}</div>
    <div class="item-price" style="display:flex; align-items:center;">${priceHTML}</div>
    <button class="add-btn" style="margin-bottom: ${bannerHTML ? '12px' : '0'};">+</button>
    ${bannerHTML}
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
    document.querySelectorAll('.order-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentOrderType = btn.dataset.type;
  });
});

// ═════════════════════════════════════════
// 5. PLACE ORDER (Local Placeholder & Receipt)
// ═════════════════════════════════════════
function placeOrder() {
  if (!cart.length) return;
  const nicknameInput = document.getElementById('customerNickname').value.trim();
  if (nicknameInput.length < 3) {
    showToast('Please enter a nickname (at least 3 letters)');
    return;
  }

  const total = cart.reduce((s,i) => s + i.price * i.qty, 0);
  const count = cart.reduce((s,i) => s + i.qty, 0);
  const qn = Math.floor(Math.random() * 900) + 100;
  const now = new Date();
  const invoiceString = `#INV-${now.getFullYear()}-${String(qn).padStart(4, '0')}`;
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '');
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const finalNickname = nicknameInput.toUpperCase();
  const discountAmt = total * 0.10;
  const finalTotal = total - discountAmt;

  document.getElementById('queueNum').textContent = qn;
  document.getElementById('confirmInvoice').textContent = invoiceString;
  document.getElementById('confirmDate').textContent = dateStr;
  document.getElementById('confirmTime').textContent = timeStr;
  document.getElementById('confirmNickname').textContent = finalNickname;
  document.getElementById('confirmItems').textContent = count + ' item' + (count !== 1 ? 's' : '');
  document.getElementById('confirmOrderType').textContent = currentOrderType;
  document.getElementById('confirmAmount').textContent = '₱' + total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

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

  if (typeof generateDigitalReceipt === 'function') {
    generateDigitalReceipt(finalNickname, invoiceString, dateStr, timeStr, total, count, discountAmt, finalTotal);
  }
  
  goTo('confirmScreen');
}

function newOrder() {
  cart = [];
  const notes = document.getElementById('orderNotes');
  const nick = document.getElementById('customerNickname');
  if (notes) notes.value = '';
  if (nick) nick.value = '';
  syncUI();
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
function showToast(msg) {
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

  const quizModalOverlay = document.getElementById('quiz-modal-overlay');
  const quizTriggerEl = document.getElementById('quizBannerCard') || document.querySelector('.hero-banner > div:first-child');
  
  if (quizTriggerEl) {
    quizTriggerEl.style.cursor = 'pointer';
    quizTriggerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (quizModalOverlay) {
        quizModalOverlay.classList.remove('hidden');
        quizModalOverlay.style.display = 'flex';
        quizModalOverlay.style.opacity = '1';
        quizModalOverlay.style.pointerEvents = 'auto';
      }
    });
  }

  const closeQuizBtn = document.getElementById('close-quiz-btn');
  if (closeQuizBtn) {
    closeQuizBtn.addEventListener('click', () => {
      if (quizModalOverlay) {
        quizModalOverlay.classList.add('hidden');
        quizModalOverlay.style.opacity = '0';
        quizModalOverlay.style.pointerEvents = 'none';
      }
    });
  }

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
let currentAddonPrice = 0; 
let currentAddonName = ''; 
let currentSize = '16oz'; 
let isBeverage = true;

const confirmationOverlay = document.getElementById('confirmation-overlay');
const receiptOverlay = document.getElementById('receipt-overlay');

function updateModalPrice() {
  if (!itemPendingConfirmation) return;
  let calcPrice = itemPendingConfirmation.price || 110;
  
  if (isBeverage && currentSize === '22oz') {
    calcPrice = Math.ceil(calcPrice * 1.17);
  }

  const promoChk = document.getElementById('promo-opt-in');
  if (promoChk && promoChk.checked) {
    calcPrice = Math.floor(calcPrice * 0.80);
  }

  const finalPrice = calcPrice + currentAddonPrice;
  const priceValEl = document.getElementById('modal-price-value');
  if (priceValEl) priceValEl.textContent = '₱' + finalPrice;
}

function triggerConfirmation(item) {
  if (!item) return;
  itemPendingConfirmation = item;
  
  const itemName = item.productName || item.name || 'Café Latte';
  const itemDesc = item.description || item.desc || 'Best Selling Café';
  const itemPrice = item.price || 110;
  const itemEmoji = item.emoji || '☕';
  const itemRecipe = item.recipe || 'Espresso Shot, Steamed Milk, Light Milk Foam';
  const itemUid = item.productId || item.uid || '1000101';
  const itemPromo = item.promo || 'B1T1';

  const uidEl = document.getElementById('modal-uid');
  const emojiEl = document.getElementById('modal-emoji');
  const titleEl = document.getElementById('modal-title');
  const descEl = document.getElementById('modal-desc');
  const recipeTextEl = document.getElementById('modal-recipe-text');
  const recipeContent = document.getElementById('modal-recipe-content');

  if (uidEl) uidEl.textContent = 'UID: ' + itemUid;
  if (emojiEl) emojiEl.textContent = itemEmoji;
  if (titleEl) titleEl.textContent = itemName;
  if (descEl) descEl.textContent = itemDesc;
  if (recipeTextEl) recipeTextEl.textContent = itemRecipe;
  if (recipeContent) recipeContent.classList.add('hidden');
  
  const promoSection = document.getElementById('modal-promo-section');
  const promoCheckbox = document.getElementById('promo-opt-in');
  if (promoSection && promoCheckbox) {
    if (itemPromo === '20%') { promoSection.classList.remove('hidden'); promoCheckbox.checked = false; } 
    else { promoSection.classList.add('hidden'); promoCheckbox.checked = false; }
  }

  const b1t1Section = document.getElementById('modal-b1t1-section');
  const b1t1Checkbox = document.getElementById('b1t1-opt-in');
  if (b1t1Section && b1t1Checkbox) {
    if (itemPromo === 'B1T1') { b1t1Section.classList.remove('hidden'); b1t1Checkbox.checked = false; } 
    else { b1t1Section.classList.add('hidden'); b1t1Checkbox.checked = false; }
  }

  currentAddonPrice = 0; 
  currentAddonName = '';
  document.querySelectorAll('.addon-btn').forEach(b => b.classList.remove('active'));
  const noneBtn = document.querySelector('.addon-btn[data-addon="none"]');
  if (noneBtn) noneBtn.classList.add('active');

  const catVal = String(item.cat || item.category || 'espresso').toLowerCase();
  isBeverage = !['croffle', 'sandwiches', 'snacks'].includes(catVal);
  
  const sizeSection = document.getElementById('modal-size-section');
  const addonSection = document.querySelector('#confirmation-overlay .addon-section'); 
  
  if (isBeverage) {
    if (sizeSection) sizeSection.classList.remove('hidden');
    if (addonSection) addonSection.classList.remove('hidden');
    currentSize = '16oz';
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    const size16 = document.querySelector('.size-btn[data-size="16oz"]');
    if (size16) size16.classList.add('active');
    
    const diff = Math.ceil(itemPrice * 1.17) - itemPrice;
    const upsizeBtn = document.getElementById('btn-upsize');
    if (upsizeBtn) upsizeBtn.textContent = `22oz (+₱${diff})`;
  } else {
    if (sizeSection) sizeSection.classList.add('hidden');
    if (addonSection) addonSection.classList.add('hidden');
    currentSize = ''; 
  }
  
  updateModalPrice();
  if (confirmationOverlay) confirmationOverlay.classList.remove('hidden');
} 

document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSize = btn.dataset.size;
    updateModalPrice();
  });
});

document.querySelectorAll('.addon-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.addon-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentAddonPrice = parseFloat(btn.dataset.price) || 0;
    currentAddonName = btn.dataset.addon !== 'none' ? btn.textContent.split(' (+')[0] : '';
    updateModalPrice();
  });
});

const promoCheckbox = document.getElementById('promo-opt-in');
if (promoCheckbox) promoCheckbox.addEventListener('change', updateModalPrice);

const b1t1Checkbox = document.getElementById('b1t1-opt-in');
if (b1t1Checkbox) b1t1Checkbox.addEventListener('change', updateModalPrice);

const toggleRecipeBtn = document.getElementById('btn-toggle-recipe');
if (toggleRecipeBtn) {
  toggleRecipeBtn.addEventListener('click', () => {
    const content = document.getElementById('modal-recipe-content');
    if (content) content.classList.toggle('hidden');
  });
}

const confirmOrderBtn = document.getElementById('btn-confirm-order');
if (confirmOrderBtn) {
  confirmOrderBtn.addEventListener('click', () => {
    if (itemPendingConfirmation) {
      let finalName = itemPendingConfirmation.productName || itemPendingConfirmation.name;
      let calcPrice = itemPendingConfirmation.price || 110;

      const promoChk = document.getElementById('promo-opt-in');
      if (promoChk && promoChk.checked) {
        calcPrice = Math.floor(calcPrice * 0.80);
        finalName += ' [-20% Off]';
      }

      const b1t1Chk = document.getElementById('b1t1-opt-in');
      if (b1t1Chk && b1t1Chk.checked) {
        finalName += ' [B1T1 Claimed]';
      }

      if (isBeverage) {
         if (currentSize === '22oz') { calcPrice = Math.ceil(calcPrice * 1.17); finalName += ' (22oz)'; } 
         else { finalName += ' (16oz)'; }
      }

      if (currentAddonName) finalName += ` [+ ${currentAddonName}]`;
      
      addItem(finalName, itemPendingConfirmation.emoji || '☕', calcPrice + currentAddonPrice, itemPendingConfirmation.description || itemPendingConfirmation.desc);
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

// Featured Card Binding
const fc = document.getElementById('featCard');
if (fc) {
  const fcFn = () => triggerConfirmation({
    name: fc.dataset.name, 
    emoji: fc.dataset.emoji, 
    price: +fc.dataset.price, 
    desc: fc.dataset.desc,
    cat: fc.dataset.category, 
    recipe: fc.dataset.recipe, 
    uid: fc.dataset.uid, 
    promo: 'B1T1', 
    cal: 150 
  });
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

// Trigger promo loading on boot
document.addEventListener('DOMContentLoaded', () => {
  loadPromosFromSupabase();

  // Quiz Modal Trigger (Ready for Supabase-driven questions or category mapping)
  const quizCard = document.getElementById('quizBannerCard');
  const quizOverlay = document.getElementById('quiz-modal-overlay');
  
  if (quizCard && quizOverlay) {
    quizCard.addEventListener('click', () => {
      quizOverlay.classList.remove('hidden');
      quizOverlay.style.display = 'flex';
      quizOverlay.style.opacity = '1';
      quizOverlay.style.pointerEvents = 'auto';
    });
  }

  const closeQuizBtn = document.getElementById('close-quiz-btn');
  if (closeQuizBtn && quizOverlay) {
    closeQuizBtn.addEventListener('click', () => {
      quizOverlay.classList.add('hidden');
      quizOverlay.style.opacity = '0';
      quizOverlay.style.pointerEvents = 'none';
    });
  }
});