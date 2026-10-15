import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;

async function mount(page) {
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent(`<html data-theme="waveform"><head>
    <link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css">
    <link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fields.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css">
    <style>*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg);font-family:var(--bz-font-body)}#app{max-width:340px}</style>
    </head><body><div id="app"></div></body></html>`);
  await page.evaluate(async () => {
    window.localModels = new Set(); window.downloads = []; window.savedModels = []; window.failDownload = false; window.failSave = false;
    window.electronAPI = {
      systemInformation: async () => ({platform:'darwin',gpu:'Apple M1 Max',memBudget:22e9,ram:32e9}),
      checkModel: async name => window.localModels.has(name),
      downloadModel: async (url,name) => {
        window.downloads.push({url,name});
        if (window.holdDownload) return new Promise(resolve=>{window.releaseDownload=resolve;});
        if (window.failDownload) return {error:'offline'};
        window.localModels.add(name);return {savedPath:name};
      },
      cancelModelDownload: async () => { window.cancelled=true; window.releaseDownload?.({canceled:true}); },
      onDownloadProgress: () => () => {},
      ensureModel: () => { throw new Error('Choosing a worker model must not interrupt inference'); },
      loadModel: () => { throw new Error('Choosing a worker model must not load an engine'); },
    };
    const { createApp,h,reactive } = await import('/node_modules/.vite/deps/vue.js');
    const { default: Picker } = await import('/src/components/company/CompanyWorkerModel.vue');
    const source = await (await fetch('/src/components/company/CompanyWorkerModel.vue')).text();
    const i18nUrl = source.match(/from ["']([^"']*\/i18n\/index\.js(?:\?[^"']*)?)["']/)[1];
    const { i18n,createI18nPlugin } = await import(i18nUrl);i18n.setLocale('en');
    window.pickerState=reactive({model:'llm_qwen3_5_4b_q4',role:'CFO'});window.pickerI18n=i18n;
    window.pickerApp=createApp({render:()=>h(Picker,{modelValue:window.pickerState.model,roleKey:window.pickerState.role,roleLabel:'Finance',save:async key=>{if(window.failSave)throw new Error('Disk full');window.savedModels.push(key);},'onUpdate:modelValue':key=>{window.pickerState.model=key;}})}).use(createI18nPlugin());
    window.pickerApp.mount('#app');
  });
}

test('worker recommendation downloads once, persists only verified files, and never swaps active inference', {skip:!url,timeout:90000}, async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    const page=await browser.newPage({viewport:{width:1100,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await mount(page);
    assert.match(await page.locator('.worker-model-control').innerText(),/Qwen3.5 4B/,'legacy Q4 binding is named');
    const show=async()=>{await page.locator('.worker-model-control').click();await page.locator('.worker-model-recommendation').waitFor();};
    await show();assert.match(await page.locator('.worker-model-recommendation').innerText(),/Qwen3.5 9B/);
    await page.getByText('Not yet benchmarked in BonzAI.',{exact:true}).waitFor();
    await page.locator('.worker-model-evidence summary').click();
    assert.match(await page.locator('.worker-model-evidence').innerText(),/Financial reconciliation/);
    assert.equal(await page.locator('.worker-model-evidence a').getAttribute('href'),'https://huggingface.co/Qwen/Qwen3.5-9B');
    await page.evaluate(()=>window.failDownload=true);
    await page.getByRole('button',{name:'Download and use',exact:true}).click();await page.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(()=>window.pickerState.model),'llm_qwen3_5_4b_q4');assert.equal(await page.evaluate(()=>window.savedModels.length),0);
    await page.evaluate(()=>{window.failDownload=false;window.failSave=true;});
    await page.getByRole('button',{name:'Download and use',exact:true}).click();await page.getByRole('alert').filter({hasText:'Disk full'}).waitFor();
    assert.equal(await page.evaluate(()=>window.pickerState.model),'llm_qwen3_5_4b_q4','save failure leaves assignment unchanged');
    await page.evaluate(()=>window.failSave=false);
    await page.getByRole('button',{name:'Use this model',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.pickerState.model),'llm_qwen3_5_9b');assert.deepEqual(await page.evaluate(()=>window.savedModels),['llm_qwen3_5_9b']);
    const count=await page.evaluate(()=>window.downloads.length);
    await show();await page.getByRole('button',{name:'Use this model',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.downloads.length),count,'existing download reused');
    await page.evaluate(()=>{window.pickerState.role='DispatchCoordinator';window.localModels.clear();window.holdDownload=true;});
    await show();assert.match(await page.locator('.worker-model-recommendation').innerText(),/Qwen3.5 9B/);
    await page.getByRole('button',{name:'Download and use',exact:true}).click();await page.waitForFunction(()=>window.releaseDownload);
    await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.cancelled),true);assert.equal(await page.evaluate(()=>window.pickerState.model),'llm_qwen3_5_9b');
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});

