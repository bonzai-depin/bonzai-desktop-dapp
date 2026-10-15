import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, compileStyle } from '@vue/compiler-sfc';
import { chromium } from 'playwright';

const url = process.env.BONZAI_UI_URL;

test('workflow production keeps one page scroll and reachable controls when an interactive task is resumed', { skip: !url, timeout: 90000 }, async () => {
  const source = await readFile(new URL('../src/components/SmartAgent.vue', import.meta.url), 'utf8');
  const { descriptor } = parse(source);
  const runtimeCSS = descriptor.styles.map(style => compileStyle({ source: style.content, id: 'data-v-runtime-scroll', scoped: style.scoped }).code).join('\n');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
    // Use the real nested chat layout and all SmartAgent styles, without loading
    // models or starting a generation in this isolated browser fixture.
    await page.route('**/src/components/SmartAgent.vue*', route => route.fulfill({ contentType: 'text/javascript', body: `
      import { h } from '/node_modules/.vite/deps/vue.js';
      import ChatLayout from '/src/components/chat/ChatLayout.vue';
      export default { __scopeId: 'data-v-runtime-scroll', props: ['companyWorkflowId'], render() {
        return h('div', {class:'bz-tab-shell bz-tab-shell--agent company-workflow-runtime'}, [h(ChatLayout, {class:'agent-command-center', messages:[],autoscroll:false}, {
          header:()=>h('p','Current task: create and review your result'),
          stream:()=>h('div',{class:'agent-command-stream'},[h('div',{class:'agent-mode-surface'},[
            h('div',{class:'agent-runner-view'},[h('div',[
              ...Array.from({length:24},(_,index)=>h('label',{style:'display:grid;gap:8px;padding-block:16px'},[
                'Scene '+(index+1),h('input',{class:'bz-input',value:'Source material for this scene'})
              ])),h('button',{class:'bz-btn bz-btn--primary','data-testid':'last-control'},'Save final scene')
            ])])])])
        })]);
      }};
    ` }));
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent(`<html><head>
      <link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css">
      <style>*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:var(--bz-canvas);color:var(--bz-fg)}.company-tab{height:100dvh;min-height:0;overflow:auto;padding:24px}.company-shell{min-height:100%;overflow:visible}.dash-body{height:auto;min-height:0;overflow:visible}</style>
      </head><body><div class="company-tab"><div class="company-shell"><div id="app" class="company-screen dash-body"></div></div></div></body></html>`);
    await page.addStyleTag({ content: runtimeCSS });
    await page.evaluate(async () => {
      window.electronAPI = { store: { get: async () => [] }, db: { companions: { list: async () => [] } } };
      const { createApp, h, reactive } = await import('/node_modules/.vite/deps/vue.js');
      const { skillService } = await import('/src/services/skill.service.js');
      skillService.initializeSkills = async () => {};
      skillService.getAllSkills = () => [{ id: 'test-scenes', name: 'Scene production', description: 'Turn your source material into a reviewed scene package.', inputs: {} }];
      const { smartAgentCatalog } = await import('/src/services/smartAgentCatalog.js');
      smartAgentCatalog.agents = [{ id: 'saved-agent', name: 'Maya' }];
      const { default: View } = await import('/src/components/company/CompanyWorkflowStudio.vue');
      const { createI18nPlugin } = await import('/src/i18n/index.js');
      const charter = reactive({ id: 'scroll-fixture', workspace: { executionWorkflowId: 'test-scenes' }, roles: { CEO: { companion: 'saved-agent' } } });
      const steps = status => [{ status, action: { workflowId: 'test-scenes', type: 'runWorkflow' } }];
      const state = reactive({ issues: [
        { id: 'continue', title: 'Prepare the client presentation with a detailed scene-by-scene package', status: 'blocked', assigneeRole: 'CEO', execution: { steps: steps('requires_input') } },
        { id: 'approval', title: 'Research brief awaiting approval', status: 'queued', execution: { steps: steps('waiting_approval') } },
        { id: 'running', title: 'Second scene', status: 'active', execution: { steps: steps('running') } },
        { id: 'done', title: 'Approved introduction', status: 'done', execution: { steps: steps('completed') } },
      ], catalog: [{ id:'result-1', title:'Approved introduction', pipeline:'text', meta:{workflowId:'test-scenes'} }, { id:'unrelated',title:'Another workflow result',meta:{workflowId:'different-workflow'}}] });
      window.fixture = { state, navigation: [] };
      createApp({ render: () => h(View, { charter, state, onOpenView: value => window.fixture.navigation.push(value) }) }).use(createI18nPlugin()).mount('#app');
    });
    await page.getByRole('heading', { name: 'Scene production' }).waitFor();
    assert.deepEqual(await page.locator('.workflow-studio__counts dd').allTextContents(), ['1', '2', '1']);
    assert.equal(await page.locator('.workflow-studio__results li').count(), 1, 'Only results of this workflow are listed');
    await page.getByRole('button', { name: /Research brief awaiting approval/ }).click();
    assert.deepEqual(await page.evaluate(() => window.fixture.navigation), ['approvals']);
    await page.getByRole('button', { name: /Prepare the client presentation/ }).click();
    await page.getByTestId('last-control').waitFor({ timeout: 10000 }).catch(async error => { throw new Error(`${error.message}\n${errors.join('\n')}\n${await page.locator('body').innerText()}`); });

    for (const [width, theme] of [[1440, 'waveform'], [390, 'waveform'], [390, 'light']]) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => { document.querySelector('.company-tab').scrollTop = 0; });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal page overflow');
      const streams = await page.locator('.company-workflow-runtime :is(.bz-chat__main,.bz-chat__stream)').evaluateAll(elements => elements.map(element => ({ overflow: getComputedStyle(element).overflowY, clipped: element.scrollHeight > element.clientHeight + 1 })));
      assert.ok(streams.every(item => item.overflow === 'visible' && !item.clipped), 'The embedded runtime grows with its content');
      await page.mouse.move(width / 2, 450);
      await page.mouse.wheel(0, 2000);
      await page.waitForFunction(() => document.querySelector('.company-tab').scrollTop > 100);
      assert.equal(await page.locator('.bz-chat__stream').evaluate(element => element.scrollTop), 0, 'Wheel scroll belongs to Company, not a nested stream');
      await page.getByTestId('last-control').scrollIntoViewIfNeeded();
      assert.equal(await page.getByTestId('last-control').isVisible(), true);
      const control = await page.getByTestId('last-control').boundingBox();
      // Browser scroll alignment rounds fractional CSS pixels at the viewport edge.
      assert.ok(control.y >= -1 && control.y + control.height <= 901, `The final workflow control is reachable at ${width}/${theme}: ${JSON.stringify(control)}`);
      await page.getByTestId('last-control').focus();
      assert.equal(await page.getByTestId('last-control').evaluate(element => element === document.activeElement), true);
      await page.evaluate(() => { document.querySelector('.company-tab').scrollTop = 0; });
      await page.screenshot({ path: `/tmp/bonzai-production-${width}-${theme}.png`, fullPage: false });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('browsing the same team preserves an opened interactive runtime and its unsaved input', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
    await page.route('**/src/components/SmartAgent.vue*', route => route.fulfill({ contentType: 'text/javascript', body: `
      import {h,ref,onMounted,onUnmounted} from '/node_modules/.vite/deps/vue.js';
      export default {props:['companyWorkflowId'],setup(){
        const draft=ref('');onMounted(()=>window.runtimeMounts++);onUnmounted(()=>window.runtimeUnmounts++);
        return()=>h('label',{'data-testid':'interactive-runtime'},['Scene brief',h('input',{value:draft.value,onInput:e=>draft.value=e.target.value})]);
      }};
    ` }));
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg)}</style></head><body><div id="app"></div></body></html>');
    await page.evaluate(async () => {
      window.runtimeMounts = 0; window.runtimeUnmounts = 0;
      window.electronAPI = { store: { get: async () => [] }, checkModel: async () => true, localExecutionStatus: async () => ({ loaded: 0, loading: 0, activeRequests: 0, activityComplete: true, observedAt: Date.now() }), db: { companions: { list: async () => [] }, teams: { list: async () => [], directory: async () => [], onChanged: () => () => {} } } };
      const {createApp,h,reactive} = await import('/node_modules/.vite/deps/vue.js');
      const {skillService} = await import('/src/services/skill.service.js');
      skillService.initializeSkills=async()=>{};
      skillService.getAllSkills=()=>[{id:'retained-workflow',name:'Retained workflow',description:'Create a scene package.'}];
      const {default:View} = await import('/src/components/company/CompanyDashboard.vue');
      const {default:store} = await import('/src/stores/companyStore.js');
      const {makeCharter} = await import('/src/services/company/charter.js');
      const {buildWorkspaceBlueprint} = await import('/src/services/company/workspaceBlueprints.js');
      const {createI18nPlugin,i18n} = await import('/src/i18n/index.js'); i18n.setLocale('en');
      const charter=reactive(makeCharter({id:'retain-test',name:'Retained production',roles:{CEO:{companion:'maya'}},workspace:buildWorkspaceBlueprint({executionWorkflowId:'retained-workflow'})}));
      const state=reactive({...store.state,issues:[{id:'interactive-task',title:'Retained task',status:'blocked',assigneeRole:'CEO',execution:{steps:[{status:'requires_input',action:{workflowId:'retained-workflow',type:'runWorkflow'}}]}}],audit:[],goals:[],catalog:[],approvals:[]});
      createApp({render:()=>h(View,{charter,state,initialView:'issues'})}).use(createI18nPlugin()).mount('#app');
    });
    const nav = page.getByRole('navigation', {name:'Team workspace'});
    await nav.waitFor();
    assert.equal(await page.locator('.workflow-studio').count(), 0, 'Production is lazy; other views do not initialize its runtime');
    await nav.getByRole('button', {name:'Workflow',exact:true}).click();
    await page.locator('.workflow-studio__task').filter({hasText:'Retained task'}).click();
    const input = page.getByTestId('interactive-runtime').locator('input');
    await input.fill('Keep these scene details while I inspect the task and deliverables.');
    for (const destination of ['Backlog', 'Results']) {
      await nav.getByRole('button', {name:destination,exact:true}).click();
      assert.equal(await page.getByTestId('interactive-runtime').isVisible(), false);
      assert.equal(await page.getByTestId('interactive-runtime').count(), 1, 'Interactive component remains mounted');
      assert.deepEqual(await page.evaluate(()=>[window.runtimeMounts,window.runtimeUnmounts]), [1,0]);
      await nav.getByRole('button', {name:'Workflow',exact:true}).click();
      await input.waitFor({state:'visible'});
      assert.equal(await input.inputValue(), 'Keep these scene details while I inspect the task and deliverables.');
    }
    assert.deepEqual(await page.evaluate(()=>[window.runtimeMounts,window.runtimeUnmounts]), [1,0]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
