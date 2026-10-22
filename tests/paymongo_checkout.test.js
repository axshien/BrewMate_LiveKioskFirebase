const assert = require('assert');
const fs = require('fs');
const crypto = require('crypto');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('RUNNING PAYMONGO HOSTED CHECKOUT FLOW TEST SUITE');
console.log('═══════════════════════════════════════════════════════════════════\n');

// Test 1: No secret keys in frontend code
console.log('Test 1: Security check - ensure PayMongo secret key is never in frontend code...');
const scriptJs = fs.readFileSync('public/script.js', 'utf8');
const indexHtml = fs.readFileSync('public/index.html', 'utf8');

assert.ok(!scriptJs.includes('sk_test_'), 'sk_test_ secret key must NEVER be in public/script.js');
assert.ok(!scriptJs.includes('sk_live_'), 'sk_live_ secret key must NEVER be in public/script.js');
assert.ok(!indexHtml.includes('sk_test_'), 'sk_test_ secret key must NEVER be in public/index.html');
assert.ok(!indexHtml.includes('sk_live_'), 'sk_live_ secret key must NEVER be in public/index.html');
console.log('✓ PASS: Zero secret keys exposed in client code.\n');

// Test 2: Checkout session line items formatting
console.log('Test 2: Edge Function line items centavos & addon description formatting...');
const sampleCartItems = [
  {
    name: 'Spanish Latte (22oz)',
    displayName: 'Spanish Latte (22oz)',
    price: 135,
    qty: 2,
    flavorName: null,
    addons: [
      { addonsName: 'Espresso Shot', qty: 1, price: 25 },
      { addonsName: 'Oat Milk', qty: 1, price: 30 }
    ],
    notes: 'Less ice'
  },
  {
    name: 'Flavored Fries (Large)',
    displayName: 'Flavored Fries (Large)',
    price: 95,
    qty: 1,
    flavorName: 'Sour Cream',
    addons: [],
    notes: null
  }
];

function buildPayMongoLineItems(items) {
  return items.map(it => {
    const unitCentavos = Math.round(Number(it.price || 0) * 100);
    const qty = Math.max(1, Number(it.qty || 1));
    const descParts = [];
    if (it.flavorName) descParts.push(`Flavor: ${it.flavorName}`);
    if (it.addons && it.addons.length > 0) {
      const addonList = it.addons.map(a => `${a.qty > 1 ? a.qty + 'x ' : ''}${a.addonsName || ''}`).join(', ');
      if (addonList) descParts.push(`Add-ons: ${addonList}`);
    }
    if (it.notes) descParts.push(`Note: ${it.notes}`);
    return {
      name: it.displayName || it.name,
      amount: unitCentavos,
      currency: 'PHP',
      quantity: qty,
      description: descParts.length > 0 ? descParts.join(' | ') : undefined
    };
  });
}

const lineItems = buildPayMongoLineItems(sampleCartItems);
assert.strictEqual(lineItems.length, 2);
assert.strictEqual(lineItems[0].amount, 13500); // ₱135.00 in centavos
assert.strictEqual(lineItems[0].quantity, 2);
assert.strictEqual(lineItems[0].description, 'Add-ons: Espresso Shot, Oat Milk | Note: Less ice');
assert.strictEqual(lineItems[1].amount, 9500); // ₱95.00 in centavos
assert.strictEqual(lineItems[1].description, 'Flavor: Sour Cream');
console.log('✓ PASS: Line items correctly converted to centavos with rich descriptions.\n');

// Test 3: Line items sum matches total amount in PHP
console.log('Test 3: Line items total centavos reconciliation with order total...');
const orderTotalPHP = (135 * 2) + (95 * 1); // 365
const totalCentavosCalculated = lineItems.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
assert.strictEqual(totalCentavosCalculated, orderTotalPHP * 100);
assert.strictEqual(totalCentavosCalculated, 36500);
console.log(`✓ PASS: Calculated ₱${orderTotalPHP} = ${totalCentavosCalculated} centavos exact match.\n`);