test('manual model choice, unavailable hardware and translated narrow layouts stay usable', {skip:!url,timeout:90000},async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    const page=await browser.newPage({viewport:{width:1100,height:900}});await mount(page);
    await page.locator('.worker-model-control').click();await page.locator('.worker-model-recommendation').waitFor();
    await page.locator('.worker-model-evidence summary').click();
    for (const locale of ['en','fr','es','ja','ko','zh','ru']) for (const theme of ['waveform','light']) {
      await page.evaluate(({locale,theme})=>{window.pickerI18n.setLocale(locale);document.documentElement.dataset.theme=theme;},{locale,theme});
      await page.setViewportSize({width:390,height:780});
      const state=await page.locator('.worker-model-dialog').evaluate(el=>({width:el.scrollWidth,client:el.clientWidth,right:el.getBoundingClientRect().right,bottom:el.getBoundingClientRect().bottom,title:el.querySelector('h2').textContent,buttons:[...el.querySelectorAll('footer button')].map(b=>({width:b.scrollWidth,client:b.clientWidth,right:b.getBoundingClientRect().right}))}));
      assert.ok(state.width<=state.client&&state.right<=390&&state.bottom<=780,`${locale}/${theme}: modal fits`);
      assert.ok(state.buttons.every(b=>b.width<=b.client+1&&b.right<=378),`${locale}/${theme}: footer labels fit`);
      if(locale!=='en')assert.notEqual(state.title,'AI model',`${locale}: translated title`);
      if(locale!=='en')assert.doesNotMatch(await page.locator('.worker-model-facts').innerText(),/Download required/,`${locale}: download status translated`);
      if(locale!=='en')assert.doesNotMatch(await page.locator('.worker-model-evidence').innerText(),/Financial reconciliation|Publisher sources/,`${locale}: assessment translated`);
      if(locale==='fr' || locale==='ru')await page.screenshot({path:`/tmp/bonzai-worker-model-${locale}-${theme}-390.png`});
    }
    await page.evaluate(()=>window.pickerI18n.setLocale('en'));await page.setViewportSize({width:1100,height:900});
    await page.locator('.worker-model-manual summary').click();await page.getByRole('textbox',{name:'Search models'}).fill('Qwen3.5 4B');
    await page.locator('.worker-model-options button').filter({hasText:'Q4'}).first().click();
    assert.match(await page.locator('.worker-model-current').last().innerText(),/Qwen3.5 4B/);
    await page.screenshot({path:'/tmp/bonzai-worker-model-manual-desktop.png'});
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.evaluate(()=>{window.electronAPI.systemInformation=async()=>null;});await page.locator('.worker-model-control').click();
    await page.getByText('Device memory is unavailable. You can choose a model manually.',{exact:true}).waitFor();assert.equal(await page.locator('.worker-model-recommendation').count(),0);
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.evaluate(()=>{window.electronAPI.checkModel=async()=>{throw new Error('Disk unavailable');};});await page.locator('.worker-model-control').click();await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('footer .bz-btn--primary').isDisabled(),true,'cannot apply stale availability after a failed check');
  } finally {await browser.close();}
});

test('model-only changes preserve an active harness and its timers; next scheduled work uses the new binding', {skip:!url,timeout:60000},async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    const page=await browser.newPage();await page.goto(`${url}/src/assets/tokens.css`);
    const result=await page.evaluate(async()=>{
      const hb=await import('/src/services/company/heartbeat.js');
      const source=await(await fetch('/src/services/company/heartbeat.js')).text();
      const harness=await import(source.match(/from\s*["']([^"']*harness\.js[^"']*)/)[1]);
      let charter={id:'picker-runtime',name:'Test team',status:'active',mission:'Review records',roles:{CEO:{companion:'agent',llm:'old-model'}},rules:{external:'approval'}};
      let state=null, allowBegin=true;const starts=[];
      window.electronAPI={db:{companies:{get:async()=>structuredClone(charter)},automation:{recover:async()=>({recovered:0}),state:async()=>state,begin:async(id,input)=>{starts.push(input);if(!allowBegin)return {acquired:false,reason:'test'};state={leaseOwner:'r',leaseExpiresAt:Date.now()+60000};return {acquired:true,runId:'r',state};},renew:async()=>true,finish:async()=>{state=null;return{};}},issues:{recoverStale:async()=>({recovered:0})}}};
      const timers=[],cleared=[];const original={setInterval,clearInterval,setTimeout,clearTimeout};
      window.setInterval=(fn,ms)=>{timers.push({fn,ms});return timers.length;};window.setTimeout=window.setInterval;window.clearInterval=id=>cleared.push(id);window.clearTimeout=window.clearInterval;
      try{
        hb.start(charter);const run=await harness.beginHarness(charter,{lane:'ceo',triggerType:'manual'});const timerCount=timers.length,clearedCount=cleared.length;
        charter={...charter,roles:{CEO:{...charter.roles.CEO,llm:'new-model'}}};hb.start(charter);
        const keptTimers=timers.length===timerCount&&cleared.length===clearedCount, valid=await run.check(),oldModel=run.charter.roles.CEO.llm;
        run.dispose();state=null;allowBegin=false;
        await timers.find(t=>t.ms===60*60*1000).fn();
        const latest=await harness.captureHarness(charter);
        const scheduledNew=starts.at(-1).configurationRevision===latest.configurationRevision || starts.at(-1).harness?.configurationRevision===latest.configurationRevision;
        const before=cleared.length;charter={...charter,rules:{external:'deny'}};hb.start(charter);
        return {keptTimers,valid,oldModel,scheduledNew,started:starts.at(-1),policyRestarts:cleared.length>before};
      }finally{hb.stopAll();Object.assign(window,original);}
    });
    assert.ok(result.keptTimers);assert.equal(result.valid.ok,true);assert.equal(result.oldModel,'old-model');assert.ok(result.scheduledNew,JSON.stringify(result.started));assert.ok(result.policyRestarts);
  } finally {await browser.close();}
});
