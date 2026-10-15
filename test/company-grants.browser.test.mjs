import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createCompanyBrowser } from "../src/main/companyBrowser.js";
const url = process.env.BONZAI_UI_URL;
test(
  "grants UI creates a dossier and remains readable in French at desktop and narrow widths",
  { skip: !url, timeout: 60000 },
  async () => {
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    try {
      const page = await browser.newPage({
          viewport: { width: 1440, height: 1000 },
        }),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.setDefaultTimeout(10000);
      await page.route("**/*", (r) =>
        new URL(r.request().url()).origin === new URL(url).origin
          ? r.continue()
          : r.abort(),
      );
      await page.goto(url + "/src/assets/tokens.css");
      await page.setContent(
        '<head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{padding:24px;margin:0;background:var(--bz-canvas);color:var(--bz-fg);font-family:"Fira Sans",sans-serif}*{box-sizing:border-box}</style></head><body><div id="app"></div></body>',
      );
      await page.evaluate(async () => {
        const source = await fetch(
            "/src/components/company/CompanyGrants.vue",
          ).then((r) => r.text()),
          runtime = source.match(
            /from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/,
          )[1];
        const { createApp } = await import(runtime),
          { default: View } =
            await import("/src/components/company/CompanyGrants.vue"),
          { operationText } = await import("/src/i18n/operations.js");
        window.fixture = { dossiers: [], documents: [], events: [] };
        window.electronAPI = {
          db: {
            companyGrants: {
              snapshot: async () => structuredClone(window.fixture),
              onChanged: callback => {window.grantsChanged=callback;return () => {};},
              saveDossier: async (_id, input) => {
                const d = { ...input, id: "one", revision: 1 };
                window.fixture.dossiers = [d];
                return d;
              },
            },
          },
        };
        const {i18n}=await import("/src/i18n/index.js");i18n.setLocale("fr");
        const app = createApp(View, { companyId: "test" });
        app.config.globalProperties.$ui = (s) => operationText(s, "fr");
        app.mount("#app");
      });
      await page
        .getByRole("button", { name: "Nouveau dossier", exact: true })
        .click();
      await page
        .getByLabel("Intitulé du dossier")
        .fill("Climatisation · École des Alizés");
      await page
        .getByLabel("Bénéficiaire", { exact: true })
        .fill("École des Alizés");
      await page.getByLabel("Territoire", { exact: true }).fill("Martinique");
      await page
        .getByRole("button", { name: "Enregistrer", exact: true })
        .click();
      await page
        .getByRole("button", { name: /Climatisation · École/ })
        .waitFor();
      // Internal approval review is distinct from applications under review by a provider.
      await page.evaluate(()=>{window.fixture.dossiers[0].stage='review';window.fixture.dossiers[0].receivedCents=2500;window.grantsChanged({companyId:'test'});});
      await page.locator('.grant-toolbar select').selectOption('review');
      assert.equal(await page.locator('.grant-row').count(),1);
      await page.locator('.company-metric').filter({hasText:'En instruction'}).click();
      assert.equal(await page.locator('.grant-toolbar select').inputValue(),'under_review');
      assert.equal(await page.locator('.grant-row').count(),0);
      await page.locator('.company-metric').filter({hasText:'Dossiers'}).click();
      assert.equal(await page.locator('.grant-row').count(),1);
      const recordLayout=await page.locator('.grant-row').evaluate(row=>{
        const title=row.querySelector('strong').getBoundingClientRect();
        const context=row.querySelector('span').getBoundingClientRect();
        return {titleWidth:title.width,rowWidth:row.getBoundingClientRect().width,stacked:context.top>=title.bottom};
      });
      assert.ok(recordLayout.stacked && recordLayout.titleWidth>recordLayout.rowWidth*.7,'application names and customer context each use a readable full line');
      await page.locator('.company-metric').filter({hasText:'Versé'}).click();
      assert.equal(await page.locator('.grant-toolbar select').inputValue(),'received');
      assert.equal(await page.locator('.grant-row').count(),1,'received amounts link to partial payments as well as settled applications');
      await page.locator('.company-metric').filter({hasText:'Dossiers'}).click();
      for (const width of [1440, 760]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `no horizontal overflow at ${width}`,
        );
        await page.screenshot({
          path: `/tmp/bonzai-grants-${width}.png`,
          fullPage: width === 1440,
        });
      }
      await page.locator('.grant-detail-tabs').getByRole('button',{name:'Pièces',exact:true}).click();
      await page.getByRole('button',{name:'Identité de l’entreprise',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Identité de l’entreprise',exact:true}).getAttribute('aria-pressed'),'true');
      await page.locator('.grant-detail-tabs').getByRole('button',{name:'Suivi',exact:true}).click();
      await page.getByText('Prochaine étape',{exact:false}).waitFor();
      await page.evaluate(()=>document.documentElement.dataset.theme='light');
      await page.screenshot({path:'/tmp/bonzai-grants-light.png',fullPage:true});
      await page
        .getByRole("button", { name: "Pièces de l’entreprise", exact: true })
        .click();
      await page
        .getByText("L’identité de l’entreprise et ses qualifications sont réutilisables.", { exact: false })
        .waitFor();
      const upload = page.getByRole('button', {name:'Choisir une pièce locale',exact:true});
      const size = await upload.evaluate(el=>({button:el.getBoundingClientRect().width,panel:el.parentElement.getBoundingClientRect().width}));
      assert.ok(size.button < size.panel * 0.65, 'Document upload action stays content-sized');
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
test(
  "browser driver fills, selects, uploads and reads a receipt without treating a click as submission",
  { skip: !url, timeout: 60000 },
  async () => {
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    const file = "/tmp/bonzai-portal-fixture.txt";
    fs.writeFileSync(file, "test grant evidence");
    try {
      const page = await browser.newPage();
      await page.route("**/*", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<label>Name<input id="name"></label><label>Area<select id="area"><option value="mq">Martinique</option><option value="gf">Guyane</option></select></label><label>Proof<input type="file"></label><button onclick="document.body.insertAdjacentHTML(\'beforeend\',\'<p>Receipt TEST-123</p>\')">Submit</button>',
        }),
      );
      const events = [],
        confirmations = [];
      let attached = false;
      const cdp = await page.context().newCDPSession(page);
      class Win extends EventEmitter {
        constructor(options) {
          super();
          this.options = options;
          this.webContents = new EventEmitter();
          this.webContents.session = Object.assign(new EventEmitter(), {
            setPermissionRequestHandler() {},
            setPermissionCheckHandler() {},
          });
          Object.assign(this.webContents, {
            setWindowOpenHandler() {},
            getURL: () => page.url(),
            executeJavaScriptInIsolatedWorld: async (_world, scripts) =>
              page.evaluate(scripts[0].code),
            debugger: {
              isAttached: () => attached,
              attach: () => {
                attached = true;
              },
              detach: () => {
                attached = false;
              },
              sendCommand: (name, p) => cdp.send(name, p),
            },
          });
        }
        show() {}
        isDestroyed() {
          return false;
        }
        loadURL(u) {
          return page.goto(u);
        }
      }
      const driver = createCompanyBrowser({
        BrowserWindow: Win,
        dialog: {
          showMessageBox: async (_w, opts) => {
            confirmations.push(opts);
            return { response: 1 };
          },
        },
        assertCompany() {},
        record: (...e) => {events.push(e); return {id:String(events.length)};},
        document: () => ({ id: "doc", label: "Approved evidence", path: file }),
      });
      let s = await driver.navigate("team", {
        url: "https://grant-portal.test",
      });
      const confirmationsBefore = confirmations.length;
      await driver.fillForm('team',{snapshotId:s.snapshotId,fields:[
        {elementId:s.elements.find(e=>e.tag==='INPUT' && e.type==='text').id,value:'Batch client'},
        {elementId:s.elements.find(e=>e.tag==='SELECT').id,value:'gf'}
      ]});
      assert.equal(confirmations.length,confirmationsBefore+1);
      assert.equal(await page.locator('#name').inputValue(),'Batch client');
      assert.equal(await page.locator('#area').inputValue(),'gf');
      await assert.rejects(driver.fillForm('team',{snapshotId:s.snapshotId,fields:[{elementId:0,value:'stale'}]}),/Stale/);
      s=await driver.inspect('team');
      let target = s.elements.find(
        (e) => e.tag === "INPUT" && e.type === "text",
      );
      await driver.interact("team", {
        operation: "fill",
        elementId: target.id,
        snapshotId: s.snapshotId,
        value: "Client A",
      });
      assert.equal(await page.locator("#name").inputValue(), "Client A");
      await assert.rejects(
        driver.interact("team", {
          operation: "fill",
          elementId: target.id,
          snapshotId: s.snapshotId,
          value: "STALE",
        }),
        /Stale/,
      );
      s = await driver.inspect("team");
      target = s.elements.find((e) => e.tag === "SELECT");
      await driver.interact("team", {
        operation: "select",
        elementId: target.id,
        snapshotId: s.snapshotId,
        value: "gf",
      });
      assert.equal(await page.locator("#area").inputValue(), "gf");
      s = await driver.inspect("team");
      target = s.elements.find((e) => e.type === "file");
      await driver.uploadDocument("team", {
        elementId: target.id,
        snapshotId: s.snapshotId,
        documentId: "doc",
      });
      assert.equal(
        await page.locator("input[type=file]").evaluate((e) => e.files[0].name),
        "bonzai-portal-fixture.txt",
      );
      s = await driver.inspect("team");
      target = s.elements.find((e) => e.tag === "BUTTON");
      const result = await driver.interact("team", {
        operation: "click",
        elementId: target.id,
        snapshotId: s.snapshotId,
      });
      assert.match(result.summary, /not proof/);
      assert.match((await driver.inspect("team")).text, /TEST-123/);
      assert.ok(confirmations.length >= 5);
      assert.ok(events.some((e) => e[2].operation === "upload"));
      assert.equal(attached, false);
    } finally {
      await browser.close();
      fs.rmSync(file, { force: true });
    }
  },
);