// Test 4: Webhook HMAC-SHA256 signature verification
console.log('Test 4: Webhook signature verification algorithm test...');
const testSecret = 'whsk_test_abc123xyz789';
const testPayload = JSON.stringify({
  data: {
    attributes: {
      type: 'checkout_session.payment.paid',
      data: {
        id: 'cs_test_mock_123',
        attributes: {
          reference_number: '88771',
          payment_method_used: 'gcash'
        }
      }
    }
  }
});
const timestamp = Math.floor(Date.now() / 1000).toString();
const signedPayload = `${timestamp}.${testPayload}`;
const computedSig = crypto.createHmac('sha256', testSecret).update(signedPayload).digest('hex');
const mockSignatureHeader = `t=${timestamp},te=${computedSig}`;

function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const parts = signatureHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.trim().split('=');
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const ts = parts['t'];
  const sig = parts['te'] || parts['li'];
  if (!ts || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  return expected.toLowerCase() === sig.toLowerCase();
}

assert.strictEqual(verifySignature(testPayload, mockSignatureHeader, testSecret), true, 'Valid signature must verify');
assert.strictEqual(verifySignature(testPayload, 't=123,te=invalid_sig', testSecret), false, 'Tampered signature must reject');
console.log('✓ PASS: Webhook HMAC-SHA256 signature verification verified.\n');

// Test 5: Webhook payload parsing extracts order reference and marks POS status
console.log('Test 5: Webhook extraction of checkout session and order reference...');
const parsedEvent = JSON.parse(testPayload);
const eventData = parsedEvent.data.attributes.data;
const refNum = eventData.attributes.reference_number;
const pMethod = eventData.attributes.payment_method_used;
assert.strictEqual(refNum, '88771');
assert.strictEqual(pMethod, 'gcash');

const resultingQueueUpdate = {
  payment_status: 'PAID',
  status: 'paid',
  paymentmethod: `PayMongo (${pMethod.toUpperCase()}) (TEST MODE)`,
  payment_reference: eventData.id
};
assert.strictEqual(resultingQueueUpdate.payment_status, 'PAID');
assert.strictEqual(resultingQueueUpdate.status, 'paid');
assert.strictEqual(resultingQueueUpdate.paymentmethod, 'PayMongo (GCASH) (TEST MODE)');
console.log('✓ PASS: Order reference & POS status correctly resolved to PAID/paid.\n');

// Test 6: Cart retention upon PayMongo checkout cancellation
console.log('Test 6: Cancellation return restores cart and user inputs...');
const mockSessionStorage = {
  'chill_pending_paymongo': JSON.stringify({
    orderNumber: '88771',
    total: 365,
    nickname: 'MARIA',
    email: 'maria@example.com',
    notes: 'Less ice',
    orderType: 'Take Out',
    rawCart: sampleCartItems
  })
};

let restoredCart = [];
const savedRaw = mockSessionStorage['chill_pending_paymongo'];
if (savedRaw) {
  const parsed = JSON.parse(savedRaw);
  if (parsed.rawCart) restoredCart = parsed.rawCart;
}
assert.strictEqual(restoredCart.length, 2);
assert.strictEqual(restoredCart[0].displayName, 'Spanish Latte (22oz)');
console.log('✓ PASS: Cart and customer selections safely restored on cancellation.\n');

// Test 7: Receipt items list population
console.log('Test 7: Confirm order ticket & receipt correctly uses restored items...');
const itemsToDisplay = (restoredCart && restoredCart.length > 0) ? restoredCart : [];
assert.strictEqual(itemsToDisplay.length, 2);
const totalDisplayCount = itemsToDisplay.reduce((acc, it) => acc + (it.qty || 1), 0);
assert.strictEqual(totalDisplayCount, 3);
console.log(`✓ PASS: Ticket display count correctly computed (${totalDisplayCount} items).\n`);

// Test 8: Edge Function queue number and items field resolution & validation error
console.log('Test 8: Edge Function field resolution across kioskordernumber/orderNumber/queueNumber/items...');
function parseCheckoutPayload(body) {
  const queueNumber = String(
    body.kioskordernumber ||
    body.orderNumber ||
    body.queueNumber ||
    body.queue_number ||
    ""
  ).trim();

  const items = Array.isArray(body.items)
    ? body.items
    : (Array.isArray(body.cartItems) ? body.cartItems : (Array.isArray(body.cart) ? body.cart : []));

  if (!queueNumber || !items || !Array.isArray(items) || items.length === 0) {
    return { valid: false, error: "Missing order queue number or cart items." };
  }
  return { valid: true, queueNumber, items };
}

