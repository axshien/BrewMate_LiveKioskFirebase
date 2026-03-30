
  const ALL_ITEMS = [
    // ESPRESSO
    {name:'Americano', emoji:'☕', price:65, desc:'16oz', cat:'espresso', tags:['drink', 'hot', 'cold', 'strong']},
    {name:'Café Latte', emoji:'☕', price:110, desc:'16oz', cat:'espresso', tags:['drink', 'hot', 'cold', 'milky']},
    {name:'Cappuccino', emoji:'☕', price:110, desc:'16oz', cat:'espresso', tags:['drink', 'hot', 'milky']},
    {name:'Vanilla Latte', emoji:'☕', price:120, desc:'16oz', cat:'espresso', tags:['drink', 'hot', 'cold', 'sweet']},
    {name:'Spanish Latte', emoji:'☕', price:120, desc:'16oz', cat:'espresso', tags:['drink', 'hot', 'cold', 'sweet']},
    {name:'Caramel Macchiato', emoji:'☕', price:120, desc:'16oz', cat:'espresso', tags:['drink', 'hot', 'cold', 'sweet']},
    {name:'Salted Caramel', emoji:'☕', price:120, desc:'16oz', cat:'espresso', tags:['drink', 'hot', 'cold', 'sweet']},
    {name:'Mocha Latte', emoji:'🍫', price:120, desc:'16oz', cat:'espresso', tags:['drink', 'hot', 'cold', 'chocolate']},
    {name:'White Mocha', emoji:'☕', price:120, desc:'16oz', cat:'espresso', tags:['drink', 'hot', 'cold', 'sweet']},
    {name:'Dark Mocha Latte', emoji:'🍫', price:120, desc:'16oz', cat:'espresso', tags:['drink', 'hot', 'cold', 'strong', 'chocolate']},
    {name:'Hazelnut Latte', emoji:'🌰', price:120, desc:'16oz', cat:'espresso', tags:['drink', 'hot', 'cold', 'sweet']},
    {name:'Dirty Matcha', emoji:'🍵', price:120, desc:'16oz', cat:'espresso', tags:['drink', 'hot', 'cold', 'strong']},
    
    // NON-COFFEE
    {name:'Milky Caramel', emoji:'🥛', price:100, desc:'16oz', cat:'noncoffee', tags:['drink', 'cold', 'sweet', 'milky']},
    {name:'Milky Salted Caramel', emoji:'🥛', price:100, desc:'16oz', cat:'noncoffee', tags:['drink', 'cold', 'sweet', 'milky']},
    {name:'Milky Mocha', emoji:'🍫', price:100, desc:'16oz', cat:'noncoffee', tags:['drink', 'cold', 'chocolate', 'milky']},
    {name:'Milky White Mocha', emoji:'🥛', price:100, desc:'16oz', cat:'noncoffee', tags:['drink', 'cold', 'sweet', 'milky']},
    {name:'Milky Dark Mocha', emoji:'🍫', price:100, desc:'16oz', cat:'noncoffee', tags:['drink', 'cold', 'chocolate', 'milky']},
    {name:'Milky Hazelnut', emoji:'🌰', price:100, desc:'16oz', cat:'noncoffee', tags:['drink', 'cold', 'sweet', 'milky']},
    {name:'Milky Strawberry', emoji:'🍓', price:100, desc:'16oz', cat:'noncoffee', tags:['drink', 'cold', 'fruity', 'milky']},
    {name:'Matcha Latte', emoji:'🍵', price:120, desc:'16oz', cat:'noncoffee', tags:['drink', 'hot', 'cold', 'milky']},
    {name:'Matcha Strawberry', emoji:'🍵', price:120, desc:'16oz', cat:'noncoffee', tags:['drink', 'cold', 'fruity', 'milky']},

    // MILK TEA
    {name:'WinterMelon', emoji:'🧋', price:59, desc:'16oz', cat:'milktea', tags:['drink', 'cold', 'sweet']},
    {name:'Okinawa', emoji:'🧋', price:59, desc:'16oz', cat:'milktea', tags:['drink', 'cold', 'sweet']},
    {name:'Taro', emoji:'🍠', price:59, desc:'16oz', cat:'milktea', tags:['drink', 'cold', 'sweet']},
    {name:'Cookies & Cream', emoji:'🍪', price:59, desc:'16oz', cat:'milktea', tags:['drink', 'cold', 'sweet', 'chocolate']},
    {name:'Java Chips', emoji:'🍫', price:59, desc:'16oz', cat:'milktea', tags:['drink', 'cold', 'chocolate']},
    {name:'Dark Mocha', emoji:'🍫', price:59, desc:'16oz', cat:'milktea', tags:['drink', 'cold', 'chocolate']},
    {name:'Mocha', emoji:'☕', price:59, desc:'16oz', cat:'milktea', tags:['drink', 'cold', 'chocolate']},
    {name:'Matcha', emoji:'🍵', price:59, desc:'16oz', cat:'milktea', tags:['drink', 'cold']},

    // FRAPPE
    {name:'Cookies & Cream Frappe', emoji:'🥤', price:120, desc:'16oz', cat:'frappe', tags:['drink', 'cold', 'sweet']},
    {name:'White Mocha Frappe', emoji:'🥤', price:120, desc:'16oz', cat:'frappe', tags:['drink', 'cold', 'sweet']},
    {name:'Dark Mocha Frappe', emoji:'🥤', price:120, desc:'16oz', cat:'frappe', tags:['drink', 'cold', 'chocolate']},
    {name:'Choco Hazelnut Frappe', emoji:'🥤', price:120, desc:'16oz', cat:'frappe', tags:['drink', 'cold', 'chocolate']},
    {name:'Choco Strawberry Frappe', emoji:'🍓', price:120, desc:'16oz', cat:'frappe', tags:['drink', 'cold', 'chocolate', 'fruity']},
    {name:'Strawberry Frappe', emoji:'🍓', price:120, desc:'16oz', cat:'frappe', tags:['drink', 'cold', 'fruity']},
    {name:'Blueberry Frappe', emoji:'🫐', price:120, desc:'16oz', cat:'frappe', tags:['drink', 'cold', 'fruity']},
    {name:'Java Chips Frappe', emoji:'🍫', price:120, desc:'16oz', cat:'frappe', tags:['drink', 'cold', 'chocolate']},
    {name:'Matcha Frappe', emoji:'🍵', price:120, desc:'16oz', cat:'frappe', tags:['drink', 'cold']},

    // FRUIT TEA & SODA
    {name:'Strawberry Fruit Tea', emoji:'🍓', price:59, desc:'16oz', cat:'fruittea', tags:['drink', 'cold', 'fruity']},
    {name:'Blueberry Fruit Tea', emoji:'🫐', price:59, desc:'16oz', cat:'fruittea', tags:['drink', 'cold', 'fruity']},
    {name:'Kiwi Fruit Tea', emoji:'🥝', price:59, desc:'16oz', cat:'fruittea', tags:['drink', 'cold', 'fruity']},
    {name:'Passion Fruit Tea', emoji:'🍹', price:59, desc:'16oz', cat:'fruittea', tags:['drink', 'cold', 'fruity']},
    {name:'Lychee Fruit Tea', emoji:'🍒', price:59, desc:'16oz', cat:'fruittea', tags:['drink', 'cold', 'fruity']},
    {name:'Lemonade Fruit Tea', emoji:'🍋', price:59, desc:'16oz', cat:'fruittea', tags:['drink', 'cold', 'fruity']},
    
    {name:'Strawberry Soda', emoji:'🫧', price:59, desc:'16oz', cat:'soda', tags:['drink', 'cold', 'fruity']},
    {name:'Blueberry Soda', emoji:'🫧', price:59, desc:'16oz', cat:'soda', tags:['drink', 'cold', 'fruity']},
    {name:'Kiwi Soda', emoji:'🫧', price:59, desc:'16oz', cat:'soda', tags:['drink', 'cold', 'fruity']},
    {name:'Lemonade Soda', emoji:'🫧', price:59, desc:'16oz', cat:'soda', tags:['drink', 'cold', 'fruity']},
    {name:'Passion Soda', emoji:'🫧', price:59, desc:'16oz', cat:'soda', tags:['drink', 'cold', 'fruity']},
    {name:'Lychee Soda', emoji:'🫧', price:59, desc:'16oz', cat:'soda', tags:['drink', 'cold', 'fruity']},

    // CROFFLES
    {name:'Classic Waffle', emoji:'🧇', price:90, desc:'Croffle', cat:'croffle', tags:['food', 'classic']},
    {name:'Classic Choco', emoji:'🍫', price:110, desc:'Croffle', cat:'croffle', tags:['food', 'chocolate']},
    {name:'Choco Almond', emoji:'🥜', price:110, desc:'Croffle', cat:'croffle', tags:['food', 'chocolate']},
    {name:'Oreo Dream', emoji:'🍪', price:110, desc:'Croffle', cat:'croffle', tags:['food', 'chocolate']},
    {name:'Smores', emoji:'🏕️', price:110, desc:'Croffle', cat:'croffle', tags:['food', 'sweet']},
    {name:'Biscoff', emoji:'🍪', price:120, desc:'Croffle', cat:'croffle', tags:['food', 'sweet']},

    // SANDWICHES
    {name:'Tuna Sandwich', emoji:'🐟', price:80, desc:'Freshly made', cat:'sandwiches', tags:['food', 'classic']},
    {name:'Chicken Sandwich', emoji:'🥪', price:80, desc:'Freshly made', cat:'sandwiches', tags:['food', 'classic']},
    {name:'Ham & Cheese', emoji:'🧀', price:90, desc:'Freshly made', cat:'sandwiches', tags:['food', 'classic']},
    {name:'Ham & Egg', emoji:'🍳', price:90, desc:'Freshly made', cat:'sandwiches', tags:['food', 'classic']},
    {name:'Clubhouse', emoji:'🥪', price:160, desc:'Double decker', cat:'sandwiches', tags:['food', 'heavy']},

    // SNACKS
    {name:'Fries', emoji:'🍟', price:80, desc:'Solo', cat:'snacks', tags:['food', 'classic']},
    {name:'Flavored Fries', emoji:'🍟', price:90, desc:'Solo', cat:'snacks', tags:['food', 'classic']},
    {name:'Nachos', emoji:'🧀', price:90, desc:'Solo', cat:'snacks', tags:['food', 'classic']},
    {name:'Chicken Poppers', emoji:'🍗', price:150, desc:'Bite-sized', cat:'snacks', tags:['food', 'heavy']},
    {name:'Chix & Fries', emoji:'🍗', price:130, desc:'Combo', cat:'snacks', tags:['food', 'heavy']}
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
    ALL_ITEMS.forEach(item => {
      const grid = document.getElementById(item.cat + 'Grid');
      if (grid) {
        grid.appendChild(makeCard(item));
      }
    });
  }

  function addItem(name, emoji, price, desc) {
    const ex = cart.find(i => i.name === name);
    ex ? ex.qty++ : cart.push({name, emoji, price, desc, qty:1});
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
    
    if (typeof loadQuizStep === 'function') {
      loadQuizStep('start'); 
    }
    const allBtn = document.querySelector('.cat-pill[data-cat="all"]');
    if (allBtn) {
      filterCat(allBtn, 'all');
    }
    goTo('menuScreen'); 
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

  // ═════════════════════════════════════════
  // CONVERSATIONAL QUIZ ENGINE
  // ═════════════════════════════════════════
  
  const quizQuestionEl = document.getElementById('quiz-question');
  const quizOptionsEl = document.getElementById('quiz-options');
  const quizResetBtn = document.getElementById('quiz-reset');
  const resultsSection = document.getElementById('cravingResultsSection');
  const recommendationContainer = document.getElementById('recommendationContainer');
  const confirmationOverlay = document.getElementById('confirmation-overlay');
  let itemPendingConfirmation = null;

  function makeRecommendationCard(item) {
    const d = document.createElement('div');
    d.className = 'item-card';
    d.innerHTML = `
      <div class="item-emoji">${item.emoji}</div>
      <div class="item-name">${item.name}</div>
      <div class="item-desc">${item.desc}</div>
      <div class="item-price">₱${item.price}</div>
      <button class="add-btn">+</button>`;
      
    const fn = () => triggerConfirmation(item);
    d.querySelector('.add-btn').addEventListener('click', e => { e.stopPropagation(); fn(); });
    d.addEventListener('click', fn);
    return d;
  }

  function triggerConfirmation(item) {
    itemPendingConfirmation = item;
    document.getElementById('modal-emoji').textContent = item.emoji;
    document.getElementById('modal-title').textContent = item.name;
    document.getElementById('modal-desc').textContent = item.desc;
    document.getElementById('modal-price-value').textContent = '₱' + item.price;
    confirmationOverlay.classList.remove('hidden');
  }

  document.getElementById('btn-cancel-order').addEventListener('click', () => {
    confirmationOverlay.classList.add('hidden');
    itemPendingConfirmation = null;
  });

  document.getElementById('btn-confirm-order').addEventListener('click', () => {
    if (itemPendingConfirmation) {
      addItem(itemPendingConfirmation.name, itemPendingConfirmation.emoji, itemPendingConfirmation.price, itemPendingConfirmation.desc);
      confirmationOverlay.classList.add('hidden');
      itemPendingConfirmation = null;
    }
  });

  const quizFlow = {
    start: {
      question: "What's the vibe today?",
      answers: [
        { text: "☕ I need a drink", next: "drinkTemp" },
        { text: "🥐 I'm hungry", next: "foodType" }
      ]
    },
    drinkTemp: {
      question: "Are we cooling down or warming up?",
      answers: [
        { text: "🧊 Cold & Refreshing", filterTag: "cold" },
        { text: "🔥 Hot & Cozy", next: "drinkFlavor" } // Leads to another question
      ]
    },
    drinkFlavor: {
      question: "How do you like your hot coffee?",
      answers: [
        { text: "💪 Strong & Bold", filterTag: "strong" },
        { text: "🥛 Smooth & Milky", filterTag: "milky" },
        { text: "🍯 On the sweeter side", filterTag: "sweet" }
      ]
    },
    foodType: {
      question: "What kind of treat are you craving?",
      answers: [
        { text: "🍫 Rich & Chocolatey", filterTag: "chocolate" },
        { text: "🫐 Fruity & Fresh", filterTag: "fruity" },
        { text: "🥐 Classic & Buttery", filterTag: "classic" }
      ]
    }
  };

  // Function to render a specific step in the quiz
  function loadQuizStep(stepKey) {
    const step = quizFlow[stepKey];
    quizQuestionEl.textContent = step.question;
    quizOptionsEl.innerHTML = ''; // Clear old buttons
    
    // Show reset button if we aren't on the first step
    if (stepKey === 'start') {
      quizResetBtn.classList.add('hidden');
      resultsSection.classList.add('hidden'); // Hide results if restarting
    } else {
      quizResetBtn.classList.remove('hidden');
    }

    // Generate the new buttons
    step.answers.forEach(answer => {
      const btn = document.createElement('button');
      btn.className = 'craving-btn';
      btn.textContent = answer.text;
      
      btn.addEventListener('click', () => {
        if (answer.next) {
          // Go to the next question
          loadQuizStep(answer.next);
        } else if (answer.filterTag) {
          // End of the line: Show results
          showQuizResults(answer.filterTag);
        }
      });
      
      quizOptionsEl.appendChild(btn);
    });
  }

  // Function to show the final recommended items
  function showQuizResults(finalTag) {
    quizQuestionEl.textContent = "Here is what we recommend!";
    quizOptionsEl.innerHTML = ''; // Hide buttons
    quizResetBtn.classList.remove('hidden'); // Let them start over

    // 1. Find all items that match the tag
    const allMatches = ALL_ITEMS.filter(item => item.tags.includes(finalTag));
    
    // 2. Limit the results to a maximum of 3 items to keep the UI clean
    const topRecommendations = allMatches.slice(0, 3);
    
    // Render Results
    recommendationContainer.innerHTML = '';
    topRecommendations.forEach(item => {
      recommendationContainer.appendChild(makeRecommendationCard(item)); // Re-uses modal logic
    });
    
    // 3. Reveal the section ONLY when results are ready
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Allow user to reset the quiz
  quizResetBtn.addEventListener('click', () => {
    loadQuizStep('start');
  });

  // Initialize the quiz when the app loads
  loadQuizStep('start');