import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentExecution, runAgentLoop, agentContext, validateCompletion } from '../src/services/company/agentLoop.js';
import { executionOutcome } from '../src/services/company/taskExecution.js';
import { workspaceNavigation } from '../src/services/company/workspaceNavigation.js';
const base = () => ({ companyId: 'maintenance', execution: createAgentExecution({ teamId: 'maintenance' }), save: async () => {}, canRun: async () => true, gate: async () => ({ pass: true }) });

test('native loop uses observed results to choose the next tool and verify the business outcome', async () => {
  const actions = [], checkpoints = [];
  const result = await runAgentLoop({ ...base(), save: async state => checkpoints.push(structuredClone(state)),
    decide: async state => !state.steps.length ? { kind:'act', action:{type:'findInvoice'} }
      : state.steps.length === 1 ? {kind:'act',action:{type:'prepareReminder',invoiceId:{$ref:'step1.id'},amount:state.steps[0].output.balance}}
      : {kind:'complete',summary:'Reminder draft prepared for the verified balance of €120.',evidence:['step2']},
    dispatch: async action => { actions.push(action); return action.type === 'findInvoice' ? {id:'invoice-actual',balance:120} : {id:'reminder-draft',status:'completed'}; },
  });
  assert.equal(executionOutcome(result), 'done');
  assert.equal(actions[1].invoiceId, 'invoice-actual'); assert.equal(actions[1].amount,120);
  assert.ok(checkpoints.some(state => state.steps[1]?.status === 'planned' && state.steps[0].output.balance === 120));
});
test('approval continuation observes the approved result without replaying previous effects', async () => {
  let calls = 0, decisions = 0;
  const options = {...base(), decide: async () => ++decisions === 1 ? {kind:'act',action:{type:'send',to:'approved-test-recipient'}} : {kind:'complete',summary:'Provider accepted the message.',evidence:['step1']},
    gate: async () => ({pass:false,queued:'approval'}), dispatch: async () => {calls++;return {id:'provider-receipt'};}};
  const waiting = await runAgentLoop(options);
  assert.equal(executionOutcome(waiting),'queued'); assert.equal(calls,0);
  const done = await runAgentLoop({...options, execution:waiting, approval:{id:'approval',stepId:'step1',action:waiting.steps[0].resolvedAction}});
  assert.equal(calls,1);assert.equal(decisions,2);assert.equal(executionOutcome(done),'done');
});
test('owner questions and cross-team waits yield without holding or polling the model', async () => {
  const asked = await runAgentLoop({...base(),decide:async()=>({kind:'ask',question:'Which client should receive the quote?'})});
  assert.equal(executionOutcome(asked),'waiting');
  await runAgentLoop({...base(),execution:asked,decide:async()=>assert.fail('Waiting must not call inference')});
  const state = createAgentExecution({teamId:'maintenance'});
  state.steps.push({id:'step1',status:'completed',action:{type:'team.requestWork'},output:{result:{id:'thread',subject:'Parts availability',messages:[{id:'request',company_id:'maintenance'}]}}});
  const waited = await runAgentLoop({...base(),execution:state,decide:async()=>({kind:'wait',conversationId:'thread',reason:'Need a supplier reference.'})});
  assert.deepEqual(waited.agent.wait.seenMessageIds,['request']);
  assert.throws(()=>validateCompletion(state,{summary:'Purchased',evidence:['step1']},'maintenance'),/not returned/);
});
test('interactive input stops the planner without inventing configuration repairs', async () => {
  let decisions = 0;
  const state = await runAgentLoop({ ...base(),
    decide: async () => {
      assert.equal(++decisions, 1, 'a workspace handoff must not ask the model to repair the workflow');
      return { kind: 'act', action: { type: 'runWorkflow', workflowId: 'meditation-forge-v1.0.0' } };
    },
    dispatch: async () => ({ ok: false, status: 'requires_input', beforeDispatch: true, error: 'Open Production to choose the session inputs.' }),
  });
  assert.equal(decisions, 1);
  assert.equal(state.steps[0].status, 'requires_input');
  assert.equal(state.steps[0].safeToRevise, false);
  assert.equal(executionOutcome(state), 'blocked');
});
test('fabricated completion and invalid wait IDs become bounded corrections, not successful tasks',async()=>{
  let turn=0;
  const result = await runAgentLoop({...base(),limits:{turnsPerRun:10,totalTurns:3,totalSteps:2},decide:async()=>++turn===1?{kind:'complete',summary:'Done',evidence:['fiction']}:{kind:'wait',conversationId:'missing'}});
  assert.equal(result.agent.status,'blocked'); assert.equal(executionOutcome(result),'blocked');
  assert.equal(turn,3);assert.equal(result.agent.events.length,3);
});
test('interrupted external outcomes require review and failed persistence prevents any effect', async()=>{
  const options={...base(),decide:async()=>({kind:'act',action:{type:'send'}}),dispatch:async()=>{throw new Error('Connection lost after submission');}};
  const interrupted=await runAgentLoop(options);
  assert.equal(interrupted.steps[0].status,'unknown');assert.equal(executionOutcome(interrupted),'blocked');
  await runAgentLoop({...options,execution:interrupted,dispatch:async()=>assert.fail('No replay')});
  await assert.rejects(()=>runAgentLoop({...options,save:async()=>{throw new Error('disk full');},dispatch:async()=>assert.fail('No effect without a checkpoint')}),/disk full/);
});
test('a policy edit during inference stops the newly proposed action',async()=>{
  let allowed=true;
  const state=await runAgentLoop({...base(),canRun:async()=>({ok:allowed,reason:'Team changed'}),decide:async()=>{allowed=false;return {kind:'act',action:{type:'send'}};},dispatch:async()=>assert.fail('Team changed')});
  assert.equal(state.steps.length,0);assert.equal(executionOutcome(state),'blocked');
});
test('context is bounded while full receipts remain available and task batches continue',async()=>{
  const state=createAgentExecution({teamId:'maintenance'});state.steps=[{id:'step1',status:'completed',action:{type:'read'},output:{id:'file',data:Array.from({length:500},()=>('x'.repeat(10000))),base64:'secret media bytes'}}];
  assert.ok(agentContext(state).length<8000);assert.ok(!agentContext(state).includes('secret media bytes'));assert.equal(state.steps[0].output.data.length,500);
  const result=await runAgentLoop({...base(),limits:{turnsPerRun:1,totalTurns:80,totalSteps:60},decide:async()=>({kind:'act',action:{type:'read'}})});
  assert.equal(executionOutcome(result),'continue');assert.equal(result.steps[0].status,'planned');
});
test('workspace exposes daily operations once without a maintenance wrapper',()=>{
  const nav=workspaceNavigation([{view:'command'},{view:'issues'},{view:'issues'},{view:'gmao'},{view:'gmao'}],{approvals:[{}],issues:[{status:'blocked'}]});
  assert.equal(new Set(nav.map(item=>item.key)).size,nav.length);
  assert.deepEqual(nav.filter(item=>item.value==='gmao').map(item=>item.key),['today','schedule','work-orders','clients','parts','settings']);
  assert.equal(nav.find(item=>item.value==='approvals').badge,1);
  assert.ok(!workspaceNavigation([]).some(item=>item.value==='gmao'));
});

