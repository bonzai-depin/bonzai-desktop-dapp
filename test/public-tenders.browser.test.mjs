import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
// Mounts the real view against an in-page stand-in for the desktop bridge.
test('tender browsing, review, approval and receipt at desktop and narrow widths', { skip: !url }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url + '/src/assets/tokens.css');
    await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;padding:16px;background:var(--bz-bg);font-family:var(--bz-font-ui)}</style><div id="app"></div>');
    await page.evaluate(async () => {
      const long = 'Accord-cadre de maintenance préventive et corrective des installations de chauffage, ventilation, climatisation et désenfumage '.repeat(4);
      const notice = { source: 'boamp', sourceId: '26-108200', title: long, buyer: 'Sénat', deadline: '2099-12-07T11:00:00.000Z', departments: ['75'], type: 'TRAVAUX', url: 'https://www.boamp.fr/pages/avis/?q=idweb:26-108200', buyerProfileUrl: 'https://www.marches-publics.gouv.fr/' };
      const state = { notices: [], responses: [], documents: [], searches: [] };
      const manifest = () => ({ recipient: { buyer: 'Sénat', consultationReference: '26-108200', lots: '', platformUrl: 'https://www.marches-publics.gouv.fr/' }, deadline: notice.deadline, documents: state.documents.filter(d => d.pieceType !== 'receipt').map(d => ({ id: d.id, label: d.label, pieceType: d.pieceType, sha256: 'a'.repeat(64), ext: 'txt' })) });
      window.calls = [];
      const api = {
        snapshot: async () => JSON.parse(JSON.stringify(state)), onChanged: () => () => {},
        searchNotices: async (_c, input) => { window.calls.push(['searchNotices', input]); if (input.keywords === 'offline') throw new Error('The public tender service could not be reached. Check the connection and try again.'); return input.keywords === 'rien' ? { total: 0, pageSize: 20, notices: [] } : { total: 41, pageSize: 20, notices: [notice] }; },
        saveNotice: async () => { state.notices = [{ ...notice, id: 'n1' }]; },
        startResponse: async () => { const r = { id: 'r1', noticeId: 'n1', title: long, buyer: 'Sénat', deadline: notice.deadline, platformUrl: notice.buyerProfileUrl, consultationReference: '26-108200', requiredPieces: ['technical'], documentIds: ['d1'], stage: 'preparing', revision: 1 }; state.responses = [r]; state.documents = [{ id: 'd1', label: 'Mémoire technique', pieceType: 'technical', responseId: 'r1', draft: true }]; return r; },
        approvalPreview: async () => ({ manifest: manifest(), preparation: { blockers: state.documents[0]?.reviewedBy ? [] : ['Drafts written by the team need human review.'], missing: [] } }),
        reviewDocument: async (_c, input) => { state.documents[0].reviewedBy = input.reviewedBy; },
        requestReview: async () => { state.responses[0] = { ...state.responses[0], stage: 'review', revision: 2 }; return state.responses[0]; },
        approveResponse: async (_c, input) => { window.calls.push(['approveResponse', input]); state.responses[0] = { ...state.responses[0], stage: 'approved', revision: 3, approval: { approvedBy: input.approvedBy, manifest: input.manifest } }; return state.responses[0]; },
        attachDocument: async (_c, input) => { state.documents.push({ id: 'rc', label: 'accuse.pdf', pieceType: input.pieceType, responseId: 'r1' }); },
        recordDeposit: async (_c, input) => { window.calls.push(['recordDeposit', input]); state.responses[0] = { ...state.responses[0], stage: 'deposited', revision: 4, deposit: { reference: input.reference, recordedBy: input.recordedBy, depositedAt: '2026-11-20T09:00:00Z' } }; return state.responses[0]; },
      };
      window.electronAPI = { db: { companyTenders: api } };
      const source = await fetch('/src/components/company/CompanyTenders.vue').then(r => r.text());
      const runtime = source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
      const { createApp } = await import(runtime);
      const { default: View } = await import('/src/components/company/CompanyTenders.vue');
      const { i18n } = await import('/src/i18n/index.js');
      const { operationText } = await import('/src/i18n/operations.js');
      await i18n.setLocale('fr');
      const app = createApp(View, { companyId: 'c1' });
      app.config.globalProperties.$t = i18n.t; app.config.globalProperties.$ui = s => operationText(s, 'fr'); app.mount('#app');
    });
    const noOverflow = async label => { for (const width of [360, 760, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width} (${label})`); await page.screenshot({ path: `/tmp/bonzai-tenders-${label}-${width}.png`, fullPage: true }); } };
    const search = page.getByRole('button', { name: 'Rechercher', exact: true });
    assert.ok(await search.isDisabled(), 'no search without terms');
    await page.getByText('Saisissez des mots-clés').waitFor();
    await page.getByText('n’envoie que les termes ci-dessus').waitFor();
    await page.getByLabel('Mots-clés').fill('offline'); await search.click();
    await page.getByRole('alert').getByText('injoignable').waitFor();
    await page.getByLabel('Mots-clés').fill('rien'); await search.click();
    await page.getByText('Aucun avis ne correspond').waitFor();
    await page.getByLabel('Mots-clés').fill('climatisation'); await search.click();
    await page.getByText('41 avis trouvés').waitFor();
    assert.deepEqual(Object.keys((await page.evaluate(() => window.calls.at(-1)))[1]).sort(), ['departments', 'keywords', 'openOnly', 'page', 'type'], 'only the typed filters reach the bridge');
    await noOverflow('search');
    await page.getByRole('button', { name: 'Suivre', exact: true }).click();
    await page.getByRole('button', { name: /Avis suivis/ }).click();
    await page.getByRole('button', { name: 'Préparer une réponse' }).click();
    await page.getByText('Brouillon à relire').waitFor();
    const review = page.getByRole('button', { name: 'Soumettre à relecture' });
    assert.ok(await review.isDisabled(), 'an unreviewed draft blocks the hand-over');
    await page.getByLabel('Votre nom, en tant que relecteur').fill('Camille');
    await page.getByRole('button', { name: 'Marquer comme relu' }).click();
    await page.getByText('Relu par Camille').waitFor();
    await noOverflow('preparing');
    await review.click();
    await page.getByText('Valider exactement ce dossier').waitFor();
    const approve = page.getByRole('button', { name: 'Valider le dossier' });
    assert.ok(await approve.isDisabled(), 'approval needs a name and an explicit confirmation');
    await page.getByLabel('Votre nom, en tant que valideur').fill('Camille');
    assert.ok(await approve.isDisabled());
    await page.getByLabel('J’ai lu chaque fichier').check();
    await noOverflow('approval');
    await approve.click();
    const sent = (await page.evaluate(() => window.calls.at(-1)))[1];
    assert.equal(sent.manifest.recipient.buyer, 'Sénat'); assert.equal(sent.manifest.documents.length, 1); assert.equal(sent.confirmed, true);
    await page.getByText('BonzAI ne dépose jamais une réponse').waitFor();
    const record = page.getByRole('button', { name: 'Enregistrer le dépôt' });
    assert.ok(await record.isDisabled(), 'no deposit record without the receipt');
    await page.getByRole('button', { name: 'Joindre l’accusé de dépôt' }).click();
    await page.getByLabel('Accusé de dépôt', { exact: true }).selectOption('rc');
    await page.getByLabel('Référence de l’accusé').fill('PLACE-2026-1');
    await page.getByLabel('Déposé par').fill('Camille');
    await page.getByLabel('J’ai déposé les fichiers validés').check();
    await record.click();
    await page.getByText('Dépôt enregistré').waitFor();
    await noOverflow('deposited');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
