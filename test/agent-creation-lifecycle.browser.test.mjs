import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('agent creation survives navigation, restores progress and automatically saves once', {skip: !url, timeout: 60000}, async () => {
 const browser = await chromium.launch({channel:'chrome',headless:true});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  await page.addInitScript(() => localStorage.setItem('bonzai.onboarding.v4.completed','true'));
  await page.goto(url);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('bonzai:set-mode',{detail:'agent'})));
  await page.locator('.is-agent-management').waitFor();
  await page.evaluate(async () => {
   let instance = document.querySelector('.is-agent-management').__vueParentComponent;
   while (instance && !instance.setupState.generateCustomCompanion) instance = instance.parent;
   window.creator = instance;
   const compiled = await fetch('/src/components/skills/RoleplayChat.vue').then(r=>r.text());
   const path = compiled.match(/from ["']([^"']*\/skills\/flagship\.js[^"']*)["']/)[1];
   const {roleplayCompanion} = await import(path);
   window.identityRuns = 0;
   roleplayCompanion.execution.generateCompanionProgressive = async ({onProgress}) => {
    window.identityRuns++;
    onProgress({phase:'identity',message:'Writing identity',companion:{id:'test-background',name:'Test Background Agent',age:30}});
    await new Promise(resolve=>window.finishIdentity=resolve);
    return {id:'test-background',name:'Test Background Agent',age:30,gender:'female',appearance:'Adult woman with brown eyes',personality:'Thoughtful',isCustom:true};
   };
   window.electronAPI ||= {};
   window.electronAPI.inferenceRequest = async () => {
    await new Promise(resolve=>window.finishPortrait=resolve);
    return {ok:true,result:{image:'/src/assets/companions/mai.webp'}};
   };
  });
  await page.waitForFunction(()=>window.creator.setupState.companionsLoaded);
  await page.evaluate(()=>{
   const state=window.creator.setupState;
   state.modelAvailability.llm_nemomix_12b_heretic=true; state.modelAvailability.image_quality=true; state.modelAvailabilityChecked=true;
   state.customCompanionPrompt='A thoughtful creative director';
   window.creation = state.generateCustomCompanion();
  });
  await page.waitForFunction(()=>typeof window.finishIdentity==='function');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bonzai:set-mode',{detail:'chat'})));
  await page.locator('.is-agent-management').waitFor({state:'detached'});
  await page.evaluate(()=>window.finishIdentity());
  await page.waitForFunction(()=>typeof window.finishPortrait==='function');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bonzai:set-mode',{detail:'agent'})));
  await page.locator('.is-agent-management').waitFor();
  await page.locator('.custom-companion-preview').getByText('Generating portrait...', {exact:true}).or(page.locator('.custom-companion-preview').getByText('Generating portrait',{exact:true})).waitFor();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bonzai:set-mode',{detail:'chat'})));
  await page.locator('.is-agent-management').waitFor({state:'detached'});
  await page.evaluate(async()=>{window.finishPortrait(); await window.creation;});
  const result=await page.evaluate(async()=>{
   const compiled=await fetch('/src/components/skills/RoleplayChat.vue').then(r=>r.text());
   const path=compiled.match(/from ["']([^"']*roleplayStore\.service\.js[^"']*)["']/)[1];
   return (await (await import(path)).loadCompanions()).filter(a=>a.id==='test-background');
  });
  assert.equal(result.length,1); assert.equal(result[0].image,'/src/assets/companions/mai.webp');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bonzai:set-mode',{detail:'agent'})));
  await page.getByText('Saved on this device',{exact:true}).waitFor();
  assert.equal(await page.locator('.is-agent-management').getByRole('button',{name:'Save',exact:true}).count(),0);
  await page.getByRole('button',{name:'Regenerate portrait',exact:true}).waitFor();
  await page.screenshot({path:'/tmp/bonzai-agent-autosaved.png',fullPage:true});
  // A disk failure retains the finished work; retrying completion never reruns inference.
  await page.evaluate(() => {
   let instance=document.querySelector('.is-agent-management').__vueParentComponent;
   while(instance && !instance.setupState.generateCustomCompanion) instance=instance.parent;
   const state=instance.setupState;
   state.modelAvailability.llm_nemomix_12b_heretic=true; state.modelAvailability.image_quality=true; state.modelAvailabilityChecked=true;
   window.electronAPI.db={companions:{replaceRoster:async()=>{throw new Error('disk full');}}};
   window.finishIdentity=null;window.finishPortrait=null;
   window.creation=state.generateCustomCompanion();
  });
  await page.waitForFunction(()=>typeof window.finishIdentity==='function');
  await page.evaluate(()=>window.finishIdentity());
  await page.waitForFunction(()=>typeof window.finishPortrait==='function');
  await page.evaluate(async()=>{window.finishPortrait();await window.creation;});
  await page.getByRole('button',{name:'Retry completion',exact:true}).waitFor();
  await page.evaluate(()=>delete window.electronAPI.db);
  await page.getByRole('button',{name:'Retry completion',exact:true}).click();
  await page.getByText('Saved on this device',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.identityRuns),2);

 } finally { await browser.close(); }
});


test('roleplay selects the first agent and stage and presents optional augmentations', {skip: !url, timeout: 45000}, async () => {
 const browser = await chromium.launch({channel:'chrome',headless:true});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  await page.addInitScript(() => localStorage.setItem('bonzai.onboarding.v4.completed','true'));
  await page.goto(url);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('bonzai:set-mode',{detail:'roleplay'})));
  await page.locator('.roleplay-audience').waitFor();
  const selection = await page.locator('.roleplay-audience').evaluate(el => {
   let component=el.__vueParentComponent;
   while(component && !component.setupState.selectedScenario) component=component.parent;
   const state=component.setupState;
   return { agent:state.selectedCompanion.id, firstAgent:state.companions[0].id, stage:state.selectedScenario.id, firstStage:state.scenarios[0].id };
  });
  assert.equal(selection.agent,selection.firstAgent); assert.equal(selection.stage,selection.firstStage);
  assert.equal(await page.locator('.roleplay-audience').getByRole('button',{name:'Conversation',exact:true}).count(),0);
  for(const name of ['Out of Office','Smart Workflows','Social Networks']) assert.equal(await page.locator('.roleplay-audience').getByRole('button',{name:new RegExp(name)}).count(),1);
 } finally { await browser.close(); }
});
