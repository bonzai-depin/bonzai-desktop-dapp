import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;

async function frame(page) {
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent(`<html data-theme="waveform"><head>
    <link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css">
    <link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fields.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css">
    <style>*{box-sizing:border-box}body{margin:0;background:var(--bz-canvas);color:var(--bz-fg);font-family:var(--bz-font-body)}
    #shell{display:grid;grid-template-columns:240px minmax(0,1fr);height:100vh;overflow:hidden}
    .fixture-sidebar{background:var(--bz-panel);border-right:1px solid var(--bz-border);padding:24px}
    .bz-main{display:flex;flex-direction:column;min-width:0;height:100%;overflow:hidden}
    .fixture-runtime{height:50px;flex:0 0 50px;padding:14px 24px;background:var(--bz-panel)}
    .bz-main__workspace{position:relative;flex:1;min-height:0;overflow:hidden}
    .bz-tab-shell{display:flex;flex-direction:column;height:100%;width:100%;min-height:0;overflow:hidden}
    @media(max-width:800px){#shell{grid-template-columns:minmax(0,1fr)}.fixture-sidebar{display:none}}</style>
    </head><body><main id="shell"><aside class="fixture-sidebar">BonzAI</aside><section class="bz-main"><div class="fixture-runtime">Teams · Play mode</div><div id="app" class="bz-main__workspace"></div></section></main></body></html>`);
}

