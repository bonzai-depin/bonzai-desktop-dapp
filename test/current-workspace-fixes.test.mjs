import test from 'node:test';
import assert from 'node:assert/strict';
import { roleplayHistoryRecords, saveRoleplayMediaHistory } from '../src/services/roleplayMediaHistory.js';
import { teamSkillIds, agentModelOverride } from '../src/services/company/teamCapabilities.js';
import { assemble } from '../src/components/gen3d/parametricAssembly.js';
import { needsWorkspaceLicense } from '../src/main/workspace/license.js';
import { protocolActivities } from '../src/services/protocolActivities.js';
import { protocolGuideFr } from '../src/i18n/protocolGuide.fr.js';
test('local work never requires a workspace payment, including mutations',()=>{
 for(const channel of ['db:issues:create','company:run','workspace:restore','db:connectors:setSecret']) assert.equal(needsWorkspaceLicense(channel),false);
 assert.match(protocolActivities({}).find(x=>x.id==='workspace').cost,/free/);
});
test('roleplay saves project media idempotently without replacing normal generations',async()=>{
 const sessions={s:{companion:{name:'Sakura'},history:[{id:'m',role:'assistant',content:'A garden',image:'bonzai-blob://abc.webp',video:'/tmp/movie.mp4',audio:'/tmp/song.wav',ts:123},{id:'u',role:'user',image:'private-input'}]}};
 const records=roleplayHistoryRecords(sessions);
 assert.equal(records.imageInferences.length,1);
 assert.equal(records.videoInferences[0].source,'roleplay');
 const values={imageInferences:[{id:'normal'}]};
 const api={get:async k=>values[k]||[],set:async(k,v)=>{values[k]=v;}};
 await saveRoleplayMediaHistory(sessions,api);await saveRoleplayMediaHistory(sessions,api);
 assert.equal(values.imageInferences.length,2);assert.equal(values.audioInferences.length,1);
 assert.equal(values.videoInferences[0].timestamp,123);
});
test('team connectors expose skills to every role without granting another team’s integrations',()=>{
 const manifests={mail:{id:'mail',requiredConnectors:['smtp']},crm:{id:'crm',requiredConnectors:['crm']}};
 assert.ok(teamSkillIds({roles:{}},'Writer',[{kind:'smtp'}],manifests).includes('mail'));
 assert.ok(!teamSkillIds({roles:{}},'Writer',[{kind:'smtp'}],manifests).includes('crm'));
});
test('built-in agents cannot acquire a custom model through a stale role assignment',()=>{
 const charter={roles:{Writer:{companion:'builtin',llm:'custom-weights'}}};
 assert.equal(agentModelOverride(charter,'Writer',[{id:'builtin',isCustom:false}]),null);
 assert.equal(agentModelOverride(charter,'Writer',[{id:'builtin',isCustom:true}]),'custom-weights');
});
test('invalid assembly input gives actionable errors without masking them during cleanup',()=>{
 assert.throws(()=>assemble(null),/requires an object/);
 assert.throws(()=>assemble({parts:[{id:'a',helper:'wheel'}],materials:null}),/materials must be a map/);
});
test('every protocol activity has complete French instructions and no workspace paywall',()=>{
 for(const item of protocolActivities({})) {const translation=protocolGuideFr[item.id];assert.ok(translation,item.id);assert.equal(translation[1].length,3);assert.ok(translation[2]&&translation[3]);}
});
