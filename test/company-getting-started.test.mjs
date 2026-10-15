import test from 'node:test';
import assert from 'node:assert/strict';
import {teamGettingStarted,BUSINESS_FAQ,TEAM_FAQ} from '../src/services/company/gettingStarted.js';
import {buildWorkspaceBlueprint,hydrateWorkspaceChannels} from '../src/services/company/workspaceBlueprints.js';
import {workspaceNavigation,resolveWorkspaceDestination} from '../src/services/company/workspaceNavigation.js';

test('every business has a reachable guide and working instructions without unrelated billing',()=>{
 for(const profile of ['grants','hvac','purchasing','finance','hospitality','revenue','creative','commerce','legal','product','knowledge','support','generic']) {
  const channels=hydrateWorkspaceChannels(buildWorkspaceBlueprint({profile}));
  assert.ok(workspaceNavigation(channels).some(v=>v.key==='getting-started'));
  assert.equal(resolveWorkspaceDestination('getting-started',channels).value,'getting-started');
  const guide=teamGettingStarted({workspace:{profile}});
  assert.ok(guide.steps.length>=3);
  assert.ok(guide.outcomes.length>=2, `${profile} identifies its expected deliverables`);
  for(const [title,target,body] of guide.steps) {
   assert.ok(title && body);
   assert.equal(resolveWorkspaceDestination(target,channels,profile==='hvac').key,typeof target === 'string' ? target : target.view);
   if(target?.section)assert.equal(resolveWorkspaceDestination(target,channels,profile==='hvac').section,target.section);
  }
  for(const [question,answer,target] of BUSINESS_FAQ[profile] || []) {
   assert.ok(question && answer);
   assert.equal(resolveWorkspaceDestination(target,channels,profile==='hvac').key,typeof target === 'string' ? target : target.view);
   if(target?.section)assert.equal(resolveWorkspaceDestination(target,channels,profile==='hvac').section,target.section);
  }
  if(profile!=='hvac') assert.ok(!guide.steps.some(s=>s[1]==='billing'));
 }
});
test('specialized financial dossiers expose their own required deliverables',()=>{
 for(const id of ['paperasse_personal_tax','paperasse_notarial','paperasse_property']) {
  assert.equal(teamGettingStarted({template:{id}}).outcomes.length,3);
 }
});
test('help distinguishes preparation from verified external completion',()=>{
 assert.ok(TEAM_FAQ.some(f=>f[1].includes('not yet validated end to end')));
 assert.ok(BUSINESS_FAQ.grants.some(f=>f[1].includes('importing rows does not submit')));
});


test('personal workflow help describes the actual result instead of unrelated business intake',()=>{
 const guide=teamGettingStarted({name:'Quiet evenings',workspace:{executionWorkflowId:'meditation-forge-v1.0.0'}});
 assert.deepEqual(guide.outcomes,['Guided narration','Meditation script','Scene artwork']);
 assert.ok(guide.steps[0][2].includes('intention'));
 assert.ok(guide.faq.some(([question,answer])=>question==='What is Review for?' && answer.includes('not an email inbox')));
 assert.ok(!guide.steps.some(([,target])=>target==='intake'));
 assert.ok(!guide.faq.some(([,answer])=>answer.includes('customer records')));
 assert.equal(teamGettingStarted({workspace:{executionWorkflowId:'video-captioning-v1.0.0'}}).outcomes[0],'SRT visual captions');
});


test('built-in workflow guidance is translated in every supported non-English locale', async()=>{
 const {workflowTeamPresets}=await import('../src/services/company/workflowTeams.js');
 const {smartWorkflowOutcomeMessages}=await import('../src/i18n/smartWorkflowOutcomeMessages.js');
 const ids=['meditation-forge','video-captioning','finger-frame-director','live-streaming','tcg-analysis','mass-chat','robinhood-portfolio-council','polymarket-top-performers','chart-forecaster','prediction-market-maker'];
 for(const preset of workflowTeamPresets(ids.map(id=>({id})))) {
  for(const text of [preset.outcome,preset.firstValue,preset.review,...preset.deliverables]) {
   for(const locale of ['fr','es','ja','ko','zh','ru']) assert.ok(smartWorkflowOutcomeMessages[locale][text], `${locale}: ${text}`);
  }
 }
});
