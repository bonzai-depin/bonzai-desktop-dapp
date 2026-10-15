import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('shared calendar preserves local dates, constraints, Vue bindings and stable field geometry',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1100,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
 await page.goto(`${url}/src/assets/tokens.css`);
 await page.setContent('<html data-theme="midnight"><head><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fields.css"><style>body{background:var(--bz-canvas);padding:20px} input{border:1px solid var(--bz-border);padding:12px;background:var(--bz-panel);color:var(--bz-fg)} input:hover{box-shadow:0 0 0 4px gold;transition:all .5s}</style></head><body><div id="app"></div></body></html>');
 await page.evaluate(async()=>{
 const source=await fetch('/src/components/BzDatePicker.vue').then(r=>r.text());const vue=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
 const {createApp,h,ref}=await import(vue);const {default:Picker}=await import('/src/components/BzDatePicker.vue');
 const {default:Modal}=await import('/src/components/company/GmaoDialog.vue');const modal=ref(false);window.openTestModal=()=>modal.value=true;
 const date=ref('2026-10-02'),time=ref('2026-10-02T13:42');window.values={date,time};
 const app=createApp({render:()=>h('main',{},[h(Picker),modal.value?h(Modal,{title:'Work order',onClose:()=>modal.value=false},{default:()=>h('div',{class:'ops-form'},[h('input',{id:'modal-date',type:'date',value:date.value,onInput:e=>date.value=e.target.value}),h('input',{id:'modal-text',type:'text',class:'bz-field-input'})])}):null,h('label',{},['Date',h('input',{id:'date',type:'date',min:'2026-10-01',max:'2026-11-30',value:date.value,onInput:e=>date.value=e.target.value})]),h('label',{},['Appointment',h('input',{id:'datetime',type:'datetime-local',min:'2026-10-02T12:00',max:'2026-10-31T18:00',value:time.value,onInput:e=>time.value=e.target.value})]),h('input',{id:'disabled',type:'date',disabled:true}),h('input',{id:'readonly',type:'date',readOnly:true}),h('input',{id:'text',type:'text',class:'bz-field-input'})])});app.config.globalProperties.$t=key=>key;app.mount('#app');
 });
 const dialog=page.locator('.bz-calendar');
 const apply=()=>dialog.getByRole('button',{name:'Apply',exact:true}).click();
 const cancel=()=>dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.locator('#date').click();await dialog.waitFor();
 assert.equal(await dialog.locator('[data-date="2026-09-30"]').isDisabled(),true);
 await dialog.locator('[data-date="2026-10-15"]').click();
 assert.equal(await page.locator('#date').inputValue(),'2026-10-02','date selection stays a draft');
 await page.mouse.click(5,5);await page.keyboard.press('Escape');
 assert.equal(await dialog.count(),1,'outside clicks and Escape preserve the draft');
 await apply();assert.equal(await page.evaluate(()=>window.values.date.value),'2026-10-15');assert.equal(await dialog.count(),0);
 await page.locator('#datetime').click();await dialog.waitFor();
 assert.equal(await dialog.locator('input[type=time]').count(),0,'no native time sub-popup');
 await dialog.getByLabel('Hour',{exact:true}).fill('14');await dialog.getByLabel('Minute',{exact:true}).fill('30');
 await dialog.locator('[data-date="2026-10-06"]').click();
 await page.mouse.click(5,5);await page.locator('#date').click();
 assert.equal(await dialog.getByLabel('Hour',{exact:true}).inputValue(),'14');
 assert.equal(await page.locator('#datetime').inputValue(),'2026-10-02T13:42');
 await cancel();assert.equal(await page.locator('#datetime').inputValue(),'2026-10-02T13:42','Cancel discards both date and time');
 await page.locator('#datetime').click();await dialog.getByLabel('Hour',{exact:true}).fill('11');await apply();
 assert.equal(await dialog.getByRole('alert').count(),1,'min datetime still enforced');
 await dialog.getByLabel('Hour',{exact:true}).fill('14');await dialog.getByLabel('Minute',{exact:true}).fill('30');
 await dialog.getByRole('button',{name:'Increase Minute',exact:true}).click();
 await apply();assert.equal(await page.evaluate(()=>window.values.time.value),'2026-10-02T14:31');
 await page.locator('#date').click();await dialog.getByRole('button',{name:'Clear',exact:true}).click();
 assert.equal(await page.locator('#date').inputValue(),'2026-10-15','Clear also waits for Apply');await cancel();
 for(const theme of ['midnight','light','waveform']) {
 await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
 const input=page.locator('#text'),before=await input.boundingBox();
 for(let i=0;i<3;i++){await input.hover();assert.deepEqual(await input.boundingBox(),before);assert.equal(await input.evaluate(el=>getComputedStyle(el).boxShadow),'none');await page.mouse.move(1,1);assert.equal(await input.evaluate(el=>getComputedStyle(el).boxShadow),'none');}
 }
 await page.setViewportSize({width:390,height:650});await page.locator('#datetime').click();
 const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0 && bounds.x+bounds.width<=390 && bounds.y+bounds.height<=650);
 await page.screenshot({path:'/tmp/bonzai-time-picker.png'});await cancel();
 await page.evaluate(()=>window.openTestModal());await page.locator('.ops-dialog').waitFor();await page.locator('#modal-date').click();
 assert.equal(await dialog.evaluate(el=>el.matches(':popover-open')),true);
 assert.equal(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true);
 await dialog.locator('[data-date="2026-10-20"]').click();await page.mouse.click(5,5);await page.keyboard.press('Escape');
 assert.equal(await dialog.count(),1);assert.equal(await page.locator('.ops-dialog').evaluate(el=>el.open),true);
 await apply();assert.equal(await page.locator('#modal-date').inputValue(),'2026-10-20');assert.equal(await page.locator('.ops-dialog').evaluate(el=>el.open),true);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
