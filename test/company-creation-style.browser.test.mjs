import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.BONZAI_UI_URL;

test('company entry screens preserve setup drafts and keyboard access across themes and widths', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent(`<html><head>
      <link rel="stylesheet" href="/src/assets/page-layout.css"><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css">
      <link rel="stylesheet" href="/src/assets/fields.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css">
      <style>html,body,#app{height:100%;min-height:0}body{margin:0;position:relative;background:var(--bz-canvas);color:var(--bz-fg);font-family:"Fira Sans",sans-serif}*{box-sizing:border-box}</style>
      </head><body><main id="app"></main></body></html>`);
    await page.evaluate(async () => {
      const agents = [{ id: 'fixture-coordinator', name: 'Alex Martin', firstName: 'Alex', familyName: 'Martin', shortBio: 'Coordinates local company work.' }];
      window.electronAPI = { workspace: {status:async()=>({unlocked:true,test:true})},
        localExecutionStatus: async () => ({ loaded: 0, loading: 0, activeRequests: 0, activityComplete: true, observedAt: Date.now() }),
        onModelChanged: () => () => {},
        store: { get: async (_key, fallback) => fallback ?? [] },
        db: { companions: { list: async () => agents }, teams: { list: async () => [], directory: async () => [], onChanged: () => () => {} } },
      };
      const moduleSource=await fetch('/src/components/company/CompanyIntakeWizard.vue').then(r=>r.text());
 const vueRuntime=moduleSource.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
 const { createApp, h, reactive, computed } = await import(vueRuntime);
      const { default: View } = await import('/src/components/Company.vue');
      const { default: store } = await import('/src/stores/companyStore.js');
      const { makeCharter } = await import('/src/services/company/charter.js');
      const { i18n, createI18nPlugin } = await import('/src/i18n/index.js');
      i18n.setLocale('en');
      const companies = ['Martin Operations', 'Martin Purchasing'].map((name, index) => ({
        ...makeCharter({ name, mission: index ? 'Track supplier quotations and delivery dates.' : 'Prepare verified customer proposals.', roles: { CEO: { companion: 'fixture-coordinator' } } }),
        id: `fixture-team-${index}`, status: 'paused',
      }));
      const state = reactive({ ...store.state, ready: true, companies, activeId: companies[0].id, audit: [], approvals: [], issues: [], goals: [], catalog: [], connectors: [] });
      store.state = state;
      store.activeCompany = computed(() => state.companies.find(company => company.id === state.activeId));
      store.init = async () => {};
      store.refreshActive = async () => {};
      store.setActive = async id => { state.activeId = id; };
      store.loadAllTeamWork = async () => state.companies.map(company => ({ company, issues: [], approvals: [], goals: [], catalog: [], audit: [] }));
      window.creationFixture = { state, templateCalls: [], manualCalls: [], i18n };
      store.formFromTemplate = async (...args) => { window.creationFixture.templateCalls.push(args); throw new Error('Fixture storage is unavailable'); };
      store.form = async config => { window.creationFixture.manualCalls.push(config); throw new Error('Fixture storage is unavailable'); };
      store.createConnectorForCompany = async () => {};
      store.createGoalForCompany = async () => {};
      createApp({ render: () => h(View) }).use(createI18nPlugin()).mount('#app');
    });
    await page.getByRole('button', { name: 'My workflows', exact: true }).click();
    await page.getByRole('navigation', { name: 'Team workspace' }).waitFor();
    await page.getByRole('button', { name: 'Martin Purchasing', exact: true }).click();
    assert.equal(await page.evaluate(() => window.creationFixture.state.activeId), 'fixture-team-1', 'team switch selects the requested workspace');
    await page.getByRole('button', { name: 'My workflows', exact: true }).click();
    await page.getByRole('region', { name: 'My workflows', exact: true }).waitFor();
    assert.equal(await page.locator('.team-portfolio__card').count(),2,'the overview shows every team and its work queues');
    await page.locator('.all-room__activity > summary').click();
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});
      await page.locator('.all-composer').scrollIntoViewIfNeeded();
      assert.ok(await page.getByRole('button',{name:'Brief teams',exact:true}).isVisible(),'instructions remain reachable after the team overview');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'portfolio fits the viewport');
      await page.locator('.team-portfolio').scrollIntoViewIfNeeded();
      await page.screenshot({path:`/tmp/bonzai-team-portfolio-${width}.png`,animations:'disabled'});
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.getByLabel('Team navigation', {exact:true}).getByRole('button', { name: 'Martin Operations', exact: true }).click();

    async function capture(stage) {
      const themes = ['default', 'light', ...(['shell', 'selected'].includes(stage) ? ['terminal', 'mistral', 'blueprint', 'popcanvas'] : [])];
      for (const theme of themes) for (const width of (['default', 'light'].includes(theme) ? [1440, 390] : [1440])) {
        await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => document.querySelector('.company-tab')?.scrollTo({ top: 0, behavior: 'instant' }));
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          // Compare the settled theme, not a light-to-dark surface midway through its transition.
          await Promise.race([Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))),new Promise(resolve=>setTimeout(resolve,1500))]);
        });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${stage}/${theme}/${width}: no page overflow`);
        if (stage === 'shell' && width === 1440) {
          const sendVisible = await page.getByRole('button', { name: 'Brief the team', exact: true }).evaluate(button => {
            const box = button.getBoundingClientRect();
            const atCenter = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return box.width > 0 && box.height > 0 && box.top >= 0 && box.bottom <= innerHeight
              && box.left >= 0 && box.right <= innerWidth && (atCenter === button || button.contains(atCenter));
          });
          assert.ok(sendVisible, `${theme}: the chat send control is visible without scrolling the company workspace`);
        }
        if (stage === 'context') {
          const contrast = await page.locator('.setup-fields .wiz-field > label').evaluateAll(labels => labels.map(label => {
            const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number)
              .map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; })
              .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
            const foreground = luminance(getComputedStyle(label).color);
            const background = luminance(getComputedStyle(label.closest('.wiz')).backgroundColor);
            return { label: label.textContent.trim(), color: getComputedStyle(label).color, background: getComputedStyle(label.closest('.wiz')).backgroundColor, ratio: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) };
          }));
          assert.ok(contrast.length > 0, 'setup fields have readable labels');
          for (const result of contrast) assert.ok(result.ratio >= 4.5, `${theme}/${width}: field ${result.label} is readable (${result.ratio.toFixed(2)} contrast; ${result.color} on ${result.background})`);
        }
        await page.screenshot({ path: `/tmp/bonzai-company-entry-${stage}-${theme}-${width}.png`, fullPage: false, animations: 'disabled' });
        const overflow = await page.evaluate(() => [...document.querySelectorAll('.company-tab, .wiz')].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({class:element.className,width:element.clientWidth,scroll:element.scrollWidth,children:[...element.querySelectorAll('*')].filter(child => child.getBoundingClientRect().right > innerWidth + 1).slice(0,8).map(child => ({tag:child.tagName,class:child.className,width:child.getBoundingClientRect().width,right:child.getBoundingClientRect().right}))})));
        assert.deepEqual(overflow, [], `${stage}/${theme}/${width}: the workspace and dialog fit their viewport`);
      }
    }
    async function keyboardFocus(locator) {
      await locator.focus();
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => {
        const element = document.activeElement;
        if (!element || element === document.body) return false;
        const style = getComputedStyle(element);
        const ownRing = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        const parent = element.closest('label');
        const parentStyle = parent && getComputedStyle(parent);
        const focusBorder = style.borderColor;
        const framed = parseFloat(style.borderWidth) > 0 && style.borderStyle !== 'none';
        element.blur();
        const restingBorder = getComputedStyle(element).borderColor;
        element.focus();
        return ownRing || (parentStyle && parentStyle.outlineStyle !== 'none' && parseFloat(parentStyle.outlineWidth) > 0)
          || (framed && focusBorder !== restingBorder);

      }), 'the next keyboard control has a visible focus indicator');
    }
    await page.getByRole('navigation', { name: 'Team workspace' }).getByRole('button', {name:'Chat',exact:true}).click();
    await capture('shell');
    await keyboardFocus(page.getByRole('button', { name: 'Martin Operations', exact: true }));
    await page.getByRole('button', { name: 'New workflow', exact: true }).click();
    const wizard = page.locator('[role="dialog"][aria-labelledby="company-intake-title"]');
    await wizard.waitFor();
    await capture('purpose');
    const catalogBounds = await wizard.boundingBox();
    assert.ok(catalogBounds.width > (page.viewportSize().width - 80), 'template browsing uses the available screen width');
    assert.equal(await wizard.locator('.workflow-card').count(), 31, 'all existing templates are discoverable without a hidden More button');
    await page.evaluate(() => window.creationFixture.i18n.setLocale('fr'));
    await wizard.locator('.template-search input').fill('cloture');
    assert.equal(await wizard.locator('.workflow-card').count(), 1);
    assert.match(await wizard.locator('.workflow-card').innerText(), /Comptabilité et clôture/);
    await wizard.locator('.template-search input').fill('');
    await page.evaluate(() => window.creationFixture.i18n.setLocale('en'));

    await wizard.locator('.workflow-card').filter({ hasText: 'Purchasing' }).click();
    await capture('selected');
    await wizard.getByRole('button', { name: 'Next', exact:true }).click();
    await page.getByLabel('Business name *', { exact: true }).fill('Martin Services');
    assert.match(await wizard.locator('.setup-note').innerText(), /approve sensitive actions/i);
    await page.getByLabel('How do you handle this work today? (optional)', { exact: true }).fill('Review supplier quotes every Tuesday before placing any order.');
    await capture('context');
    await wizard.getByRole('button', { name: 'Next', exact:true }).click();
    await wizard.locator('.review-intro h2').waitFor();
    assert.match(await wizard.locator('.review-intro h2').innerText(), /Martin Services/);
    await capture('review');
    await wizard.getByRole('button', { name: 'Back', exact:true }).click();
    assert.equal(await page.getByLabel('Business name *', { exact: true }).inputValue(), 'Martin Services');
    assert.match(await wizard.locator('.setup-note').innerText(), /approve sensitive actions/i);
    assert.match(await page.getByLabel('How do you handle this work today? (optional)', { exact: true }).inputValue(), /every Tuesday/);
    await wizard.getByRole('button', { name: 'Next', exact:true }).click();
    await wizard.getByRole('button', { name: /Open workspace/ }).click();
    await wizard.getByRole('alert').filter({ hasText: 'Fixture storage is unavailable' }).waitFor();
    await wizard.getByRole('button', { name: 'Back', exact:true }).click();
    assert.equal(await page.getByLabel('Business name *', { exact: true }).inputValue(), 'Martin Services', 'failed creation preserves the setup draft');
    await page.keyboard.press('Escape');
    await wizard.waitFor({ state: 'detached' });
    assert.ok(await page.getByRole('button', { name: 'New workflow', exact: true }).evaluate(element => element === document.activeElement), 'closing the wizard restores focus to its trigger');
    assert.equal(await page.evaluate(() => window.creationFixture.state.companies.length), 2, 'a failed create cannot add a misleading workspace');

    await page.evaluate(() => { window.creationFixture.state.companies = []; window.creationFixture.state.activeId = null; });
    await page.getByRole('heading', { name: 'What would you like to make happen?', exact: true }).waitFor();
    await capture('onboarding');
    await page.getByRole('button', { name: 'Build a custom team', exact: true }).click();
    await page.getByRole('heading', { name: /Build a custom team/ }).waitFor();
    await page.getByLabel('Team name', { exact: true }).fill('Martin workshop operations');
    const mission = page.getByLabel('What should this team achieve?', { exact: true });
    await mission.fill('Prepare verified estimates and weekly supplier follow-ups.');
    const coordinator = page.locator('.role-row').filter({ hasText: 'Coordinator' }).locator('.col-companion select').first();
    await coordinator.selectOption('fixture-coordinator');
    await page.getByText('Advanced configuration',{exact:true}).click();
    await capture('manual');
    await keyboardFocus(page.getByLabel('Team name', { exact: true }));
    await page.getByRole('button', { name: /Create a smart workflow/, exact: false }).click();
    await page.getByText('Fixture storage is unavailable', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Team name', { exact: true }).inputValue(), 'Martin workshop operations');
    assert.equal(await mission.inputValue(), 'Prepare verified estimates and weekly supplier follow-ups.');
    assert.equal(await coordinator.inputValue(), 'fixture-coordinator', 'failed creation retains the selected smart agent');
    assert.equal(await page.evaluate(() => window.creationFixture.manualCalls[0].roles.CEO.companion), 'fixture-coordinator');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