test('integrated company pages have one scroll owner, aligned actions and a usable client directory', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1780, height: 1010 } });
    page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await frame(page);
    await page.evaluate(async () => {
      const source = await fetch('/src/components/Company.vue').then(r => r.text());
      const runtime = source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
      const { createApp, h, reactive, computed } = await import(runtime);
      const gmao = Object.fromEntries(['clients','sites','assets','plans','workOrders','procurements','quotes','invoices','documents','events','notifications','handoffs','outbox','documentIntake','serviceContracts','rates','attachmentSheets','suppliers','subcontractors'].map(key => [key, []]));
      gmao.clients = [{ id: 'client', name: 'DEFENSE', contactName: 'Facilities team', email: 'test@example.invalid' }];
      gmao.sites = Array.from({ length: 10 }, (_, i) => ({ id: 'site'+i, clientId: 'client', name: 'Technical site '+(i+1), commune: 'Fort-de-France' }));
      const purchase = { requests: [], reviews: [], suppliers: [], items: [], equipment: [], invoices: [] };
      window.electronAPI = {
        workspace: { status: async () => ({ unlocked: true }) }, store: { get: async (_key, fallback) => fallback ?? [] },
        localExecutionStatus: async () => ({ loaded: 1, activeRequests: 0, observedAt: Date.now() }),
        onModelChanged: () => () => {},
        db: { companions: { list: async () => [] }, teams: { list: async () => [], directory: async () => [], onChanged: () => () => {} },
          purchasing: { snapshot: async () => purchase, onChanged: () => () => {} },
          gmao: { snapshot: async () => gmao }, gmaoMaintenance: { snapshot: async () => ({ records: [], obligations: [], workOrders: [] }), onChanged: () => () => {} },
          companyIntake: { snapshot: async () => ({ counts: [], sources: [], mailboxes: [] }), onChanged: () => () => {} },
        },
      };
      const { default: View } = await import('/src/components/Company.vue');
      const { default: store } = await import('/src/stores/companyStore.js');
      const { makeCharter } = await import('/src/services/company/charter.js');
      const { buildWorkspaceBlueprint } = await import('/src/services/company/workspaceBlueprints.js');
      const { i18n, createI18nPlugin } = await import('/src/i18n/index.js'); i18n.setLocale('en');
      const companies = ['purchasing','hvac'].map(profile => ({ ...makeCharter({ name: profile==='hvac'?'GMAO':'Purchasing team', mission: 'Coordinate supplier requests and receipts. Read requests with team.readConversation and reply with team.reply.', roles: { CEO: { companion: 'fixture' } } }), id: profile, status: 'paused', workspace: buildWorkspaceBlueprint({profile}) }));
      const state = reactive({ ...store.state, ready: true, companies, activeId: 'purchasing', gmao, issues: [], audit: [], goals: [], approvals: [], catalog: [], connectors: [] });
      store.state = state; store.activeCompany = computed(() => state.companies.find(c => c.id === state.activeId));
      store.init = async () => {}; store.refreshActive = async () => {}; store.setActive = async id => { state.activeId = id; };
      window.layoutFixture = { state, i18n };
      createApp({ render: () => h(View) }).use(createI18nPlugin()).mount('#app');
    });
    const nav = page.getByRole('navigation', { name: 'Team workspace' }); await nav.waitFor();
    await nav.getByRole('button', { name: 'Today', exact: true }).click();
    assert.doesNotMatch(await page.locator('.today-brief').innerText(), /team\.readConversation|team\.reply/);

    async function layout(name, selector) {
      await page.locator('.company-tab').evaluate(el => { el.scrollTop = 0; });
      await page.mouse.move(2, 2);
      await page.waitForTimeout(250);
      const metrics = await page.evaluate(selector => {
        const box = document.querySelector('.company-channel-head').getBoundingClientRect();
        const section = document.querySelector(selector).getBoundingClientRect();
        const inner = document.querySelector('.dash-body');
        const owner = document.querySelector('.company-tab');
        return { offset: Math.abs(box.left-section.left), innerOverflow: getComputedStyle(inner).overflowY, pageOverflow: document.documentElement.scrollWidth > innerWidth,
          ownerBottom: owner.getBoundingClientRect().bottom, viewport: innerHeight,
          scrollColor: getComputedStyle(owner).scrollbarColor,
          controls: [...document.querySelectorAll(`${selector} .bz-btn, ${selector} .bz-iconbtn`)].filter(el => el.offsetWidth).map(el => ({ right: el.getBoundingClientRect().right, edge: owner.getBoundingClientRect().right })) };
      }, selector);
      assert.equal(metrics.innerOverflow, 'visible', `${name}: no competing inner scroll area`);
      assert.equal(metrics.pageOverflow, false, `${name}: no horizontal page overflow`);
      assert.ok(metrics.offset < 2, `${name}: content aligns with page heading (${metrics.offset}px)`);
      assert.ok(metrics.ownerBottom <= metrics.viewport+1, `${name}: scroll owner fits beneath the runtime bar`);
      assert.notEqual(metrics.scrollColor, 'auto', `${name}: scrollbars use the current theme`);
      assert.ok(metrics.controls.every(b => b.right <= b.edge-12), `${name}: actions have a right gutter`);
      await page.screenshot({ path: `/tmp/bonzai-layout-${name}-${page.viewportSize().width}.png` });
    }
    for (const theme of ['waveform', 'light']) for (const width of [1780, 1100, 600]) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.setViewportSize({ width, height: 1010 });
      await nav.getByRole('button', { name: 'Inbox', exact: true }).click();
      await layout('inbox', '.inbox-workspace');
      assert.equal(await page.locator('.inbox-empty').count(), 1);
      assert.equal(await page.locator('.inbox-queue').count(), 0);
      await nav.getByRole('button', { name: 'Purchasing', exact: true }).click();
      await layout('purchasing', '.buy-workspace');
      assert.equal(await page.getByRole('button', { name: 'New request', exact: true }).count(), 1);
      await page.screenshot({ path: `/tmp/bonzai-purchasing-${theme}-${width}.png` });
    }
    await page.evaluate(() => { document.documentElement.dataset.theme = 'waveform'; });
    await page.setViewportSize({ width: 1780, height: 1010 });
    await page.getByLabel('Team navigation', { exact: true }).getByRole('button', { name: 'GMAO', exact: true }).click();
    await nav.getByRole('button', { name: 'Clients', exact: true }).click();
    await layout('clients', '.operations');
    const sizes = await page.locator('.ops-client-grid').evaluate(el => ({ grid: el.clientWidth, card: el.firstElementChild.clientWidth, sites: [...el.querySelectorAll('.ops-site')].map(n => n.getBoundingClientRect().y) }));
    assert.ok(sizes.card > sizes.grid*.9, 'one client uses the available width');
    assert.ok(new Set(sizes.sites).size < 10, 'sites form a readable directory, not one long narrow column');
    await nav.getByRole('button', { name: 'Operations settings', exact: true }).click();
    await layout('settings', '.operations');
    const alignment = await page.locator('.control-heading').evaluate(el => ({ select: el.querySelector('select').getBoundingClientRect().bottom, button: el.querySelector('button').getBoundingClientRect().bottom }));
    assert.ok(Math.abs(alignment.select-alignment.button)<2, 'site and refresh align on their control baseline');
    await page.locator('.company-tab').evaluate(el => { el.scrollTop = el.scrollHeight; });
    assert.ok(await page.locator('.company-tab').evaluate(el => el.scrollTop > 0), 'long settings remain scrollable');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('email intake uses provider consent, cancellation and explicit import activation without credential fields', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.setDefaultTimeout(10000); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await frame(page);
    await page.evaluate(async () => {
      const src = await fetch('/src/components/company/CompanyIntake.vue').then(r=>r.text());
      const runtime=src.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
      const {createApp,h}=await import(runtime);
      const f=window.mailFixture={connections:[],mailboxes:[],calls:[],ready:true};
      window.electronAPI={companyConnector:{
        oauthStatus:async()=>({ready:f.ready}),
        configureOAuth:async()=>{f.ready=true;return {ready:true};},
        authorizeOAuth:input=>{f.calls.push(input);return new Promise((resolve,reject)=>{f.finish=()=>{const c=f.connections.find(c=>c.id===input.connectorId);c.status='active';c.accountIdentifier='owner@example.invalid';resolve({ok:true,account:c.accountIdentifier});};f.reject=reject;});},
        cancelOAuth:async()=>{f.cancelled=true;f.reject?.(new Error('Provider authorization cancelled.'));},
      },db:{
        audit:{append:async()=>({id:'audit'})},
        connectors:{list:async()=>f.connections,create:async(team,c)=>{const row={...c,id:c.kind,status:'needs_auth'};f.connections.push(row);return row;}},
        companyIntake:{snapshot:async()=>({counts:[],sources:[],mailboxes:f.mailboxes}),saveMailbox:async(team,input)=>{f.mailboxes=[input];f.enabled=input;},onChanged:()=>()=>{}},
      }};
      const {default:View}=await import('/src/components/company/CompanyIntake.vue');
      const {createI18nPlugin,i18n}=await import('/src/i18n/index.js');i18n.setLocale('en');f.i18n=i18n;
      createApp({render:()=>h(View,{companyId:'team'})}).use(createI18nPlugin()).mount('#app');
    });
    await page.getByRole('button',{name:'Mailboxes',exact:true}).click();
    await page.getByRole('button',{name:'Connect Gmail',exact:true}).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    assert.equal(await dialog.locator('input:visible').count(),0,'standard sign-in asks for no IDs, email or tokens');
    await dialog.getByRole('button',{name:'Continue with Google',exact:true}).click();
    await dialog.getByText('Finish signing in in your browser. This window will update automatically.').waitFor();
    await page.evaluate(()=>window.mailFixture.finish());
    await dialog.waitFor({state:'detached'});
    await page.getByText('owner@example.invalid',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.mailFixture.mailboxes.length),0,'consent alone does not start reading mail');
    await page.getByRole('switch',{name:'Enable import',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.mailFixture.enabled.enabled),true);
    assert.deepEqual(await page.evaluate(()=>window.mailFixture.calls[0]),{companyId:'team',connectorId:'gmail'});
    await page.getByRole('button',{name:'Connect Outlook',exact:true}).click();
    await dialog.getByRole('button',{name:'Continue with Microsoft',exact:true}).click();
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    await dialog.waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>window.mailFixture.connections.find(c=>c.kind==='outlook_mail').status),'needs_auth');
    await page.evaluate(()=>{window.mailFixture.ready=false;});
    await page.getByRole('button',{name:'Connect Outlook',exact:true}).click();
    await dialog.getByText('Provider sign-in needs one-time administrator setup.',{exact:true}).waitFor();
    assert.equal(await dialog.locator('input:visible').count(),0);
    assert.equal(await dialog.getByRole('button',{name:'Continue with Microsoft',exact:true}).isDisabled(),true);
    for(const locale of ['fr','es','ja','ko','zh','ru']) {
      await page.evaluate(locale=>window.mailFixture.i18n.setLocale(locale),locale);
      await page.setViewportSize({width:390,height:850});
      const bounds=await dialog.boundingBox();assert.ok(bounds.width<390 && bounds.x>=10);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:`/tmp/bonzai-provider-${locale}.png`});
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
