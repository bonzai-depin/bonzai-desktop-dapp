import test from 'node:test';
import assert from 'node:assert/strict';
import {actionDisplayName} from '../src/services/company/actionLabels.js';
import {operationText} from '../src/i18n/operations.js';
test('report approvals describe local preparation, not technical publishing commands',()=>{
 assert.equal(actionDisplayName('publishComplianceReport','en'),'Prepare compliance report');
 assert.equal(actionDisplayName('publishComplianceReport','fr'),'Préparer le rapport de conformité');
 for(const locale of ['zh','ko','ja','es','ru']) assert.notEqual(actionDisplayName('publishComplianceReport',locale),'Prepare compliance report');
});
test('unknown actions never leak camelCase or namespace separators',()=>{
 assert.equal(actionDisplayName('inventory.updateStockLevels'),'Update stock levels');
});
test('roles are translated in every supported language',()=>{
 for(const locale of ['fr','zh','ko','ja','es','ru']) for(const role of ['Legal and compliance','Document management']) assert.notEqual(operationText(role,locale),role);
});
