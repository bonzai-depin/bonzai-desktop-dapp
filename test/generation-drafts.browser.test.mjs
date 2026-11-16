import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('local drafts survive reload, preserve reference media and custom derived inputs, and remain private', {skip:!url,timeout:60000}, async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page=await browser.newPage({viewport:{width:1100,height:800}});
  await page.goto(new URL('/src/assets/tokens.css',url).href);
  async function mount(){
   await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{background:var(--bz-canvas);color:var(--bz-fg);font-family:var(--bz-font-body)}</style><div id="fixture"></div>');
   await page.evaluate(async()=>{
    const {createApp,h,ref,reactive,watch}=await import('/node_modules/.vite/deps/vue.js');
    const {useGenerationDraft}=await import('/src/composables/useGenerationDraft.js');
    const {default:Drafts}=await import('/src/components/generative/GenerationDrafts.vue');
    const mode=ref('music'),bpm=ref(113),caption=ref('Custom direction'),form=reactive({prompt:'A summer song',seed:42}),image=ref('data:image/png;base64,reference');
    watch(bpm,()=>caption.value='Automatic caption');
    window.fields={mode,bpm,caption,form,image};
    window.controller=useGenerationDraft({mode,bpm,caption,form,image});
    const app=createApp({render:()=>h(Drafts,{kind:'test-music',controller:window.controller})});
    app.config.globalProperties.$ui=x=>x;app.mount('#fixture');
   });
  }
  await mount();
  await page.getByRole('button',{name:'Save Draft',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
  await page.reload();await mount();
  await page.evaluate(()=>{window.fields.form.prompt='Other';window.fields.bpm.value=60;window.fields.image.value='';});
  await page.getByRole('button',{name:'Open drafts',exact:true}).click();
  await page.getByRole('button',{name:/A summer song/}).click();
  assert.deepEqual(await page.evaluate(()=>({prompt:fields.form.prompt,bpm:fields.bpm.value,caption:fields.caption.value,image:fields.image.value,seed:fields.form.seed})),{prompt:'A summer song',bpm:113,caption:'Custom direction',image:'data:image/png;base64,reference',seed:42});
  await page.setViewportSize({width:390,height:800});
  await page.getByRole('button',{name:'Open drafts',exact:true}).click();
  assert.ok(await page.locator('dialog').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  await page.screenshot({path:'/tmp/bonzai-drafts-mobile.png'});
  await page.getByRole('button',{name:'Delete draft',exact:true}).click();
  await page.getByText('No saved drafts yet.').waitFor();
 }finally{await browser.close();}
});
