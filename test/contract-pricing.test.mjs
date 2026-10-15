import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePricingProfile, calculateContractQuote } from '../src/services/company/contractPricing.js';

const profile = () => validatePricingProfile({reference:'CCTP 25-004',validatedBy:'Contract owner',coefficient:1,accessAboveThreshold:'included'}, {confirmed:true,now:100});
test('a franchise deducts eight hours, not unlimited labour, without billing included travel', () => {
  const invoice=calculateContractQuote({pricingCategory:'chiller',partsCents:160000,laborCents:100000,laborHours:10,travelCents:20000,vatRate:20},profile(),{technicalSection:'ST1',domainCode:'IFC'});
  assert.equal(invoice.includedLaborCents,80000);
  assert.equal(invoice.subtotalCents,30000);
  assert.equal(invoice.totalCents,36000);
});
test('the exact threshold includes the whole repair; every cent above invokes the deduction rule', () => {
  const asset={technicalSection:'ST3',domainCode:'ESP'};
  const input={pricingCategory:'pressure',partsCents:30000,laborCents:90000,travelCents:10000,accessCents:15000,vatRate:20};
  assert.equal(calculateContractQuote(input,profile(),asset).totalCents,0);
  assert.throws(()=>calculateContractQuote({...input,partsCents:30001},profile(),asset),/heures/);
  assert.equal(calculateContractQuote({...input,partsCents:30001,laborHours:9},profile(),asset).subtotalCents,10001);
});
test('contract ambiguity, validation, and equipment mismatch fail closed', () => {
  assert.throws(()=>validatePricingProfile({validatedBy:'Someone'}),/Validez/);
  assert.throws(()=>calculateContractQuote({pricingCategory:'other_ventilation'},profile(),{technicalSection:'ST2'}),/clarification/);
  assert.throws(()=>calculateContractQuote({pricingCategory:'chiller'},profile(),{technicalSection:'ST2'}),/catégorie/);
  const clarified={...profile(),ventilationResolution:'Written amendment 1: included through €100'};
  assert.equal(calculateContractQuote({pricingCategory:'other_ventilation',partsCents:11000},clarified,{technicalSection:'ST2'}).totalCents,1000);
});
test('lifting treatment and coefficient are validated contract choices, not model overrides', () => {
  const selected=validatePricingProfile({...profile(),coefficient:1.1,accessAboveThreshold:'billable'}, {confirmed:true});
  const quote=calculateContractQuote({pricingCategory:'air_handler',partsCents:40000,accessCents:5000,coefficient:99},selected,{technicalSection:'ST2'});
  assert.equal(quote.coefficient,1.1);assert.equal(quote.subtotalCents,16000);
});
