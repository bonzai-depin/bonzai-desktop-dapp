import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileStyle} from '@vue/compiler-sfc';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('chat shell preserves gutters; training icons retain their accent', {skip:!url},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const page=await browser.newPage();
 await page.goto(url+'/src/assets/tokens.css');
 const source=fs.readFileSync('src/components/GenerativeText.vue','utf8');
 let header=source.match(/<div class="bz-text-chat__head bz-page-header">[\s\S]*?<\/template>/)[0].replace('</template>','').replace(/{{[\s\S]*?}}/g,'Qwen3.5 27B MTP').replace(/\s(?:v-[\w:-]+|:[\w-]+|@[\w.-]+)="[^"]*"/g,'');
 const css=['GenerativeText.vue','GenerativeTraining.vue','SmartAgent.vue','chat/ChatLayout.vue'].flatMap(file=>[...fs.readFileSync('src/components/'+file,'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>compileStyle({source:m[1],id:'data-v-review',scoped:true}).code)).join('\n');
 await page.setContent(`<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/page-layout.css"><style>${css}body{margin:0}</style>${header}<header class="bz-page-header bz-train__hero"><div><h1 class="bz-train__title"><span class="bz-title-icon">training</span>Tune</h1></div></header>`);
 await page.locator('*').evaluateAll(nodes=>nodes.forEach(n=>n.setAttribute('data-v-review','')));
 for(const theme of ['midnight','light']) {
 await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 for(const width of [1440,600,375]) {
 await page.setViewportSize({width,height:900});
 const layout=await page.evaluate(()=>{const h=document.querySelector('.bz-text-chat__head'),title=h.querySelector('h1'),model=h.querySelector('.bz-text-chat__model'),icon=document.querySelector('.bz-train__title .bz-title-icon');return {padding:parseFloat(getComputedStyle(h).paddingLeft),title:title.getBoundingClientRect().x,model:model.getBoundingClientRect().x,iconColor:getComputedStyle(icon).color,iconFill:getComputedStyle(icon).webkitTextFillColor,overflow:document.documentElement.scrollWidth>innerWidth+1};});
 assert.ok(layout.padding>=20);assert.ok(layout.title>=80);assert.equal(layout.iconColor,layout.iconFill);assert.equal(layout.overflow,false,JSON.stringify({width,...layout}));
 if(width===1440) assert.ok(layout.model-layout.title<150,'model should sit beside Chat');
 }
 }
 await page.screenshot({path:'/tmp/bonzai-chat-header-check.png'});
 }finally{await browser.close()}
});
