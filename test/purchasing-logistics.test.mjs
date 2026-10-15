import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLogistics, LOGISTICS_COSTS } from '../src/shared/purchasingLogistics.js';
const quote = { subtotalCents: 650000, shippingCents: 50000 };
const plan = { costs: LOGISTICS_COSTS.map(category => ({category,status:'confirmed',amountCents:category==='freight'?170000:0})), targetMarginPct:35, salePriceCents:1000000, otherJobCostsCents:0, contingencyCents:0 };
test('landed costs replace quote freight and calculate gross margin, not markup', () => {
 const a=assessLogistics(plan,quote);
 assert.equal(a.expectedCostCents,770000);assert.equal(a.marginPct,23);
 assert.equal(a.suggestedSaleCents,1184616);assert.ok(a.warnings.includes('margin_below_target'));
});
test('unknown and expired costs cannot silently pass as a complete budget', () => {
 const a=assessLogistics({...plan,costs:[{category:'freight',status:'estimated',amountCents:50000,validUntil:1}],requiredAt:10,expectedAt:20},quote,100);
 assert.ok(a.warnings.includes('missing:duties'));assert.ok(a.warnings.includes('expired:freight'));assert.ok(a.warnings.includes('delivery_late'));
 assert.equal(assessLogistics(plan,null).expectedCostCents,null);
 assert.equal(assessLogistics({...plan,salePriceCents:null},quote).marginPct,null);
});
