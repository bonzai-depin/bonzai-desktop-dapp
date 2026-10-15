import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRoleplayProfile,roleplayParticipantContext} from '../src/services/roleplayProfile.js';
test('legacy appearance survives profile migration without inventing a character',()=>{
 const profile=normalizeRoleplayProfile({userName:'Alex',userDescription:'Green coat',userImage:'data:image/webp;base64,test'});
 assert.equal(profile.userDescription,'Green coat');
 assert.equal(profile.background,'');
 assert.equal(profile.userName,'Alex');
 assert.equal(profile.userImage,'data:image/webp;base64,test');
 assert.equal(roleplayParticipantContext(normalizeRoleplayProfile()),'');
});
test('role, relationship, goals and boundaries inform dialogue without changing appearance or user agency',()=>{
 const profile=normalizeRoleplayProfile({role:'Archivist',relationship:'Old friend',goals:'Find the missing letter',boundaries:'No violence',userDescription:'Green coat'});
 const context=roleplayParticipantContext(profile);
 for(const value of ['Archivist','Old friend','Find the missing letter','No violence','Green coat']) assert.ok(context.includes(value));
 assert.match(context,/leave their choices, thoughts and actions to the user/);
 assert.equal(profile.userDescription,'Green coat');
});