test('the agent corrects a rejected input without owner troubleshooting or replaying an effect',async()=>{
  let turn=0,calls=0,policyChecks=0;
  const result=await runAgentLoop({...base(),decide:async state=>{
    turn++;if(turn===1)return {kind:'act',action:{type:'prepareReport'}};
    if(turn===2){assert.equal(state.steps[0].safeToRevise,true);return {kind:'revise',stepId:'step1',action:{type:'prepareReport',text:'Verified content'}};}
    return {kind:'complete',summary:'Local report saved.',evidence:['step2']};
  },gate:async action=>{policyChecks++;return action.text?{pass:true}:{pass:false,correctable:true,error:'Report text required'};},dispatch:async()=>{calls++;return {id:'saved-report'};}});
  assert.equal(executionOutcome(result),'done');assert.equal(calls,1);assert.equal(policyChecks,2);
  assert.equal(result.steps[0].status,'superseded');assert.match(result.steps[0].error,/required/);
});

test('a progress reply from another team is not a completed business outcome',()=>{
  const state=createAgentExecution({teamId:'maintenance'});
  state.steps=[{id:'step1',status:'completed',action:{type:'team.requestWork'},output:{result:{id:'t',task_status:'open',messages:[{company_id:'purchasing',body:'Which size?'}]}}}];
  assert.throws(()=>validateCompletion(state,{summary:'Parts ordered',evidence:['step1']},'maintenance'),/not completed/);
});