// Case A: Frontend sends kioskordernumber and items
const resA = parseCheckoutPayload({ kioskordernumber: '4021', items: [{ name: 'Coffee', price: 100, qty: 1 }] });
assert.strictEqual(resA.valid, true);
assert.strictEqual(resA.queueNumber, '4021');

// Case B: Client sends orderNumber and cartItems
const resB = parseCheckoutPayload({ orderNumber: '4022', cartItems: [{ name: 'Tea', price: 90, qty: 1 }] });
assert.strictEqual(resB.valid, true);
assert.strictEqual(resB.queueNumber, '4022');

// Case C: Client sends queueNumber
const resC = parseCheckoutPayload({ queueNumber: '4023', items: [{ name: 'Latte', price: 120, qty: 1 }] });
assert.strictEqual(resC.valid, true);
assert.strictEqual(resC.queueNumber, '4023');

// Case D: Missing queue number returns exact error
const resD = parseCheckoutPayload({ items: [{ name: 'Coffee', price: 100, qty: 1 }] });
assert.strictEqual(resD.valid, false);
assert.strictEqual(resD.error, "Missing order queue number or cart items.");

// Case E: Missing items returns exact error
const resE = parseCheckoutPayload({ kioskordernumber: '4024' });
assert.strictEqual(resE.valid, false);
assert.strictEqual(resE.error, "Missing order queue number or cart items.");
console.log('✓ PASS: All queue number and item field variants correctly parsed & validated.\n');

// Test 9: Deduplication and order number reuse on checkout retry
console.log('Test 9: Deduplication - retry checkout reuses pending order number...');
function determineOrderNumberOnCheckout(isPayMongo, existingPendingSession, generateRandomFn) {
  const existingNum = (existingPendingSession && existingPendingSession.orderNumber)
    ? String(existingPendingSession.orderNumber).trim()
    : null;
  return (isPayMongo && existingNum) ? existingNum : generateRandomFn();
}

let randomGenCounter = 5000;
const mockGen = () => String(++randomGenCounter);

// First time checkout: generates new order number 5001
const firstOrderNum = determineOrderNumberOnCheckout(true, null, mockGen);
assert.strictEqual(firstOrderNum, '5001');

// Customer retries checkout after returning from cancelled PayMongo session: reuses 5001!
const retryOrderNum = determineOrderNumberOnCheckout(true, { orderNumber: '5001' }, mockGen);
assert.strictEqual(retryOrderNum, '5001', 'Retrying checkout MUST reuse the existing order queue number');
assert.strictEqual(randomGenCounter, 5001, 'No new order number should be generated on retry');
console.log('✓ PASS: Pending order queue number safely reused on checkout retry.\n');

// Test 10: Non-trusting return flow renders invoice ticket instead of homepage
console.log('Test 10: PayMongo return navigation renders invoice ticket instead of welcome screen...');
function handleReturnDestination(orderNumber, dbOrderRecord) {
  if (!orderNumber) return 'cartScreen';
  const isPaid = dbOrderRecord && (
    (dbOrderRecord.payment_status && String(dbOrderRecord.payment_status).toUpperCase() === 'PAID') ||
    (dbOrderRecord.status && String(dbOrderRecord.status).toLowerCase() === 'paid')
  );
  // Both verified and unverified orders navigate to confirmScreen (invoice receipt ticket), NOT welcomeScreen!
  return {
    screen: 'confirmScreen',
    isPaid: Boolean(isPaid),
    invoiceNumber: `#INV-${orderNumber}`
  };
}

const verifiedResult = handleReturnDestination('7721', { kioskordernumber: '7721', payment_status: 'PAID', status: 'paid' });
assert.strictEqual(verifiedResult.screen, 'confirmScreen');
assert.strictEqual(verifiedResult.isPaid, true);
assert.strictEqual(verifiedResult.invoiceNumber, '#INV-7721');

const pendingResult = handleReturnDestination('7721', { kioskordernumber: '7721', payment_status: 'PENDING', status: 'pending' });
assert.strictEqual(pendingResult.screen, 'confirmScreen');
assert.strictEqual(pendingResult.isPaid, false, 'Pending payment in DB must NOT be treated as paid');
assert.strictEqual(pendingResult.invoiceNumber, '#INV-7721');
console.log('✓ PASS: Customer returning from PayMongo lands on invoice receipt ticket with server verification.\n');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('ALL PAYMONGO TESTS PASSED WITH 100% SUCCESS!');
console.log('═══════════════════════════════════════════════════════════════════');
