import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('relationship journal persists tracks, gifts, quest evidence and scene continuity', { skip: !url, timeout: 90000 }, async () => {
 const browser = await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page = await browser.newPage({viewport:{width:1280,height:950}}); page.setDefaultTimeout(10000); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/skills/flagship.js*',r=>r.fulfill({contentType:'application/javascript',body:`export async function generateRoleplayStory(){if(window.failStory)throw new Error('Story model unavailable');return JSON.stringify({complete:true,evidence:[{role:'user',quote:'I move the sculpture into the new alcove.'},{role:'assistant',quote:'We adjust the lights and the sculpture fits beautifully.'}],memory:'We found a place for the sculpture.'})}`}));
  await page.route(url+'/',r=>r.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body style="margin:0;padding:16px;background:var(--bz-canvas);color:var(--bz-fg)"><div id="fixture"></div></body></html>'}));
  await page.goto(url);
  await page.evaluate(async()=>{
   const {createApp,h,reactive,ref}=await import('/node_modules/.vite/deps/vue.js');const {default:Journey}=await import('/src/components/roleplay/RelationshipJourney.vue');
   window.state=reactive({companion:{id:'sakura',name:'Sakura',personality:'Curious researcher'},scene:{id:'gallery',name:'Midnight gallery',metadata:{activities:['lighting tests','exhibition'],narrativeHooks:['A sculpture does not fit']}},editable:true,trackId:undefined});window.actions=[];
   createApp({setup(){const panel=ref(null);window.panel=panel;return()=>h(Journey,{...window.state,ref:panel,'onSelect-track':id=>{window.state.trackId=id},onAction:text=>window.actions.push(text)})}}).mount('#fixture');
  });
  await page.getByText('A shared purpose in Midnight gallery',{exact:true}).waitFor();
  const first=await page.evaluate(()=>window.state.trackId);assert.ok(first);
  await page.getByRole('button',{name:'Gifts',exact:true}).click();await page.getByRole('button',{name:'Buy gift'}).first().click();await page.getByText('22 story coins',{exact:true}).waitFor();
  await page.evaluate(()=>window.state.editable=false);await page.getByRole('button',{name:'Give',exact:true}).first().click();await page.waitForFunction(()=>window.actions.length===1);
  assert.match((await page.evaluate(()=>window.actions))[0],/tea selection/);
  await page.evaluate(async()=>{await window.panel.value.recordTurn('I move the sculpture into the new alcove.','We adjust the lights and the sculpture fits beautifully.','t1');await window.panel.value.recordTurn('I move the sculpture into the new alcove.','We adjust the lights and the sculpture fits beautifully.','t2');});
  await page.getByRole('status').filter({hasText:'completed'}).waitFor();
  await page.evaluate(()=>{window.state.editable=true;window.state.scene={id:'kitchen',name:'Kitchen'};});
  await page.getByRole('button',{name:'Quests',exact:true}).click();await page.getByRole('heading',{name:'Kitchen',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.state.trackId),first);
  await page.getByRole('button',{name:'Memories',exact:true}).click();await page.getByText('We found a place for the sculpture.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Start a new track'}).click();await page.getByLabel('New track name').fill('A different story');await page.getByRole('button',{name:'Create track',exact:true}).click();await page.getByText('Your completed quests and gifts will appear here, across every scene on this track.').waitFor();
  assert.notEqual(await page.evaluate(()=>window.state.trackId),first);
  await page.getByLabel('Relationship track').selectOption(first);await page.getByText('We found a place for the sculpture.',{exact:true}).waitFor();
  for(const width of [1280,600,390]){await page.setViewportSize({width,height:950});await page.getByRole('button',{name:'Gifts',exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);}
  await page.screenshot({path:'/tmp/bonzai-journey-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:950});await page.getByRole('button',{name:'Quests',exact:true}).click();await page.evaluate(()=>window.failStory=true);await page.getByRole('button',{name:'Personalize story'}).click();await page.getByRole('alert').filter({hasText:'Story model unavailable'}).waitFor();
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});
