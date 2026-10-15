import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowReviewApprovals, workflowReviewItems, workflowReviewTasks } from '../src/services/company/workflowReview.js';
import { resolveWorkspaceDestination, workspaceNavigation } from '../src/services/company/workspaceNavigation.js';

const charter = {id:'meditation', workspace:{executionWorkflowId:'meditation-forge-v1.0.0'}};
const task = (id, extra={}) => ({id, companyId:'meditation', title:'Evening calm', status:'blocked', execution:{steps:[{id:'step', action:{type:'runWorkflow',workflowId:'meditation-forge-v1.0.0'},status:'requires_input',output:{status:'ready_for_review',contentIds:['audio','script']}}]}, ...extra});
test('personal workflow Review counts saved tasks and permissions, never unrelated business intake',()=>{
 const state={issues:[task('ready'),task('done',{status:'done'}),task('other',{companyId:'other'}),task('legacy',{createdBy:'ceo'})],approvals:[{id:'permission'}],intakeReviewCount:9};
 const nav=workspaceNavigation([{view:'studio'}],state,charter);
 assert.deepEqual(nav.filter(item=>!item.utility).map(item=>item.label),['Workflow','Review','Results','Getting started']);
 assert.equal(nav.find(item=>item.value==='approvals').badge,2);
 assert.equal(workspaceNavigation([{view:'gmao'}],state,charter).find(item=>item.value==='approvals').label,'Inbox');
});
test('result reviews retain task identity and only the exact saved result version',()=>{
 const state={issues:[task('ready')],catalog:[{id:'audio',companyId:'meditation',pipeline:'audio'},{id:'script',companyId:'meditation',pipeline:'text'},{id:'old-version',companyId:'meditation'},{id:'audio',companyId:'other'}]};
 const [item]=workflowReviewItems(state,charter);
 assert.equal(item.id,'ready');assert.equal(item.resultCount,2);assert.deepEqual(item.results.map(row=>row.pipeline),['audio','text']);
 assert.equal(workflowReviewTasks({issues:[task('cancel',{status:'cancelled'}),task('brief',{execution:{steps:[{action:{type:'runWorkflow',workflowId:'meditation-forge-v1.0.0'},status:'requires_input',output:{status:'requires_input'}}]}})]},charter).length,0);
});
test('workflow permissions exclude obsolete planner requests and other teams, retaining explicit owner work',()=>{
 const state={issues:[task('old-plan',{createdBy:'ceo'}),task('old-goal',{createdBy:'ceo',goalId:'autonomous'}),task('delegated',{createdBy:'ceo',goalId:'owner'}),task('foreign',{companyId:'another'})],
  goals:[{id:'autonomous',companyId:'meditation',createdBy:'ceo'},{id:'owner',companyId:'meditation',createdBy:'owner'}],
  approvals:[{id:'old-plan',issueId:'old-plan'},{id:'old-goal',issueId:'old-goal'},{id:'foreign',companyId:'another'},
   {id:'foreign-task',issueId:'foreign'},{id:'decided',status:'approved'},{id:'owner-work',issueId:'delegated',companyId:'meditation',status:'pending'},
   {id:'standalone',companyId:'meditation'},{id:'loading-task',issueId:'not-yet-loaded'}]};
 assert.deepEqual(workflowReviewApprovals(state,charter).map(row=>row.id),['owner-work','standalone','loading-task']);
 assert.equal(workspaceNavigation([{view:'studio'}],state,charter).find(item=>item.value==='approvals').badge,4);
});
test('native workflows expose task execution controls rather than inactive goal planning entry points',()=>{
 for (const studio of [{view:'studio'},{value:'studio'}]) {
  const channels=[studio,{key:'strategy',view:'mission'},{key:'brief',view:'command'}];
  const utilities=workspaceNavigation(channels,{},charter).filter(item=>item.utility);
  assert.deepEqual(utilities.map(item=>item.value),['org','issues','activity','connectors','charter']);
  assert.equal(workspaceNavigation(channels,{},charter)[0].value,'studio');
  for (const key of ['mission','command','chat','requests','team-exchanges','strategy','brief','unknown']) {
   assert.equal(resolveWorkspaceDestination(key,channels).value,'studio',key);
  }
  assert.equal(resolveWorkspaceDestination({view:'mission'},channels).value,'studio');
  for (const key of ['issues','connectors','charter','org','activity']) assert.equal(resolveWorkspaceDestination(key,channels).value,key);
 }
 const operational=workspaceNavigation([{view:'gmao'}]).filter(item=>item.utility);
 assert.ok(operational.some(item=>item.value==='mission'));
 assert.ok(operational.some(item=>item.value==='command'));
 assert.equal(resolveWorkspaceDestination('mission',[{view:'gmao'}],true).value,'mission');
 assert.equal(resolveWorkspaceDestination('chat',[{view:'gmao'}],true).value,'command');
});
