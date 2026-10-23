import {chromium} from 'playwright';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const url = process.env.BONZAI_UI_URL;
test('music studio keeps real faders functional and fits desktop and narrow views', {skip:!url,timeout:60000}, async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
const page=await browser.newPage({viewport:{width:1440,height:1100}});
page.on('pageerror',e=>console.log('PAGE',e.message));
await page.route('**/health',r=>r.fulfill({json:{status:'ok'}}));
await page.goto(url + '/src/assets/tokens.css');
await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/page-layout.css"><style>body{margin:0;background:var(--bz-canvas);color:var(--bz-fg)} #app{height:100vh}</style><div id="app"></div>');
const hash = JSON.parse(fs.readFileSync('node_modules/.vite/deps/_metadata.json','utf8')).browserHash;
await page.evaluate(async(hash)=>{
window.lyricsInstalled=false;
window.electronAPI={store:{get:async(k,d)=>d},getSettings:async()=>({}), checkModel:async()=>window.lyricsInstalled, downloadModel:async()=>{window.lyricsInstalled=true;}};
const {createApp}=await import('/node_modules/.vite/deps/vue.js?v='+hash);
const {createPinia}=await import('/node_modules/.vite/deps/pinia.js?v='+hash);
const {createI18nPlugin}=await import('/src/i18n/index.js');
const {default:Audio}=await import('/src/components/GenerativeAudio.vue');
window.audioPreview=createApp(Audio).use(createPinia()).use(createI18nPlugin()).mount('#app');
window.audioPreview.mode='music';
},hash);
await page.waitForSelector('.music-workspace');
await page.locator('#audio-lyricsTheme').fill('A summer road trip');
const draft=page.getByRole('button',{name:/Draft lyrics/});
assert.equal(await draft.isDisabled(),true);
await page.evaluate(()=>{window.audioPreview.readiness.ok=true;window.audioPreview.readiness.authRequired=false;window.audioPreview.musicCaption='Gentle piano instrumental';});
assert.equal(await page.evaluate(()=>window.audioPreview.canGenerate),true,'manual or instrumental music must not require the optional lyrics LLM');
await page.locator('.bz-download-requirement').filter({hasText:'Lyrics writer'}).getByRole('button',{name:'Download',exact:true}).click();
await page.waitForFunction(()=>window.audioPreview.lyricsModelReady);
assert.equal(await draft.isDisabled(),false,'boolean model-check must enable the lyrics writer after download');
await page.evaluate(()=>{
 window.electronAPI.getModelInfo=async()=>({loaded:false});
 window.electronAPI.loadModel=async model=>{window.lyricsLoadedModel=model;};
 window.electronAPI.chat=async(prompt,options)=>{window.lyricsRequest={prompt,options};return '<think>private</think>[verse]\nThe last train carries your name';};
});
await draft.click();
await page.waitForFunction(()=>window.lyricsRequest);
const lyricRun=await page.evaluate(()=>({model:window.lyricsRequest.options.model,request:window.lyricsRequest,lyrics:window.audioPreview.musicLyrics}));
assert.equal(lyricRun.model.filename,'qwen3.5-9b-ud-q4_k_xl.gguf');
assert.equal(lyricRun.model.context,8192);
assert.equal(lyricRun.request.options.maxTokens,2048);
assert.match(lyricRun.request.prompt,/second verse must reveal something new/);
assert.doesNotMatch(lyricRun.lyrics,/think|private/);
assert.equal(await page.evaluate(()=>window.audioPreview.durationFromLyrics),true);
const estimated=await page.evaluate(()=>window.audioPreview.musicDuration);
assert.equal(await page.locator('.params-grid > .music-duration-estimate').count(),0,'estimate must not occupy a fader column');
assert.equal(await page.locator('.music-duration-estimate').count(),1);
await page.evaluate(()=>window.audioPreview.musicBPM=60);
await page.waitForFunction(()=>window.audioPreview.musicDuration>10);
assert.ok(await page.evaluate(()=>window.audioPreview.musicDuration)>=estimated);
await page.locator('#audio-musicDuration').evaluate(el=>{el.value='180';el.dispatchEvent(new Event('input',{bubbles:true}));});
await page.evaluate(()=>window.audioPreview.musicBPM=100);
assert.equal(await page.evaluate(()=>window.audioPreview.musicDuration),180,'manual duration is retained');


await page.evaluate(()=>document.documentElement.dataset.theme='midnight');
await page.screenshot({path:'/tmp/bonzai-music-studio.png',fullPage:true});
await page.locator('#audio-musicBPM').focus();
const before = await page.locator('#audio-musicBPM').inputValue();
await page.keyboard.press('ArrowUp');
assert.notEqual(await page.locator('#audio-musicBPM').inputValue(), before);
assert.equal(await page.evaluate(()=>window.audioPreview.musicBPM), Number(await page.locator('#audio-musicBPM').inputValue()));
for(const theme of ['midnight','light']) {
 await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 for(const width of [1440,600,375]) {await page.setViewportSize({width,height:1000}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
}

}finally {await browser.close()}

});
