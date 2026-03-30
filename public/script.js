
  const BEVERAGES = [
    {name:'Espresso',       emoji:'☕', price:110, desc:'Double shot'},
    {name:'Cappuccino',     emoji:'🍵', price:135, desc:'Classic Italian'},
    {name:'Cold Brew',      emoji:'🧊', price:155, desc:'Slow-steeped'},
    {name:'Matcha Latte',   emoji:'🍵', price:160, desc:'Ceremonial grade'},
    {name:'Caramel Macch.', emoji:'☕', price:165, desc:'Vanilla & caramel'},
    {name:'Iced Americano', emoji:'🧋', price:120, desc:'Bold & refreshing'},
    {name:'Flat White',     emoji:'☕', price:150, desc:'Silky microfoam'},
    {name:'Mocha',          emoji:'🍫', price:155, desc:'Chocolate espresso'},
  ];
  const PASTRIES = [
    {name:'Butter Croissant', emoji:'🥐', price:75,  desc:'Flaky & buttery'},
    {name:'Blueberry Muffin', emoji:'🫐', price:80,  desc:'Fresh blueberries'},
    {name:'Banana Bread',     emoji:'🍌', price:70,  desc:'Moist & warm'},
    {name:'Cinnamon Roll',    emoji:'🌀', price:95,  desc:'House special'},
    {name:'Choco Danish',     emoji:'🍫', price:85,  desc:'Dark chocolate'},
    {name:'Almond Tart',      emoji:'🥧', price:90,  desc:'French-style'},
  ];

  let cart = [];
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

  function makeCard(item) {
    const d = document.createElement('div');
    d.className = 'item-card';
    d.innerHTML = `
      <div class="item-emoji">${item.emoji}</div>
      <div class="item-name">${item.name}</div>
      <div class="item-desc">${item.desc}</div>
      <div class="item-price">₱${item.price}</div>
      <button class="add-btn">+</button>`;
    const fn = () => addItem(item.name, item.emoji, item.price, item.desc);
    d.querySelector('.add-btn').addEventListener('click', e => { e.stopPropagation(); fn(); });
    d.addEventListener('click', fn);
    return d;
  }

  function buildGrids() {
    const bg = document.getElementById('beveragesGrid');
    const pg = document.getElementById('pastryGrid');
    BEVERAGES.forEach(i => bg.appendChild(makeCard(i)));
    PASTRIES.forEach(i  => pg.appendChild(makeCard(i)));
  }

  function addItem(name, emoji, price, desc) {
    const ex = cart.find(i => i.name === name);
    ex ? ex.qty++ : cart.push({name, emoji, price, desc, qty:1});
    syncUI();
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
    const total = cart.reduce((s,i) => s + i.price * i.qty, 0);
    const count = cart.reduce((s,i) => s + i.qty, 0);
    document.getElementById('navCartBadge').textContent = count;
  }

  function renderCart() {
    const con   = document.getElementById('cartItemsContainer');
    const total = cart.reduce((s,i) => s + i.price * i.qty, 0);

    con.innerHTML = cart.length === 0
      ? `<div class="empty-state"><div class="empty-icon">🛒</div><p>Your cart is empty</p></div>`
      : cart.map((item, idx) => `
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
          </div>`).join('');

    const fmt = '₱' + total.toLocaleString();
    document.getElementById('cartSubtotal').textContent = fmt;
    document.getElementById('cartTotal').textContent    = fmt;
    document.getElementById('placeOrderBtn').disabled   = cart.length === 0;
  }

  function placeOrder() {
    if (!cart.length) return;
    const total = cart.reduce((s,i) => s + i.price * i.qty, 0);
    const count = cart.reduce((s,i) => s + i.qty, 0);
    const qn    = Math.floor(Math.random() * 900) + 100;
    document.getElementById('queueNum').textContent      = qn;
    document.getElementById('confirmItems').textContent  = count + ' item' + (count !== 1 ? 's' : '');
    document.getElementById('confirmAmount').textContent = '₱' + total.toLocaleString();
    goTo('confirmScreen');
  }

  function newOrder() {
    cart = [];
    document.getElementById('orderNotes').value = '';
    syncUI();
    goTo('welcomeScreen');
  }

  function filterCat(btn, cat) {
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.filterable-item,.filterable-title').forEach(el => {
      el.dataset.hidden = (cat !== 'all' && el.dataset.category !== cat) ? 'true' : 'false';
    });
  }

  let toastTimer;
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // Wire events
  document.getElementById('startBtn').addEventListener('click',      () => goTo('menuScreen'));
  document.getElementById('menuBackBtn').addEventListener('click',   () => goTo('welcomeScreen'));
  document.getElementById('cartBackBtn').addEventListener('click',   () => goTo('menuScreen'));
  document.getElementById('navCartBtn').addEventListener('click',    () => goTo('cartScreen'));
  document.getElementById('placeOrderBtn').addEventListener('click', placeOrder);
  document.getElementById('newOrderBtn').addEventListener('click',   newOrder);

  const fc   = document.getElementById('featCard');
  const fcFn = () => addItem(fc.dataset.name, fc.dataset.emoji, +fc.dataset.price, fc.dataset.desc);
  document.getElementById('featAddBtn').addEventListener('click', e => { e.stopPropagation(); fcFn(); });
  fc.addEventListener('click', fcFn);

  document.querySelectorAll('.cat-pill').forEach(p =>
    p.addEventListener('click', () => filterCat(p, p.dataset.cat))
  );

  buildGrids();
  syncUI();