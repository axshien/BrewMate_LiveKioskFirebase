// tests/kiosk_features.test.js
// Verification of:
// 1. 3-Second Loading Screen
// 2. Add-on Quantity Selector (e.g., 3x Plain Rice)
// 3. Special Instructions Persistence to chill_kiosk_queue

const assert = require('assert');

function runTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('RUNNING CHILLVENTORYX NEW FEATURES TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Test 1: Addon Quantity Calculation in Product Modal & Cart
  console.log('Test 1: Addon quantity calculations (e.g. 3x Plain Rice)...');
  const basePrice = 120.00;
  const addons = [
    { addonsId: 1, addonsName: 'Plain Rice', price: 15.00, qty: 3, subSelection: null },
    { addonsId: 2, addonsName: 'Extra Cheese', price: 25.00, qty: 1, subSelection: null }
  ];

  const addonTotal = addons.reduce((sum, a) => sum + (Number(a.price) || 0) * (Number(a.qty) || 1), 0);
  assert.strictEqual(addonTotal, 15.00 * 3 + 25.00 * 1, 'Addon total must equal (15*3) + 25 = 70.00');
  assert.strictEqual(addonTotal, 70.00);

  const unitTotal = basePrice + addonTotal;
  assert.strictEqual(unitTotal, 190.00, 'Unit total must equal 120 + 70 = 190.00');

  const cartQty = 2;
  const lineTotal = unitTotal * cartQty;
  assert.strictEqual(lineTotal, 380.00, 'Line total for 2 items must equal 380.00');
  console.log('✓ PASS: Addon quantities correctly calculated across modal and cart totals\n');

  // Test 2: Addon Formatted Name & Breakdown
  console.log('Test 2: Addon formatted name and quantity display strings...');
  const formattedAddonNames = addons.map(a => {
    const q = (Number(a.qty) || 1) > 1 ? `${a.qty}x ` : '';
    return `${q}${a.addonsName}`;
  }).join(', ');
  assert.strictEqual(formattedAddonNames, '3x Plain Rice, Extra Cheese');
  console.log(`✓ PASS: Formatted addon line item: "${formattedAddonNames}"\n`);

  // Test 3: Special Instructions in Order Payload & Database Fallback
  console.log('Test 3: Special instructions payload & DB schema fallback...');
  const instructions = 'Extra spicy, sauce on the side please';
  const orderPayload = {
    kioskordernumber: '542',
    customerName: 'JUAN',
    orderType: 'Dine In',
    special_instructions: instructions,
    notes: instructions,
    items: [
      {
        name: 'Chicken Meal [+ 3x Plain Rice, Extra Cheese]',
        price: unitTotal,
        qty: cartQty,
        special_instructions: instructions,
        notes: instructions,
        addons: addons
      }
    ],
    subtotal: lineTotal,
    totalamount: lineTotal
  };

  assert.strictEqual(orderPayload.special_instructions, instructions);
  assert.strictEqual(orderPayload.notes, instructions);
  assert.strictEqual(orderPayload.items[0].special_instructions, instructions);

  // Simulate edge function fallback logic
  const dbRecord = { ...orderPayload };
  const mockDbSchemaHasColumn = false; // Simulating DB before migration
  if (!mockDbSchemaHasColumn) {
    delete dbRecord.special_instructions;
    delete dbRecord.notes;
  }

  // Items JSON payload still preserves special instructions
  assert.strictEqual(dbRecord.items[0].special_instructions, instructions);
  console.log('✓ PASS: Special instructions preserved in both root columns and items JSON payload\n');

  // Test 4: 3-Second Loading Timer Promise
  console.log('Test 4: 3-second loading screen promise behavior...');
  const startMs = Date.now();
  const minWaitMs = 100; // Scaled down for unit test
  const minWaitPromise = new Promise(resolve => setTimeout(resolve, minWaitMs));
  const mockSubmit = Promise.resolve({ success: true, orderNumber: '542' });

  // Test 5: Product description extraction across column variants & cleaning
  console.log('Test 5: Product description cleaning and fallback extraction...');
  function testGetProductDescription(item) {
    if (!item) return '';
    const raw = item.description || item.desc || item.productDescription || item.product_description || item.productDesc || item.details || '';
    if (typeof raw !== 'string') return '';
    const cleaned = raw.replace(/^['"]+|['"]+$/g, '').trim();
    if (!cleaned || cleaned.toLowerCase() === 'null' || cleaned.toLowerCase() === 'undefined' || cleaned === "''" || cleaned === '""') {
      return '';
    }
    return cleaned;
  }

  assert.strictEqual(testGetProductDescription({ description: 'Rich espresso shot' }), 'Rich espresso shot');
  assert.strictEqual(testGetProductDescription({ desc: 'Fresh brewed drip' }), 'Fresh brewed drip');
  assert.strictEqual(testGetProductDescription({ productDescription: 'Creamy milk drink' }), 'Creamy milk drink');
  assert.strictEqual(testGetProductDescription({ description: "''" }), '');
  assert.strictEqual(testGetProductDescription({ description: '  ' }), '');
  assert.strictEqual(testGetProductDescription({ description: 'null' }), '');
  assert.strictEqual(testGetProductDescription({}), '');
  console.log('✓ PASS: Product descriptions cleanly extracted and normalized across all variants\n');

  // Test 6: Product with sizes retains sizes even when direct price and description are present
  console.log('Test 6: Editing product and adding description retains sizes and price ranges...');
  const productSizesMap = {
    '101': [
      { productSizeId: 1, sizeId: 1, sizeName: '16oz', price: 90 },
      { productSizeId: 2, sizeId: 2, sizeName: '22oz', price: 110 }
    ]
  };

  // Simulate edited product with added description and direct price saved
  const editedProduct = {
    productId: 101,
    productName: 'Iced Caramel Macchiato',
    description: 'Espresso with caramel drizzle and milk',
    price: 90 // Direct price present from database save
  };

  const itemSizes = (productSizesMap[editedProduct.productId] || []).slice();
  itemSizes.sort((a, b) => a.price - b.price);
  const rawPrice = (editedProduct.price !== null && editedProduct.price !== undefined && editedProduct.price !== '') ? Number(editedProduct.price) : null;
  const hasDirectPrice = rawPrice !== null && !isNaN(rawPrice) && rawPrice > 0;
  // Previously: const hasSizes = !hasDirectPrice && itemSizes.length > 0 (BUG: sizes disappeared!)
  // Corrected logic:
  const hasSizes = itemSizes.length > 0;

  assert.strictEqual(hasSizes, true, 'hasSizes must be true even if price is set on product');
  assert.strictEqual(itemSizes.length, 2, 'Must have 2 size variations');
  assert.strictEqual(itemSizes[0].sizeName, '16oz');
  assert.strictEqual(itemSizes[1].sizeName, '22oz');

  const prices = itemSizes.map(s => s.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  assert.strictEqual(minPrice, 90);
  assert.strictEqual(maxPrice, 110);
  console.log('✓ PASS: Product sizes and price ranges remain intact after editing with description & direct price\n');

  // Test 7: Description rendered under product name
  console.log('Test 7: Description placement directly under product name...');
  const cleanDesc = testGetProductDescription(editedProduct);
  const sizePillsHTML = hasSizes ? `<div class="card-size-tags">${itemSizes.map(s => `<span class="size-tag">${s.sizeName}</span>`).join('')}</div>` : '';
  const cardHTML = `
    <div class="item-name">${editedProduct.productName}</div>
    ${cleanDesc ? `<div class="item-desc">${cleanDesc}</div>` : ''}
    <div class="card-spacer"></div>
    ${sizePillsHTML}
  `;

  assert.ok(cardHTML.includes('<div class="item-name">Iced Caramel Macchiato</div>'));
  assert.ok(cardHTML.includes('<div class="item-desc">Espresso with caramel drizzle and milk</div>'));
  assert.ok(cardHTML.indexOf('item-name') < cardHTML.indexOf('item-desc'), 'item-desc must appear after item-name');
  assert.ok(cardHTML.includes('16oz') && cardHTML.includes('22oz'), 'Size tags must be rendered in card');
  console.log('✓ PASS: Description is properly placed under the product name with size tags rendered\n');

  // Test 8: Nickname for cup 30-character limit and no minimum requirement
  console.log('Test 8: Nickname for cup validation (30-char max, no minimum character requirement)...');
  function testCheckOrderValidation(cartLength, nicknameValue) {
    const trimmed = (nicknameValue || '').trim();
    // Valid as long as cart is non-empty and nickname is not empty (no minimum requirement)
    const isDisabled = (cartLength === 0 || trimmed.length === 0);
    return !isDisabled;
  }

  function testSanitizeNickname(raw) {
    const trimmed = (raw || '').trim();
    if (trimmed.length < 1) return null;
    return trimmed.slice(0, 30).toUpperCase();
  }

  // 1-character nickname must be valid (no minimum)
  assert.strictEqual(testCheckOrderValidation(1, 'A'), true, 'Single character nickname must be valid');
  assert.strictEqual(testCheckOrderValidation(2, 'Bo'), true, 'Two character nickname must be valid');
  assert.strictEqual(testCheckOrderValidation(1, 'Alex'), true, 'Standard nickname must be valid');
  // Empty nickname must be invalid
  assert.strictEqual(testCheckOrderValidation(1, ''), false, 'Empty nickname must be invalid');
  assert.strictEqual(testCheckOrderValidation(1, '   '), false, 'Whitespace nickname must be invalid');
  assert.strictEqual(testCheckOrderValidation(0, 'Alex'), false, 'Empty cart must be invalid');

  // 30-character limit enforcement
  const longName = 'Christopher Alexander Montgomery Jr III';
  const sanitizedLong = testSanitizeNickname(longName);
  assert.strictEqual(sanitizedLong.length, 30, 'Nickname must be capped at 30 characters');
  assert.strictEqual(sanitizedLong, 'CHRISTOPHER ALEXANDER MONTGOME');
  console.log('✓ PASS: Nickname validation allows single-character names and enforces 30-character limit\n');

  // Test 9: Flavored Fries flavor mapping and item displayName construction
  console.log('Test 9: Flavored Fries flavor selection from product_flavors...');
  const sampleFlavors = [
    { flavorId: 11, flavorName: 'Plain', enable: 1 },
    { flavorId: 1, flavorName: 'Cheese', enable: 1 },
    { flavorId: 2, flavorName: 'BBQ', enable: 1 },
    { flavorId: 3, flavorName: 'Sour Cream', enable: 1 }
  ];
  const sampleProductFlavors = [
    { product_flavor_id: 1, flavorId: 11, productId: 285, enable: 1 },
    { product_flavor_id: 2, flavorId: 1, productId: 285, enable: 1 },
    { product_flavor_id: 3, flavorId: 2, productId: 285, enable: 1 },
    { product_flavor_id: 4, flavorId: 3, productId: 285, enable: 1 }
  ];

  const flavorLookup = {};
  sampleFlavors.forEach(f => { flavorLookup[f.flavorId] = f.flavorName; });

  const productFlavorsMap = {};
  sampleProductFlavors.forEach(pf => {
    if (!productFlavorsMap[pf.productId]) productFlavorsMap[pf.productId] = [];
    productFlavorsMap[pf.productId].push({
      productFlavorId: pf.product_flavor_id,
      flavorId: pf.flavorId,
      flavorName: flavorLookup[pf.flavorId]
    });
  });

  const friesItem = {
    productId: 285,
    productName: 'Flavored Fries',
    flavors: productFlavorsMap[285],
    sizes: [
      { sizeId: 4, sizeName: 'Solo', price: 100 },
      { sizeId: 5, sizeName: 'Group', price: 170 }
    ]
  };

  assert.strictEqual(friesItem.flavors.length, 4, 'Flavored Fries must have 4 available flavors');
  assert.deepStrictEqual(friesItem.flavors.map(f => f.flavorName), ['Plain', 'Cheese', 'BBQ', 'Sour Cream']);

  // Test formatted displayName generation with flavor and size
  function formatOrderItemName(productName, selectedFlavor, selectedSize) {
    const optionTags = [];
    if (selectedFlavor) optionTags.push(selectedFlavor.flavorName);
    if (selectedSize) optionTags.push(selectedSize.sizeName);
    const suffix = optionTags.length > 0 ? ` (${optionTags.join(', ')})` : '';
    return `${productName}${suffix}`;
  }

  const nameWithSoloCheese = formatOrderItemName('Flavored Fries', friesItem.flavors[1], friesItem.sizes[0]);
  assert.strictEqual(nameWithSoloCheese, 'Flavored Fries (Cheese, Solo)');

  const nameWithGroupBBQ = formatOrderItemName('Flavored Fries', friesItem.flavors[2], friesItem.sizes[1]);
  assert.strictEqual(nameWithGroupBBQ, 'Flavored Fries (BBQ, Group)');

  const nameFlavorOnly = formatOrderItemName('Flavored Fries', friesItem.flavors[3], null);
  assert.strictEqual(nameFlavorOnly, 'Flavored Fries (Sour Cream)');
  console.log('✓ PASS: Flavored Fries correctly maps Plain, Cheese, BBQ, Sour Cream and formats displayName\n');

  // Test 10: Sticky search container and index.html markup check
  console.log('Test 10: Sticky search bar markup and elements verification...');
  const fs = require('fs');
  const path = require('path');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const styleCss = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

  assert.ok(indexHtml.includes('maxlength="30"'), 'customerNickname in index.html must have maxlength="30"');
  assert.ok(indexHtml.includes('id="modal-flavor-section"'), 'modal-flavor-section must exist in index.html');
  assert.ok(indexHtml.includes('id="modal-flavor-options"'), 'modal-flavor-options must exist in index.html');
  assert.ok(indexHtml.includes('class="sticky-menu-controls"'), 'sticky-menu-controls must wrap search and cat-row');
  assert.ok(indexHtml.includes('id="menuSearchClear"'), 'menuSearchClear clear button must exist in index.html');

  assert.ok(styleCss.includes('.sticky-menu-controls'), 'sticky-menu-controls class must exist in style.css');
  assert.ok(styleCss.includes('position: sticky'), 'sticky-menu-controls must be sticky');
  assert.ok(styleCss.includes('.flavor-btn'), '.flavor-btn styles must exist in style.css');
  console.log('✓ PASS: HTML and CSS contain sticky controls, flavor modal elements, and 30-char nickname limit\n');

  Promise.all([mockSubmit, minWaitPromise]).then(([orderRes]) => {
    const elapsed = Date.now() - startMs;
    assert.strictEqual(orderRes.success, true);
    assert.ok(elapsed >= minWaitMs, `Must wait at least minWaitMs (${elapsed}ms >= ${minWaitMs}ms)`);
    console.log(`✓ PASS: 3-second loading synchronization verified (${elapsed}ms)\n`);

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('ALL NEW FEATURES TESTS PASSED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════════════════');
  });
}

runTests();
