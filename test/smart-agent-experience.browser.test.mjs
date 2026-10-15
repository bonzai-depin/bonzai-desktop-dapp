import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.BONZAI_UI_URL;

test('Agents opens the existing generator beside its preview and preserves canonical skills and token state', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      // Observe the real canvas renderer without replacing its drawing behavior.
      for (const method of ['clearRect', 'fill', 'fillText']) {
        const original = CanvasRenderingContext2D.prototype[method];
        CanvasRenderingContext2D.prototype[method] = function (...args) {
          if (this.canvas.closest('.agent-preview-spending')) {
            const audit = this.canvas.__spendingChartAudit ||= { labels: [], dataFills: 0 };
            if (method === 'clearRect') { audit.labels = []; audit.dataFills = 0; }
            if (method === 'fillText') { audit.labels.push(args[0]); audit.labelColor = this.fillStyle; }
            if (method === 'fill') audit.dataFills++;
          }
          return original.apply(this, args);
        };
      }
      localStorage.setItem('bonzai.onboarding.v4.completed', 'true');
      if (!localStorage.getItem('roleplayCompanions')) localStorage.setItem('roleplayCompanions', JSON.stringify([{
        id: 'default-hidden', name: 'Default Agent Should Stay Hidden', age: 28,
        gender: 'female', isDefault: true, isCustom: false, assignedWorkflowIds: [],
      }, {
        id: 'custom-issued', name: 'Maya Studio', firstName: 'Maya', familyName: 'Studio',
        age: 28, gender: 'female', isCustom: true, description: 'An issued agent',
        tokenId: 0, tokenAddress: '0x0000000000000000000000000000000000000001',
        agentWallet: '0x0000000000000000000000000000000000000002', tokenSymbol: 'ISSUED',
        network: 'robinhood', assignedWorkflowIds: [],
      }, {
        id: 'custom-pending', name: 'Pending Agent', firstName: 'Pending', familyName: 'Agent',
        age: 28, gender: 'female', isCustom: true, description: 'An issuance awaiting confirmation',
        launchStatus: 'pending', txHash: '0x' + '1'.repeat(64), network: 'robinhood', assignedWorkflowIds: [],
      }]));
    });
    // Available local models, without downloading or invoking native inference.
    await page.route('http://localhost:*/pipelines/plan', route => route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' }, body: JSON.stringify({ ok: true }),
    }));
    await page.goto(url);
    await page.evaluate(async () => {
      // Use the renderer's exact module URL so Vite HMR cannot split the mock and component instances.
      const roleplaySource = await (await fetch('/src/components/skills/RoleplayChat.vue')).text();
      const flagshipUrl = roleplaySource.match(/from ["']([^"']*flagship\.js[^"']*)["']/)[1];
      const { roleplayCompanion } = await import(flagshipUrl);
      window.electronAPI = {
        ...(window.electronAPI || {}),
        checkModel: async () => true,
        inferenceRequest: async (pipeline, payload) => {
          window.__agentPortraitRequest = { pipeline, payload };
          return { ok: true, result: { image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' } };
        },
      };
      roleplayCompanion.execution.generateCompanionProgressive = async input => {
        if (window.__failNextAgentGeneration) {
          window.__failNextAgentGeneration = false;
          input.onProgress({ phase: 'identity', message: 'Creating your agent...', companion: { id: 'incomplete-profile', name: 'Incomplete identity' } });
          throw new Error('Local generation unavailable');
        }
        window.__agentGenerationInput = { description: input.description, gender: input.gender, style: input.style };
        const companion = {
          id: 'custom-maya', name: 'Maya Studio', firstName: 'Maya', familyName: 'Studio',
          age: 28, gender: input.gender, isCustom: true, description: 'Product photographer',
          appearance: 'An adult product photographer with dark hair.',
          personality: 'Creative, patient', shortBio: 'Prepares weekly product campaigns.',
          spendingHabits: { education: 8, entertainment: 5, fashion: 6, finance: 4, food: 7, healthcare: 5, housing: 6, beauty: 3, reading: 9, social: 7, travel: 6, sports: 4 },
          assignedWorkflowIds: [],
        };
        window.__sendAgentProgress = input.onProgress;
        input.onProgress({ phase: 'identity', message: 'Creating your agent...', companion: { name: companion.name } });
        await new Promise(resolve => { window.__finishAgentGeneration = resolve; });
        return companion;
      };
    });
    await page.getByRole('button', { name: 'Agents', exact: true }).click();
    const management = page.locator('.is-agent-management');
    await management.waitFor();
    const creator = management.locator('.custom-companion-form');
    const editor = management.locator('.companion-creation-editor');
    const preview = management.locator('.custom-companion-preview');
    await creator.waitFor();
    await preview.waitFor();
    assert.equal(await creator.getByRole('region', { name: 'Token issuance and liquidity pool' }).isVisible(), true);
    const spendingChart = preview.locator('.agent-preview-spending canvas');
    await spendingChart.waitFor();
    await page.waitForFunction(() => document.querySelector('.agent-preview-spending canvas')?.__spendingChartAudit?.labels.length >= 12);
    const placeholderChart = await spendingChart.evaluate(canvas => canvas.__spendingChartAudit);
    assert.deepEqual(placeholderChart.labels, ['Education', 'Entertainment', 'Fashion', 'Finance', 'Food', 'Healthcare', 'Housing', 'Beauty', 'Reading', 'Social', 'Travel', 'Sports'], 'The placeholder reuses the existing companion chart categories');
    assert.equal(placeholderChart.dataFills, 0, 'An ungenerated agent has no invented spending plot');
    assert.equal(await preview.locator('.agent-preview-spending').getAttribute('data-profile'), 'placeholder');
    assert.equal(await management.locator('.smart-agent-studio, .studio-skills, .companion-grid .companion-card').count(), 0);
    assert.equal(await management.getByRole('button', { name: /^(Create smart agent|Import|Export)( |$)/i }).count(), 0);
    assert.equal(await management.getByText('Default Agent Should Stay Hidden', { exact: true }).count(), 0);
    assert.equal(await creator.locator('select[aria-label="Agent gender"]').count(), 1);
    assert.equal(await creator.locator('select[aria-label="Personality style"]').count(), 1);
    const { initialEditor, initialPreview } = await page.evaluate(() => ({
      initialEditor: document.querySelector('.companion-creation-editor').getBoundingClientRect().toJSON(),
      initialPreview: document.querySelector('.custom-companion-preview').getBoundingClientRect().toJSON(),
    }));
    assert.ok(initialPreview.x >= initialEditor.x + initialEditor.width - 1, 'The placeholder card sits beside the form on desktop');
    assert.ok(Math.abs(initialPreview.y - initialEditor.y) < 16, 'Form and placeholder start together');
    const generate = creator.getByRole('button', { name: /(?:^|\s)Generate$/ });
    assert.equal(await generate.isDisabled(), true, 'An empty prompt cannot start generation');

    const savedAgents = creator.getByRole('combobox', { name: 'Saved smart agents', exact: true });
    assert.ok(!(await savedAgents.locator('option').allTextContents()).some(name => name.includes('Default Agent')));
    await savedAgents.selectOption('custom-issued');
    assert.equal(await creator.getByRole('button', { name: 'View token', exact: true }).count(), 0, 'Imported token IDs without collection and chain proof are not verified identities');
    assert.equal(await creator.getByRole('button', { name: 'Review token issuance', exact: true }).count(), 0);
    await savedAgents.selectOption('custom-pending');
    assert.equal(await creator.getByRole('button', { name: 'Check issuance', exact: true }).count(), 1);
    assert.equal(await creator.getByRole('button', { name: 'Review token issuance', exact: true }).count(), 0);
    await savedAgents.selectOption('');

    const prompt = creator.getByRole('textbox', { name: 'Describe your smart agent', exact: true });
    await prompt.fill('An art director who creates product campaigns.');
    await page.evaluate(() => { window.__failNextAgentGeneration = true; });
    await generate.click();
    await creator.locator('.bz-notice--danger').filter({ hasText: 'Local generation unavailable' }).waitFor();
    assert.equal(await prompt.inputValue(), 'An art director who creates product campaigns.', 'Generation failure keeps the brief for retry');
    assert.equal(await preview.isVisible(), true, 'The preview placeholder remains visible after a generation failure');
    assert.equal(await preview.getByText('Incomplete identity', { exact: true }).count(), 0, 'A failed generation discards the incomplete identity');
    assert.equal(await preview.getByRole('button', { name: /(?:^|\s)Save$/ }).count(), 0, 'Partial identity from a failed generation cannot be saved');
    await generate.click();
    await preview.getByText('Maya Studio', { exact: true }).waitFor();
    assert.match(await preview.innerText(), /Creating your agent/);
    assert.equal(await spendingChart.evaluate(canvas => canvas.__spendingChartAudit.dataFills), 0, 'A partial identity does not invent a spending profile');
    assert.equal(await preview.getAttribute('aria-busy'), 'true', `Progressive state: ${await creator.getByRole('button').allTextContents()}`);
    assert.equal(await creator.locator('.agent-generate-actions > .bz-btn--agent-cta').isDisabled(), true);
    assert.equal(await preview.getByRole('button', { name: /(?:^|\s)Save$/ }).count(), 0, 'Partial generation cannot be saved');
    await page.evaluate(() => {
      window.__stoppedGenerationFinish = window.__finishAgentGeneration;
      window.__stoppedGenerationProgress = window.__sendAgentProgress;
    });
    await creator.getByRole('button', { name: 'Stop', exact: true }).click();
    assert.equal(await preview.getAttribute('aria-busy'), 'false');
    await prompt.fill('An art director who creates product campaigns.');
    await generate.click();
    await page.evaluate(() => {
      try { window.__stoppedGenerationProgress({ companion: { name: 'Stale cancelled identity' } }); } catch {}
      window.__stoppedGenerationFinish();
    });
    assert.equal(await preview.getByText('Stale cancelled identity').count(), 0, 'Stopped generation cannot overwrite the new preview');
    assert.equal(await preview.getAttribute('aria-busy'), 'true', 'Stopped generation cannot clear a newer generation status');
    assert.equal(await page.evaluate(() => window.__agentPortraitRequest), undefined, 'Stopped generation does not start portrait inference');
    await page.evaluate(() => window.__finishAgentGeneration());
    const save = preview.getByRole('button', { name: /(?:^|\s)Save$/ });
    await save.waitFor();
    await preview.locator('.companion-preview-img').waitFor();
    await page.waitForFunction(() => document.querySelector('.agent-preview-spending canvas')?.__spendingChartAudit?.dataFills > 0);
    assert.equal(await preview.locator('.agent-preview-spending').getAttribute('data-profile'), 'generated');
    assert.deepEqual(await page.evaluate(() => window.__agentGenerationInput), {
      description: 'An art director who creates product campaigns.', gender: 'female', style: 'openness',
    });
    const portraitRequest = await page.evaluate(() => window.__agentPortraitRequest);
    assert.equal(portraitRequest.pipeline, 'image_quality', 'Keep the actual companion portrait mechanism');
    assert.equal(portraitRequest.payload.width, 768);
    assert.equal(portraitRequest.payload.height, 768);

    await preview.locator('.companion-workflow-skills summary').click();
    const options = preview.locator('.companion-workflow-option');
    await options.first().waitFor();
    assert.doesNotMatch((await options.allTextContents()).join(' '), /Notion|HubSpot|Shopify|Stripe|QuickBooks/);
    await options.filter({ hasText: 'Video Captioning' }).locator('input').check();
    await save.click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('roleplayCompanions')).find(c => c.id === 'custom-maya')?.assignedWorkflowIds.includes('video-captioning-v1.0.0'));
    const issuedAfterSave = await page.evaluate(() => JSON.parse(localStorage.getItem('roleplayCompanions')).find(c => c.id === 'custom-issued'));
    assert.equal(issuedAfterSave.name, 'Maya Studio');
    assert.equal(issuedAfterSave.tokenId, 0, 'A new same-named agent must not overwrite an issued identity');
    assert.equal(issuedAfterSave.tokenSymbol, 'ISSUED');
    assert.equal(await creator.isVisible(), true, 'Saving keeps the creation experience open');
    assert.equal(await preview.getByText('Maya Studio', { exact: true }).isVisible(), true);
    assert.equal(await creator.getByRole('button', { name: 'Review token issuance', exact: true }).count(), 0);
    assert.equal(await creator.getByText(/Saving or importing a local agent does not mint/).isVisible(), true);

    let previousChartLabelColor;
    for (const theme of ['default', 'light']) {
      await page.evaluate(async theme => {
        const { themeService } = await import('/src/services/theme.service.js');
        themeService.set(theme);
      }, theme);
      await page.waitForFunction(() => {
        const canvas = document.querySelector('.agent-preview-spending canvas');
        const probe = document.createElement('canvas').getContext('2d');
        probe.fillStyle = getComputedStyle(canvas).getPropertyValue('--bz-fg-mid').trim();
        return canvas.__spendingChartAudit.labelColor === probe.fillStyle;
      });
      const chartLabelColor = await spendingChart.evaluate(canvas => canvas.__spendingChartAudit.labelColor);
      if (previousChartLabelColor) assert.notEqual(chartLabelColor, previousChartLabelColor, 'Chart labels redraw for the selected light/dark theme');
      previousChartLabelColor = chartLabelColor;
      for (const width of [1280, 800, 600]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}: creator overflows the window`);
        await page.waitForFunction(() => document.querySelector('#bonzai').classList.contains('sidebar-compact') === (innerWidth <= 1024));
        const { editorBounds, previewBounds } = await page.evaluate(() => ({
          editorBounds: document.querySelector('.companion-creation-editor').getBoundingClientRect().toJSON(),
          previewBounds: document.querySelector('.custom-companion-preview').getBoundingClientRect().toJSON(),
        }));
        const beside = previewBounds.x >= editorBounds.x + editorBounds.width - 1;
        const stacked = previewBounds.y >= editorBounds.y + editorBounds.height - 1;
        assert.ok(beside || stacked, `${theme}/${width}: the form and card never overlap`);
        if (width === 1280) assert.ok(beside, `${theme}: desktop card sits beside the form`);
        if (width === 600) assert.ok(beside, `${theme}: constrained workspace preserves the three stages with horizontal scrolling`);
        if (process.env.BONZAI_UI_SCREENSHOTS) await page.screenshot({ path: `${process.env.BONZAI_UI_SCREENSHOTS}/agent-creation-${theme}-${width}.png`, fullPage: true });
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    await page.getByRole('button', { name: 'Agents', exact: true }).click();
    await savedAgents.waitFor();
    await savedAgents.selectOption('custom-maya');
    assert.equal(await preview.locator('.companion-workflow-option').filter({ hasText: 'Video Captioning' }).locator('input').isChecked(), true, 'Workflow assignment survives reloading the canonical roster');
    await creator.getByRole('button', { name: /Add to company/ }).click();
    await page.getByRole('button', { name: 'Choose smart agents', exact: true }).click();
    assert.ok((await page.locator('select option').allTextContents()).some(value => value.includes('Maya Studio')), 'The same saved companion is selectable for company teams');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('an unread saved roster blocks writes until retry recovers it without losing existing agents', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('bonzai.onboarding.v4.completed', 'true'));
    await page.route('http://localhost:*/pipelines/plan', route => route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' }, body: JSON.stringify({ ok: true }),
    }));
    await page.goto(url);
    const original = {
      id: 'existing-unread-agent', name: 'Existing issued agent', age: 28, gender: 'female', isCustom: true,
      tokenId: 0, tokenSymbol: 'KEEP', tokenAddress: '0x0000000000000000000000000000000000000001',
      assignedWorkflowIds: ['roleplay-companion-v1.0.0'],
    };
    await page.evaluate(async existing => {
      localStorage.setItem('roleplayCompanions', JSON.stringify([existing]));
      window.__rosterReadable = false;
      window.__companionWrites = 0;
      window.electronAPI = {
        ...(window.electronAPI || {}),
        checkModel: async () => true,
        store: {
          get: async (key, fallback) => {
            if (key === 'roleplayCompanions' && !window.__rosterReadable) throw new Error('Saved agents are temporarily unavailable');
            const raw = localStorage.getItem(key);
            return raw == null ? fallback : JSON.parse(raw);
          },
          set: async (key, value) => {
            if (key === 'roleplayCompanions') window.__companionWrites++;
            localStorage.setItem(key, JSON.stringify(value));
          },
        },
        inferenceRequest: async () => ({ ok: true, result: { image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' } }),
      };
      // Use the renderer's exact module URL so Vite HMR cannot split the mock and component instances.
      const roleplaySource = await (await fetch('/src/components/skills/RoleplayChat.vue')).text();
      const flagshipUrl = roleplaySource.match(/from ["']([^"']*flagship\.js[^"']*)["']/)[1];
      const { roleplayCompanion } = await import(flagshipUrl);
      roleplayCompanion.execution.generateCompanionProgressive = async ({ onProgress }) => {
        const companion = {
          id: 'new-agent-after-read-error', name: 'New generated agent', age: 28, gender: 'female', isCustom: true,
          description: 'Creates useful product campaigns.', personality: 'Creative, thoughtful',
          appearance: 'An adult creative director.', assignedWorkflowIds: [],
        };
        onProgress({ phase: 'identity', message: 'Creating your agent...', companion });
        return companion;
      };
    }, original);
    await page.getByRole('button', { name: 'Agents', exact: true }).click();
    const management = page.locator('.is-agent-management');
    const loadError = management.getByRole('alert').filter({ hasText: 'Unable to load your saved agents' });
    await loadError.waitFor();
    assert.equal(await management.locator('.companion-grid .companion-card').count(), 0, 'A read failure cannot seed a replacement roster');
    assert.equal(await management.getByRole('combobox', { name: 'Saved smart agents' }).count(), 0);
    const creator = management.locator('.custom-companion-form');
    const preview = management.locator('.custom-companion-preview');
    await creator.getByRole('textbox', { name: 'Describe your smart agent', exact: true }).fill('A creative director for product campaigns.');
    await creator.getByRole('button', { name: /(?:^|\s)Generate$/ }).click();
    const save = preview.getByRole('button', { name: /(?:^|\s)Save$/ });
    await save.waitFor();
    assert.equal(await save.isDisabled(), true, 'An unread roster cannot be replaced with the newly generated agent');
    await preview.locator('.companion-workflow-skills summary').click();
    const caption = preview.locator('.companion-workflow-option').filter({ hasText: 'Video Captioning' }).locator('input');
    assert.equal(await caption.isDisabled(), true, 'Workflow edits cannot write an unread roster');
    assert.equal(await page.evaluate(() => window.__companionWrites), 0);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('roleplayCompanions'))), [original]);

    await page.evaluate(() => { window.__rosterReadable = true; });
    await loadError.getByRole('button', { name: /Retry/i }).click();
    await loadError.waitFor({ state: 'detached' });
    await management.getByRole('combobox', { name: 'Saved smart agents' }).locator('option[value="existing-unread-agent"]').waitFor({ state: 'attached' });
    assert.equal(await preview.getByText('New generated agent', { exact: true }).isVisible(), true, 'Retry preserves the generated preview');
    assert.equal(await save.isEnabled(), true);
    await caption.check();
    await save.click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('roleplayCompanions')).some(c => c.id === 'new-agent-after-read-error'));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('roleplayCompanions')));
    assert.equal(saved.length, 2);
    assert.deepEqual(saved.find(c => c.id === original.id), original, 'Recovery and save retain the existing issued agent unchanged');
    assert.deepEqual(saved.find(c => c.id === 'new-agent-after-read-error').assignedWorkflowIds, ['video-captioning-v1.0.0']);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('leaving generation or resetting during save cannot revive an abandoned preview', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('bonzai.onboarding.v4.completed', 'true'));
    await page.route('http://localhost:*/pipelines/plan', route => route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' }, body: JSON.stringify({ ok: true }),
    }));
    await page.goto(url);
    await page.evaluate(async () => {
      window.__deferProfile = true;
      window.__portraitRequests = 0;
      window.electronAPI = {
        ...(window.electronAPI || {}),
        checkModel: async () => true,
        store: {
          get: async (key, fallback) => {
            const raw = localStorage.getItem(key);
            return raw == null ? fallback : JSON.parse(raw);
          },
          set: async (key, value) => {
            if (key === 'roleplayCompanions' && window.__delayRosterSave) {
              await new Promise(resolve => { window.__finishRosterSave = resolve; });
            }
            localStorage.setItem(key, JSON.stringify(value));
          },
        },
        inferenceRequest: async () => {
          window.__portraitRequests++;
          return { ok: true, result: { image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' } };
        },
      };
      // Use the renderer's exact module URL so Vite HMR cannot split the mock and component instances.
      const roleplaySource = await (await fetch('/src/components/skills/RoleplayChat.vue')).text();
      const flagshipUrl = roleplaySource.match(/from ["']([^"']*flagship\.js[^"']*)["']/)[1];
      const { roleplayCompanion } = await import(flagshipUrl);
      roleplayCompanion.execution.generateCompanionProgressive = async ({ onProgress }) => {
        const companion = {
          id: 'generation-race-agent', name: 'Generated race agent', age: 28, gender: 'female', isCustom: true,
          description: 'Creates useful product campaigns.', personality: 'Creative, thoughtful',
          appearance: 'An adult creative director.', assignedWorkflowIds: [],
        };
        onProgress({ phase: 'identity', message: 'Creating your agent...', companion });
        if (window.__deferProfile) await new Promise(resolve => { window.__finishProfile = resolve; });
        window.__profileReturned = true;
        return companion;
      };
    });
    await page.getByRole('button', { name: 'Agents', exact: true }).click();
    const management = page.locator('.is-agent-management');
    const creator = management.locator('.custom-companion-form');
    const preview = management.locator('.custom-companion-preview');
    const prompt = creator.getByRole('textbox', { name: 'Describe your smart agent', exact: true });
    await prompt.fill('A creative director for product campaigns.');
    await creator.getByRole('button', { name: /(?:^|\s)Generate$/ }).click();
    await preview.getByText('Generated race agent', { exact: true }).waitFor();
    assert.equal(await preview.getAttribute('aria-busy'), 'true');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: 'chat' })));
    await management.waitFor({ state: 'detached' });
    await page.evaluate(() => window.__finishProfile());
    await page.waitForFunction(() => window.__profileReturned);
    assert.equal(await page.evaluate(() => window.__portraitRequests), 0, 'Leaving Agents prevents a late profile result from starting portrait inference');

    await page.evaluate(() => { window.__deferProfile = false; window.__delayRosterSave = true; });
    await page.getByRole('button', { name: 'Agents', exact: true }).click();
    await prompt.fill('A creative director for product campaigns.');
    await creator.getByRole('button', { name: /(?:^|\s)Generate$/ }).click();
    const save = preview.getByRole('button', { name: /(?:^|\s)Save$/ });
    await save.waitFor();
    assert.equal(await page.evaluate(() => window.__portraitRequests), 1);
    await save.click();
    await page.waitForFunction(() => window.__finishRosterSave);
    await creator.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal(await preview.getByText('Generated race agent', { exact: true }).count(), 0);
    await page.evaluate(() => window.__finishRosterSave());
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('roleplayCompanions') || '[]').some(c => c.id === 'generation-race-agent'));
    // Reading through the adapter also waits for the queued save to finish.
    await page.evaluate(async () => {
      const store = await import('/src/services/roleplayStore.service.js');
      await store.loadCompanions();
    });
    assert.equal(await prompt.inputValue(), '');
    assert.equal(await preview.getByText('Generated race agent', { exact: true }).count(), 0, 'Completing an already accepted save does not restore the reset draft');
    assert.equal(await creator.getByRole('button', { name: 'Connect to issue token', exact: true }).count(), 0);
    await creator.getByRole('combobox', { name: 'Saved smart agents', exact: true }).selectOption('generation-race-agent');
    assert.equal(await preview.getByText('Generated race agent', { exact: true }).isVisible(), true, 'The completed save remains available when explicitly selected');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('one connection modal offers wallet and sign-in modes with keyboard dismissal', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto(url);
    await page.locator('.welcome-window').waitFor();
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bonzai:open-connect')));
    const dialog = page.locator('.connection-modal');
    await dialog.waitFor();
    assert.equal(await dialog.locator('.connection-option').count(), 2);
    assert.ok(await dialog.getByRole('button', { name: /Connect wallet/i }).isVisible());
    assert.ok(await dialog.getByRole('button', { name: /Sign in/i }).isVisible());
    await page.keyboard.press('Shift+Tab');
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.locator('#app').evaluate(element => element.inert), false);

    // Connecting from rewards stacks two dialogs; closing the top one must keep rewards usable.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bonzai:open-rewards')));
    const rewards = page.locator('.rewards-modal');
    await rewards.waitFor();
    await rewards.getByRole('button', { name: 'Connect', exact: true }).click();
    await dialog.waitFor();
    await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
    assert.equal(await rewards.evaluate(element => element.closest('.bz-modal-overlay').inert), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await rewards.isVisible(), true);
    assert.equal(await rewards.evaluate(element => element.contains(document.activeElement)), true);
    assert.equal(await page.locator('#app').evaluate(element => element.inert), true);
    await page.keyboard.press('Escape');
    await rewards.waitFor({ state: 'detached' });
    assert.equal(await page.locator('#app').evaluate(element => element.inert), false);
  } finally { await browser.close(); }
});
