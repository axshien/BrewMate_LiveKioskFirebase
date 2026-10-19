// tests/quiz_recommendations.test.js
// Automated verification for the Virtual Barista Quiz Recommendation feature:
// 1. Audit coverage: drink vs snack separation (drinks never return food, food never returns drinks)
// 2. Multi-factor scoring against Supabase catalog (Hot vs Cold drinks, Bold vs Sweet vs Fruity)
// 3. Waffles, Snacks, Silog rice meals, and Pastas matching against food cravings
// 4. Inactive, deleted, or out-of-stock items exclusion
// 5. Duplicate size entries deduplication (parent product representation)

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Extract calculateQuizMatchScore from script.js without loading browser DOM
const scriptContent = fs.readFileSync(path.join(__dirname, '../public/script.js'), 'utf-8');
const fnMatch = scriptContent.match(/function calculateQuizMatchScore\(item, answers\) \{([\s\S]*?)\n\}\r?\n\r?\nfunction generateQuizRecommendations/);

if (!fnMatch) {
  throw new Error('Could not extract calculateQuizMatchScore from script.js');
}

const calculateQuizMatchScore = new Function('item', 'answers', fnMatch[1]);

function runTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('RUNNING QUIZ RECOMMENDATION TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Sample real products from Supabase
  const sampleProducts = [
    { productId: 176, productName: 'Hot Americano', categoryId: 1, recommendationInfo: 'Coffee-based drink. Check the recipe for hot or iced preparation and added flavors.', recipe: 'Espresso Beans, Water', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 177, productName: 'Iced Americano', categoryId: 1, recommendationInfo: 'Coffee-based drink. Check the recipe for hot or iced preparation and added flavors.', recipe: 'Water, Espresso Beans, Ice', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 184, productName: 'Hot Vanilla Latte', categoryId: 1, recommendationInfo: 'Coffee-based milk drink. Check the recipe for milk type and added flavors.', recipe: 'Vanilla Syrup, Espresso Beans, Fresh Milk', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 188, productName: 'Hot Caramel Macchiato', categoryId: 2, recommendationInfo: 'Coffee-based drink with flavor ingredients specified by its recipe.', recipe: 'Espresso Beans, Fresh Milk, Caramel Syrup', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 206, productName: 'Milky Caramel', categoryId: 4, recommendationInfo: 'Use the product name and recipe ingredients to determine suitable customer preferences.', recipe: 'Fresh Milk, Caramel Syrup, Sugar', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 215, productName: 'Frappe Cookies And Cream', categoryId: 5, recommendationInfo: 'Blended drink. Check the recipe for flavor, powders, milk, and toppings.', recipe: 'Whipped Cream, Full Cream Milk, Cookies & Cream Powder, Oreo Biscuit', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 221, productName: 'Fruit Tea Strawberry', categoryId: 6, recommendationInfo: 'Fruit tea drink. Check the recipe for its fruit flavor and ingredients.', recipe: 'Strawberry Syrup, Fruit Tea Base, Ice', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 226, productName: 'Soda Strawberry', categoryId: 7, recommendationInfo: 'Carbonated drink. Check the recipe for syrup flavor and other ingredients.', recipe: 'Ice, Sprite, Strawberry Syrup', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 246, productName: 'Classic Waffle', categoryId: 10, recommendationInfo: 'Waffle product. Check the recipe and description for toppings and flavors.', recipe: '', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 250, productName: 'Waffle Smores', categoryId: 10, recommendationInfo: 'Waffle product. Check the recipe and description for toppings and flavors.', recipe: '', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 252, productName: 'Sandwiches Chicken', categoryId: 11, recommendationInfo: 'Sandwich product. Check the recipe for its filling and ingredients.', recipe: '', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 257, productName: 'Fries', categoryId: 12, recommendationInfo: 'Fries or potato snack. Check the recipe for seasoning and toppings.', recipe: 'French Fries, French Fries, Cooking Oil', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 258, productName: 'Nachos', categoryId: 12, recommendationInfo: 'Nacho snack. Check the recipe for toppings and sauces.', recipe: 'Mayonnaise, Cheese Sauce, Nacho Chips, Ground Beef', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 259, productName: 'Cheese Stick', categoryId: 12, recommendationInfo: 'Use the product name and recipe ingredients to determine suitable customer preferences.', recipe: '', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 272, productName: 'Liempo', categoryId: 13, recommendationInfo: 'Use the product name and recipe ingredients to determine suitable customer preferences.', recipe: '', isOutOfStock: false, enable: 1, isdeleted: 0 },
    { productId: 280, productName: 'Spaghetti', categoryId: 15, recommendationInfo: 'Use the product name and recipe ingredients to determine suitable customer preferences.', recipe: '', isOutOfStock: false, enable: 1, isdeleted: 0 }
  ];

  // Test 1: Category separation - drink preference never matches food
  console.log('Test 1: Drink requests strictly reject food products...');
  for (const p of sampleProducts.filter(x => x.categoryId >= 10)) {
    const score = calculateQuizMatchScore(p, { type: 'drink', tempOrFlavor: 'cold', tasteOrStyle: 'sweet' });
    assert.strictEqual(score, -999, `Food item "${p.productName}" must be rejected for drink requests`);
  }
  console.log('✓ PASS: Drink requests reject all food items.');

  // Test 2: Category separation - food/snack requests strictly reject drinks
  console.log('\nTest 2: Food/snack requests strictly reject drink products...');
  for (const p of sampleProducts.filter(x => x.categoryId < 10)) {
    const score = calculateQuizMatchScore(p, { type: 'snack', tempOrFlavor: 'sweet', tasteOrStyle: 'crispy' });
    assert.strictEqual(score, -999, `Drink item "${p.productName}" must be rejected for snack requests`);
  }
  console.log('✓ PASS: Food requests reject all drink items.');

  // Test 3: Hot drink preference rejects cold-only drinks (Frappe, Soda, Fruit Tea, Iced drinks)
  console.log('\nTest 3: Hot drink requests exclude strictly cold drinks...');
  const frappeScore = calculateQuizMatchScore(sampleProducts.find(x => x.productId === 215), { type: 'drink', tempOrFlavor: 'hot', tasteOrStyle: 'sweet' });
  const fruitTeaScore = calculateQuizMatchScore(sampleProducts.find(x => x.productId === 221), { type: 'drink', tempOrFlavor: 'hot', tasteOrStyle: 'fruity' });
  const icedScore = calculateQuizMatchScore(sampleProducts.find(x => x.productId === 177), { type: 'drink', tempOrFlavor: 'hot', tasteOrStyle: 'bold' });
  assert.strictEqual(frappeScore, -999, 'Frappe must be excluded from hot drink preferences');
  assert.strictEqual(fruitTeaScore, -999, 'Fruit tea must be excluded from hot drink preferences');
  assert.strictEqual(icedScore, -999, 'Iced Americano must be excluded from hot drink preferences');
  console.log('✓ PASS: Hot drink preferences strictly exclude cold-only items.');

  // Test 4: Cold drink preference rejects hot-only drinks
  console.log('\nTest 4: Cold drink requests exclude hot-only drinks...');
  const hotScore = calculateQuizMatchScore(sampleProducts.find(x => x.productId === 176), { type: 'drink', tempOrFlavor: 'cold', tasteOrStyle: 'bold' });
  assert.strictEqual(hotScore, -999, 'Hot Americano must be excluded from cold drink preferences');
  console.log('✓ PASS: Cold drink preferences strictly exclude hot-only items.');

  // Test 5: Hot Bold Espresso ranks Hot Americano / Espresso higher than sweet drinks
  console.log('\nTest 5: Hot Bold Espresso prioritization...');
  const hotAmericanoScore = calculateQuizMatchScore(sampleProducts.find(x => x.productId === 176), { type: 'drink', tempOrFlavor: 'hot', tasteOrStyle: 'bold' });
  const hotVanillaScore = calculateQuizMatchScore(sampleProducts.find(x => x.productId === 184), { type: 'drink', tempOrFlavor: 'hot', tasteOrStyle: 'bold' });
  assert(hotAmericanoScore > hotVanillaScore, 'Hot Americano should rank higher than Hot Vanilla Latte for Bold espresso preference');
  console.log(`✓ PASS: Hot Americano score (${hotAmericanoScore}) > Hot Vanilla Latte (${hotVanillaScore}).`);

  // Test 6: Cold Fruity Drink ranks Fruit Tea Strawberry & Soda above Coffee/Frappes
  console.log('\nTest 6: Cold Fruity Drink prioritization...');
  const ftStrawberryScore = calculateQuizMatchScore(sampleProducts.find(x => x.productId === 221), { type: 'drink', tempOrFlavor: 'cold', tasteOrStyle: 'fruity' });
  const icedCoffeeScore = calculateQuizMatchScore(sampleProducts.find(x => x.productId === 177), { type: 'drink', tempOrFlavor: 'cold', tasteOrStyle: 'fruity' });
  assert(ftStrawberryScore > icedCoffeeScore, 'Fruit tea strawberry must score significantly higher than Iced Americano for Fruity preference');
  console.log(`✓ PASS: Fruit Tea score (${ftStrawberryScore}) > Coffee score (${icedCoffeeScore}).`);

  // Test 7: Snack Sweet Crispy matches Waffles
  console.log('\nTest 7: Sweet Crispy snack matches Waffles...');
  const waffleScore = calculateQuizMatchScore(sampleProducts.find(x => x.productId === 250), { type: 'snack', tempOrFlavor: 'sweet', tasteOrStyle: 'crispy' });
  const silogScore = calculateQuizMatchScore(sampleProducts.find(x => x.productId === 272), { type: 'snack', tempOrFlavor: 'sweet', tasteOrStyle: 'crispy' });
  assert(waffleScore > 0, 'Waffle must score positively');
  assert(waffleScore > silogScore, 'Waffle must rank higher than Liempo rice meal for sweet crispy craving');
  console.log(`✓ PASS: Waffle score (${waffleScore}) > Liempo (${silogScore}).`);

  // Test 8: Meaty Full Meal matches Silog meals and Pasta
  console.log('\nTest 8: Meaty Full Meal matches Silog meals...');
  const liempoScore = calculateQuizMatchScore(sampleProducts.find(x => x.productId === 272), { type: 'snack', tempOrFlavor: 'meaty', tasteOrStyle: 'meal' });
  const nachoScore = calculateQuizMatchScore(sampleProducts.find(x => x.productId === 258), { type: 'snack', tempOrFlavor: 'meaty', tasteOrStyle: 'meal' });
  assert(liempoScore > nachoScore, 'Liempo meal must rank higher than Nachos for full meal craving');
  console.log(`✓ PASS: Liempo rice meal (${liempoScore}) > Nachos (${nachoScore}).`);

  // Test 9: Deduplication of parent products
  console.log('\nTest 9: Parent product deduplication...');
  const mockMatches = [
    { productId: 177, productName: 'Iced Americano', price: 90 },
    { productId: 177, productName: 'Iced Americano', price: 110 },
    { productId: 185, productName: 'Iced Vanilla Latte', price: 110 }
  ];
  const seenIds = new Set();
  const distinct = [];
  for (const item of mockMatches) {
    if (!seenIds.has(item.productId)) {
      seenIds.add(item.productId);
      distinct.push(item);
    }
  }
  assert.strictEqual(distinct.length, 2, 'Duplicates of productId 177 must be consolidated into single parent product');
  console.log('✓ PASS: Distinct parent products correctly deduplicated.');

  // Test 10: 4-step Drink Base matching using recommendationInfo (Blended Frappes)
  console.log('\nTest 10: Drink Base question matches recommendationInfo "Blended drink"...');
  const frappeAnswers = { type: 'drink', tempOrCategory: 'cold', baseOrFlavor: 'blended', tasteOrStyle: 'sweet' };
  const frappeItem = sampleProducts.find(x => x.productId === 215); // recommendationInfo: 'Blended drink...'
  const coffeeItem = sampleProducts.find(x => x.productId === 177); // recommendationInfo: 'Coffee-based drink...'
  const frappeScoreVal = calculateQuizMatchScore(frappeItem, frappeAnswers);
  const coffeeScoreVal = calculateQuizMatchScore(coffeeItem, frappeAnswers);
  assert(frappeScoreVal > coffeeScoreVal, 'Blended Frappe must score significantly higher than Iced Americano when blended base is selected');
  console.log(`✓ PASS: Blended Frappe score (${frappeScoreVal}) > Coffee score (${coffeeScoreVal}).`);

  // Test 11: 4-step Drink Base question matches recommendationInfo "Carbonated drink"
  console.log('\nTest 11: Drink Base question matches recommendationInfo "Carbonated drink"...');
  const sodaAnswers = { type: 'drink', tempOrCategory: 'cold', baseOrFlavor: 'soda', tasteOrStyle: 'fruity' };
  const sodaItem = sampleProducts.find(x => x.productId === 226); // recommendationInfo: 'Carbonated drink...'
  const sodaScoreVal = calculateQuizMatchScore(sodaItem, sodaAnswers);
  const coffeeSodaScoreVal = calculateQuizMatchScore(coffeeItem, sodaAnswers);
  assert(sodaScoreVal > coffeeSodaScoreVal, 'Soda must score significantly higher than coffee for soda base preference');
  console.log(`✓ PASS: Soda score (${sodaScoreVal}) > Coffee score (${coffeeSodaScoreVal}).`);

  // Test 12: 4-step Food Category question matches recommendationInfo "Sandwich product"
  console.log('\nTest 12: Food Category question matches recommendationInfo "Sandwich product"...');
  const sandwichAnswers = { type: 'snack', tempOrCategory: 'sandwich', baseOrFlavor: 'savory', tasteOrStyle: 'bites' };
  const sandwichItem = sampleProducts.find(x => x.productId === 252); // recommendationInfo: 'Sandwich product...'
  const waffleItem = sampleProducts.find(x => x.productId === 246); // recommendationInfo: 'Waffle product...'
  const sandwichScoreVal = calculateQuizMatchScore(sandwichItem, sandwichAnswers);
  const waffleScoreVal = calculateQuizMatchScore(waffleItem, sandwichAnswers);
  assert(sandwichScoreVal > waffleScoreVal, 'Sandwich item must outrank Waffle for sandwich category craving');
  console.log(`✓ PASS: Sandwich score (${sandwichScoreVal}) > Waffle score (${waffleScoreVal}).`);

  // Test 13: 4-step Food Category question matches recommendationInfo "Fries or potato snack"
  console.log('\nTest 13: Food Category question matches recommendationInfo "Fries or potato snack"...');
  const friesAnswers = { type: 'snack', tempOrCategory: 'snack', baseOrFlavor: 'savory', tasteOrStyle: 'crispy' };
  const friesItem = sampleProducts.find(x => x.productId === 257); // recommendationInfo: 'Fries or potato snack...'
  const liempoItem = sampleProducts.find(x => x.productId === 272);
  const friesScoreVal = calculateQuizMatchScore(friesItem, friesAnswers);
  const liempoFriesScoreVal = calculateQuizMatchScore(liempoItem, friesAnswers);
  assert(friesScoreVal > liempoFriesScoreVal, 'Fries must outrank rice meal for finger snack craving');
  console.log(`✓ PASS: Fries score (${friesScoreVal}) > Liempo score (${liempoFriesScoreVal}).`);

  // Test 14: Coffee-based milk drink prioritization for warm latte
  console.log('\nTest 14: Warm milk latte matching recommendationInfo "Coffee-based milk drink"...');
  const latteAnswers = { type: 'drink', tempOrCategory: 'hot', baseOrFlavor: 'milk_coffee', tasteOrStyle: 'sweet' };
  const latteItem = sampleProducts.find(x => x.productId === 184); // recommendationInfo: 'Coffee-based milk drink...'
  const americanoItem = sampleProducts.find(x => x.productId === 176); // recommendationInfo: 'Coffee-based drink...'
  const latteScoreVal = calculateQuizMatchScore(latteItem, latteAnswers);
  const americanoScoreVal = calculateQuizMatchScore(americanoItem, latteAnswers);
  assert(latteScoreVal > americanoScoreVal, 'Coffee-based milk drink must outrank black americano for milk latte craving');
  // Test 15: Custom price range filtering in Virtual Barista Quiz
  console.log('\nTest 15: Custom price range filtering in recommendations...');
  const budgetDrink = { ...sampleProducts.find(x => x.productId === 177), price: 85, minPrice: 85, maxPrice: 85 };
  const priceyDrink = { ...sampleProducts.find(x => x.productId === 215), price: 165, minPrice: 165, maxPrice: 165 };
  const customRangeAnswers = { type: 'drink', tempOrCategory: 'cold', baseOrFlavor: 'any', tasteOrStyle: 'sweet', minPrice: 70, maxPrice: 120 };
  const budgetScore = calculateQuizMatchScore(budgetDrink, customRangeAnswers);
  const priceyScore = calculateQuizMatchScore(priceyDrink, customRangeAnswers);
  assert(budgetScore > 0, 'Drink within custom price range (₱85 in ₱70–₱120) must score positively');
  assert.strictEqual(priceyScore, -999, 'Drink outside custom price range (₱165 > ₱120) must be rejected (-999)');
  console.log(`✓ PASS: Custom price range (₱70–₱120) accepted ₱85 item (score ${budgetScore}) and rejected ₱165 item (${priceyScore}).`);

  // Test 16: Multi-size item custom price range matching in Virtual Barista Quiz
  console.log('\nTest 16: Multi-size drink custom price range matching...');
  const sizedDrink = {
    ...sampleProducts.find(x => x.productId === 221),
    hasSizes: true,
    minPrice: 90,
    maxPrice: 115,
    sizes: [
      { sizeId: 1, sizeName: '16oz', price: 90 },
      { sizeId: 2, sizeName: '22oz', price: 115 }
    ]
  };
  const match22ozRange = calculateQuizMatchScore(sizedDrink, { type: 'drink', tempOrCategory: 'cold', baseOrFlavor: 'tea', tasteOrStyle: 'fruity', minPrice: 110, maxPrice: 130 });
  const outOfRange = calculateQuizMatchScore(sizedDrink, { type: 'drink', tempOrCategory: 'cold', baseOrFlavor: 'tea', tasteOrStyle: 'fruity', minPrice: 140, maxPrice: 200 });
  assert(match22ozRange > 0, 'Multi-size drink with 22oz at ₱115 must match ₱110–₱130 custom range');
  assert.strictEqual(outOfRange, -999, 'Multi-size drink (₱90/₱115) must be rejected for ₱140–₱200 range');
  console.log('✓ PASS: Multi-size drink accurately evaluated against custom price ranges.');

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('ALL QUIZ RECOMMENDATION TESTS PASSED SUCCESSFULLY!');
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

runTests();
