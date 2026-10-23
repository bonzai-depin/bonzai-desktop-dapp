import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse,compileTemplate,compileStyle} from '@vue/compiler-sfc';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('3D prompt stays editable and matches settings height across themes',{skip:!url,timeout:60000},async()=>{
 const {descriptor}=parse(fs.readFileSync(new URL('../src/components/Generative3D.vue',import.meta.url),'utf8'));
 const template=descriptor.template.content;const panel=template.slice(template.indexOf('<div class="three-controls-layout"'),template.indexOf('<!-- VIEWER -->'));
 const code=compileTemplate({source:panel,filename:'Controls.vue',id:'layout-check',scoped:true}).code.replace('from "vue"',`from "${url}/node_modules/.vite/deps/vue.js"`);
 const css=descriptor.styles.map(s=>compileStyle({source:s.content,filename:'Controls.vue',id:'data-v-layout-check',scoped:true}).code).join('\n');
 const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1200,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
 await page.goto(`${url}/src/assets/tokens.css`);await page.setContent('<link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><div id="test" style="padding:24px"></div>');await page.addStyleTag({content:css});
 await page.evaluate(async({code})=>{
 const {createApp}=await import('/node_modules/.vite/deps/vue.js');const {render}=await import(URL.createObjectURL(new Blob([code],{type:'text/javascript'})));const {default:GenerativeInput}=await import('/src/components/generative/GenerativeInput.vue');
 createApp({__scopeId:'data-v-layout-check',render,components:{GenerativeInput},data:()=>({workspaceTab:'generate',isLoading:false,needsDownload:false,downloads:{active:false},currentModel:{modelname:'OpenRouter · Selected model'},creationMode:'object',objectInputMode:'prompt',referenceImage:null,form:{prompt:''},isModel:true,lastGeneratedCode:'',presentation:'studio',lightingPresets:['Sunrise','Day','Afternoon','Sunset','Night'].map(label=>({id:label,label})),weatherOptions:['Clear','Clouds','Rain','Storm','Snow','Fog'].map(label=>({id:label,label})),performancePresets:['Low','Medium','High','Ultra'].map(label=>({id:label,label})),currentTime:'Day',currentWeather:'Clear',currentPerformance:'High'}),methods:{onSubmit(){},removeReferenceImage(){},setTimeOfDay(){},setWeather(){},setPerformance(){}}}).mount('#test');
 },{code});
 for(const [width,theme] of [[1200,'default'],[1200,'mistral'],[390,'mistral']]){
 await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
 await page.locator('textarea').fill('A miniature Japanese garden with a stone bridge');
 await page.evaluate(()=>document.fonts.ready);
 const boxes=await page.locator('.three-controls-layout > .models__activity--payouts, .three-controls-layout .environment-controls').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));if(width>760)assert.ok(Math.abs(boxes[0]-boxes[1])<1,JSON.stringify(boxes));
 await page.screenshot({path:`/tmp/bonzai-3d-controls-${width}-${theme}.png`,fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,JSON.stringify(await page.locator('#test *').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().right>innerWidth).map(n=>({tag:n.tagName,cls:n.className,width:n.getBoundingClientRect().width})).slice(0,10))));
 await page.screenshot({path:`/tmp/bonzai-3d-controls-${width}-${theme}.png`,fullPage:true});
 }assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
