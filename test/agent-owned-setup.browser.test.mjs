import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('creation retains the owned slot and uses matching stage headings',{skip:!url,timeout:45000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.addInitScript(()=>localStorage.setItem('bonzai.onboarding.v4.completed','true'));
 await page.goto(url);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bonzai:set-mode',{detail:'agent'})));
 const view=page.locator('.is-agent-management');await view.waitFor();
 const styles=await view.evaluate(el=>['.agent-creation-heading h2','.agent-next h2'].map(selector=>{const s=getComputedStyle(el.querySelector(selector));return [s.fontSize,s.lineHeight];}));
 assert.deepEqual(styles[0],styles[1]);
 await page.evaluate(async()=>{
  const source=await fetch('/src/components/skills/RoleplayChat.vue').then(r=>r.text());
  const path=source.match(/from ["']([^"']*companionToken\.service\.js[^"']*)["']/)[1];
  const {default:service}=await import(path);
  const slot={chainId:4663,contractAddress:'0x0000000000000000000000000000000000000001',tokenId:'42',ready:false};
  service.getOwnedAgentSlots=async()=>[slot];
  let instance=document.querySelector('.is-agent-management').__vueParentComponent;
  while(instance && !instance.exposed?.prepareOwnedSlot)instance=instance.parent;
  if(!instance)throw new Error('Creation setup API missing');
  await instance.exposed.prepareOwnedSlot(slot);
 });
 await page.getByText('Agent #42 · Generate → Saved automatically → Publish identity → Launch token',{exact:true}).waitFor();
 assert.match(await view.locator('.agent-next').innerText(), /#42/);
 assert.equal(await view.getByRole('button',{name:'Find my slots',exact:true}).count(),0);
 assert.equal(await page.locator('#agent-creation-prompt').evaluate(el=>el===document.activeElement),true);
 await page.screenshot({path:'/tmp/bonzai-owned-slot-setup.png'});
 await page.setViewportSize({width:600,height:1000});
 const narrow=await view.evaluate(el=>['.agent-creation-heading h2','.agent-next h2'].map(selector=>getComputedStyle(el.querySelector(selector)).fontSize));
 assert.equal(narrow[0],narrow[1]);
 }finally{await browser.close();}
});
