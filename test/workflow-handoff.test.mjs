import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureWorkflowTeam } from '../src/services/company/ensureWorkflowTeam.js';
import { podcastStudio } from '../src/skills/mediaProduction.js';
import { flagshipSkills } from '../src/skills/flagship.js';
import { workspaceDiscovery } from '../src/services/company/workspaceDiscovery.js';
import { workflowDemo } from '../src/services/company/workflowDemo.js';
import { requestCompanyWorkflow, workflowInputDraft } from '../src/services/company/workflowHandoff.js';

test('a workflow handoff forms one real team automatically, then reuses it', async () => {
 const teams=[], calls=[];
 const deps={companies:()=>teams,catalog:async()=>[podcastStudio],form:async(...args)=>{calls.push(args);await new Promise(r=>setTimeout(r,5));const team={id:'podcast-team',workspace:{executionWorkflowId:podcastStudio.id}};teams.push(team);return team;}};
 const target={skillId:podcastStudio.id};
 const [a,b]=await Promise.all([ensureWorkflowTeam(target,deps),ensureWorkflowTeam(target,deps)]);
 assert.equal(a.id,b.id);assert.equal(calls.length,1);
 assert.equal(calls[0][0],podcastStudio.id);assert.equal(calls[0][1].executionWorkflowId,podcastStudio.id);
 assert.equal(calls[0][2].demoMode,false);assert.deepEqual(calls[0][2].initialGoals,[]);
 await ensureWorkflowTeam(target,deps);assert.equal(calls.length,1);
 await assert.rejects(ensureWorkflowTeam({companyId:'deleted',skillId:podcastStudio.id},deps),/no longer/);
 await assert.rejects(ensureWorkflowTeam({skillId:'missing'},deps),/not installed/);
});
test('handoff drafts remove encoded reasoning from every text input',()=>{
 requestCompanyWorkflow({skillId:podcastStudio.id,inputs:{brief:'&lt;think&gt;Private reasoning&lt;/think&gt;Public answer',lyrics:'<think>planning</think>[Verse]\nHello'}});
 assert.deepEqual(workflowInputDraft.value.inputs,{brief:'Public answer',lyrics:'[Verse]\nHello'});
});
test('every discovered workflow has an input, execution and result walkthrough',()=>{
 const workflows=workspaceDiscovery(flagshipSkills);
 assert.ok(workflows.length>25);
 for(const workflow of workflows){const steps=workflowDemo(workflow);assert.equal(steps.length,3,workflow.id);assert.ok(steps.every(s=>s.text&&s.title&&Array.isArray(s.items)),workflow.id);}
 assert.match(workflowDemo(workflows.find(w=>w.id==='music-video-forge-v1.0.0'))[2].text,/entire song/);
});
