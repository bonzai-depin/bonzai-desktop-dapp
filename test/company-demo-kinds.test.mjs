import test from 'node:test';
import assert from 'node:assert/strict';
import {teamDemoKinds} from '../src/services/company/gettingStarted.js';
test('team guides expose only relevant rehearsals, excluding unrelated finance templates',()=>{
 assert.deepEqual(teamDemoKinds({workspace:{profile:'hvac'}}),['hvac']);
 assert.deepEqual(teamDemoKinds({workspace:{profile:'grants'}}),['grants']);
 assert.deepEqual(teamDemoKinds({workspace:{profile:'finance'}}),['billing']);
 for(const profile of ['general','hospitality','purchasing','creative'])assert.deepEqual(teamDemoKinds({workspace:{profile}}),[]);
 assert.deepEqual(teamDemoKinds({workspace:{profile:'finance'},template:{id:'paperasse_personal_tax'}}),[]);
 assert.deepEqual(teamDemoKinds({workspace:{profile:'finance',templateId:'paperasse_audit'}}),[]);
 assert.deepEqual(teamDemoKinds({demoRun:true,demoResult:{kind:'billing'}}),['billing']);
});
