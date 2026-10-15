import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowTeamPresets, findWorkflowTeam } from '../src/services/company/workflowTeams.js';
import { buildWorkspaceBlueprint } from '../src/services/company/workspaceBlueprints.js';
import { workspaceNavigation, resolveWorkspaceDestination } from '../src/services/company/workspaceNavigation.js';
import { filterTemplates } from '../src/services/company/templateCatalog.js';
import { applyTemplate } from '../src/services/company/templates.js';
import { pendingCompanyWorkflow, companyWorkflowHandoff, requestCompanyWorkflow } from '../src/services/company/workflowHandoff.js';

test('installed and custom workflows become selectable team templates; roleplay stays personal', () => {
 const presets = workflowTeamPresets([{id:'meditation-forge-v1.0.0',name:'Meditation'}, {id:'custom-analysis',name:'Custom analysis'}, {id:'roleplay-companion-v1.0.0'}, {id:'disabled',disabled:true}]);
 assert.deepEqual(presets.map(p=>p.id), ['meditation-forge-v1.0.0','custom-analysis']);
 assert.equal(filterTemplates(presets,{category:'wellness',query:'meditation'})[0].executionWorkflowId,'meditation-forge-v1.0.0');
 assert.deepEqual(presets[0].goals, [], 'creating a team must not start a generation with invented inputs');
});
test('available built-in workflows are categorized by the result users want', () => {
 const expected = {
  'meditation-forge': 'wellness', 'video-captioning': 'media', 'finger-frame-director': 'media',
  'live-streaming': 'media', 'tcg-analysis': 'collectibles', 'mass-chat': 'research',
  'robinhood-portfolio-council': 'markets', 'polymarket-top-performers': 'markets', 'chart-forecaster': 'markets',
 };
 const presets = workflowTeamPresets(Object.keys(expected).map(id => ({id:`${id}-v1.0.0`,name:id})));
 for (const preset of presets) {
  assert.equal(preset.category, expected[preset.id.replace('-v1.0.0','')]);
  assert.ok(preset.deliverables.length >= 2, preset.id);
  assert.ok(preset.frDeliverables.length >= 2, preset.id);
  assert.notEqual(preset.icon, 'auto_awesome', 'category icons describe the actual work');
 }
 assert.equal(filterTemplates(presets,{category:'markets'}).length,3);
 assert.deepEqual(filterTemplates(presets,{query:'SRT visual captions'}).map(row=>row.id),['video-captioning-v1.0.0']);
 assert.deepEqual(filterTemplates(presets,{query:'meditation guidee',locale:'fr'}).map(row=>row.id),['meditation-forge-v1.0.0']);
});
test('imported workflows honor outcome metadata and are never lost in an unknown category', () => {
 const source = [
  {id:'stock-research',category:'finance',tags:['stocks']},
  {id:'invoice-check',category:'finance',tags:['invoicing']},
  {id:'warehouse',category:'unknown',tags:['inventory']},
  {id:'bespoke',category:'unknown'},
  {id:'declared',category:'finance',tags:['research'],metadata:{workspaceCategory:'compliance'}},
 ];
 const snapshot = structuredClone(source);
 const presets = workflowTeamPresets(source);
 assert.deepEqual(presets.map(p=>p.category),['markets','finance','purchasing','custom','compliance']);
 assert.equal(filterTemplates(presets,{category:'custom'})[0].id,'bespoke');
 assert.deepEqual(source,snapshot);
});
test('catalog browsing excludes disabled and roleplay versions and deduplicates installed IDs', () => {
 const presets = workflowTeamPresets([
  {id:'roleplay-companion-v2.0.0'}, {id:'prediction-market-maker-v1.0.0',disabled:true},
  {id:'custom-report',name:'Report'}, {id:'custom-report',name:'Duplicate'}, null,
 ]);
 assert.deepEqual(presets.map(p=>p.id),['custom-report']);
});
test('formation preserves the workflow and exposes production, approvals and results without HVAC or billing', () => {
 const {draft} = applyTemplate('business_ops_team', {businessName:'Test studio',businessType:'Meditation',workflowId:'meditation',executionWorkflowId:'meditation'}, {connectorKinds:[],initialGoals:[],demoMode:false});
 assert.equal(draft.workspace.executionWorkflowId, 'meditation');
 assert.match(draft.mission,/meditation/);
 assert.doesNotMatch(draft.mission,/invoicing/);
 const nav=workspaceNavigation(draft.workspace.channels);
 for(const view of ['studio','issues','approvals','deliverables','org']) assert.ok(nav.some(v=>v.value===view));
 assert.ok(!nav.some(v=>['gmao','billing'].includes(v.value)));
 assert.equal(resolveWorkspaceDestination('studio',draft.workspace.channels).value,'studio');
 assert.equal(resolveWorkspaceDestination('',draft.workspace.channels).value,'studio', 'reopening a production team returns to its actual work');
 assert.ok(!nav.some(v=>v.value==='overview'), 'do not duplicate production progress in a generic business overview');
 assert.deepEqual(Object.keys(draft.roles), ["CEO"], "one assigned worker runs each task; do not invent an operations department");
 assert.deepEqual(draft.initialGoals, []);
});
test('legacy links reuse an existing team; do not create demo duplicates or attach to another company', () => {
 const companies=[{id:'demo',demoRun:{},workspace:{executionWorkflowId:'meditation'}},{id:'real',workspace:{executionWorkflowId:'meditation'}}];
 assert.equal(findWorkflowTeam(companies,{skillId:'meditation'}).id,'real');
 assert.equal(findWorkflowTeam(companies,{skillId:'meditation',companyId:'deleted'}),undefined);
 requestCompanyWorkflow({skillId:'meditation',companyId:'real',issueId:'task1'});
 assert.equal(pendingCompanyWorkflow.value.companyId,'real');
 assert.equal(companyWorkflowHandoff.value.issueId,'task1');
});
test('ordinary business teams retain their existing workspace',()=>{
 const workspace=buildWorkspaceBlueprint({templateId:'hvac_residential'});
 assert.equal(workspace.executionWorkflowId,undefined);
 assert.ok(workspace.channels.some(channel=>channel.view==='gmao'));
 assert.ok(workspace.recommendedRoles.includes('MaintenancePlanner'));
 assert.ok(workspace.recommendedRoles.includes('DispatchCoordinator'));
});

test('workflow outcomes describe implemented outputs without promising unsupported automation', () => {
 const rows = Object.fromEntries(workflowTeamPresets([
  {id:'video-captioning-v1.0.0'}, {id:'robinhood-portfolio-council-v1.0.0'},
  {id:'live-streaming-v1.0.0'}, {id:'prediction-market-maker-v1.0.0'},
 ]).map(row => [row.id, row]));
 assert.match(rows['video-captioning-v1.0.0'].review, /does not transcribe speech/);
 assert.match(rows['robinhood-portfolio-council-v1.0.0'].review, /does not enforce portfolio limits/);
 assert.deepEqual(rows['robinhood-portfolio-council-v1.0.0'].deliverables, ['Account and market information', 'Approved action receipts']);
 assert.match(rows['live-streaming-v1.0.0'].review, /Paid requests and companion moderation are not available/);
 assert.match(rows['prediction-market-maker-v1.0.0'].review, /does not deploy a live market/);
});
