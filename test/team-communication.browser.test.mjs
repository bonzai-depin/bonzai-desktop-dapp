import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const url = process.env.BONZAI_UI_URL;

test(
  "Team requests preserve member/team identity, user copy and locale through replies and narrow layouts",
  { skip: !url, timeout: 90000 },
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
      page.on("pageerror", (e) => {
        errors.push(e.message);
        console.error("Browser error", e.message);
      });
      page.setDefaultTimeout(10000);
      await page.route("**/*", (r) =>
        new URL(r.request().url()).hostname === "127.0.0.1"
          ? r.continue()
          : r.abort(),
      );
      await page.goto(`${url}/src/assets/tokens.css`);
      await page.setContent(
        '<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;padding:24px;background:var(--bz-canvas);font-family:"Fira Sans",sans-serif}*{box-sizing:border-box}</style></head><body><main id="app"></main></body></html>',
      );
      await page.evaluate(async () => {
        const { createApp, h } =
          await import("/node_modules/.vite/deps/vue.js");
        const { default: Component } =
          await import("/src/components/company/CompanyTeamExchanges.vue");
        const { i18n, createI18nPlugin } = await import("/src/i18n/index.js");
        i18n.setLocale("fr");
        window.__locale = i18n;
        const teams = [
          {
            id: "maintenance",
            name: "Maintenance Martin",
            roles: { CEO: { companion: "alex", companionName: "Alex" } },
          },
          {
            id: "purchasing",
            name: "Achats Martin",
            roles: {
              PurchasingManager: { companion: "alex", companionName: "Alex" },
            },
          },
        ];
        let threads = [];
        window.__requests = [];
        window.__replies = [];
        window.electronAPI = {
          db: {
            teams: {
              list: async (id) =>
                structuredClone(
                  threads.filter((t) =>
                    [t.source_company_id, t.target_company_id].includes(id),
                  ),
                ),
              onChanged: () => () => {},
              request: async (id, input) => {
                window.__requests.push({ id, input });
                const value = {
                  id: "thread-1",
                  source_company_id: id,
                  target_company_id: input.targetTeamId,
                  source_team_name: "Maintenance Martin",
                  target_team_name: "Achats Martin",
                  target_role: input.targetRole,
                  subject: input.subject,
                  task_status: "open",
                  created_at: Date.now(),
                  messages: [
                    {
                      id: "m1",
                      author_name: "Alex",
                      author_role: "CEO",
                      team_name: "Maintenance Martin",
                      body: input.body,
                      created_at: Date.now(),
                    },
                    {
                      id: "m2",
                      author_name: "Alex",
                      author_role: "PurchasingManager",
                      team_name: "Achats Martin",
                      body: "Start",
                      created_at: Date.now(),
                    },
                  ],
                };
                threads.push(value);
                return structuredClone(value);
              },
              reply: async (id, input) => {
                window.__replies.push({ id, input });
                threads[0].messages.push({
                  id: "m3",
                  author_name: "Owner",
                  author_role: "owner",
                  team_name: teams.find((t) => t.id === id).name,
                  body: input.body,
                  created_at: Date.now(),
                });
              },
            },
          },
        };
        window.__app = createApp({ render: () => h(Component, { teams }) });
        window.__app.use(createI18nPlugin());
        window.__app.mount("#app");
      });
      await page
        .getByRole("button", { name: "Nouvelle demande", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Équipe destinataire").selectOption("purchasing");
      assert.match(
        await dialog.getByLabel("Membre destinataire").textContent(),
        /Alex · Achats/,
      );
      await dialog.getByLabel("Objet", { exact: true }).fill("Start");
      await dialog
        .getByLabel("Détail de la demande")
        .fill("Prepare supplier options for belt X-42.");
      await dialog
        .getByRole("button", { name: "Transmettre la demande" })
        .click();
      await page.locator(".exchange-body").nth(1).waitFor();
      const bylines = await page.locator(".exchange-byline").allTextContents();
      assert.match(bylines[0], /Alex.*Maintenance Martin.*Coordination/);
      assert.match(bylines[1], /Alex.*Achats Martin.*Achats/);
      assert.match(
        await page.locator(".exchange-layout>nav").textContent(),
        /En attente/,
      );
      await page.getByLabel("Équipe expéditrice").selectOption("maintenance");
      await page
        .getByLabel("Réponse", { exact: true })
        .fill("Use the original dimensions.");
      await page.getByRole("button", { name: "Envoyer", exact: true }).click();
      await page.locator(".exchange-body").nth(2).waitFor();
      assert.equal(await page.evaluate(() => window.__requests.length), 1);
      assert.equal(
        await page.evaluate(() => window.__replies[0].id),
        "maintenance",
      );
      await page.evaluate(() => window.__locale.setLocale("en"));
      await page.getByRole("heading", { name: "Team exchanges" }).waitFor();
      assert.equal(
        await page.locator(".exchange-body").nth(1).textContent(),
        "Start",
        "Business text must not be translated",
      );
      assert.match(
        await page.locator(".exchange-layout>nav").textContent(),
        /Queued/,
      );
      for (const theme of [
        "default",
        "light",
        "midnight",
        "terminal",
        "warm",
      ]) {
        await page.evaluate(
          (t) => document.documentElement.setAttribute("data-theme", t),
          theme,
        );
        for (const width of [1440, 700, 390]) {
          await page.setViewportSize({ width, height: 950 });
          assert.equal(await page.locator(".team-exchanges > header").count(),1);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            true,
            `${theme}/${width}: no page overflow`,
          );
          if (
            ["default", "light"].includes(theme) &&
            [1440, 390].includes(width)
          )
            await page.screenshot({
              path: `/tmp/bonzai-team-exchanges-${theme}-${width}.png`,
            });
        }
      }
      // The legacy activity feed must preserve the foreign sender in both card and detail.
      await page.evaluate(async () => {
        window.__app.unmount();
        const { createApp, h } =
          await import("/node_modules/.vite/deps/vue.js");
        const { default: Feed } =
          await import("/src/components/company/CompanyLiveFeed.vue");
        const { createI18nPlugin } = await import("/src/i18n/index.js");
        window.__app = createApp({
          render: () =>
            h(Feed, {
              charter: {
                id: "maintenance",
                name: "Maintenance Martin",
                roles: {},
              },
              state: {
                audit: [
                  {
                    id: "event",
                    ts: Date.now(),
                    kind: "team_message",
                    action: "team.message",
                    status: "recorded",
                    note: "Belt specification received.",
                    extra: {
                      teamMessage: {
                        author_name: "Alex",
                        author_role: "PurchasingManager",
                        team_name: "Achats Martin",
                      },
                    },
                  },
                ],
                activeStreams: {},
                issues: [],
                goals: [],
                catalog: [],
              },
            }),
        });
        window.__app.use(createI18nPlugin());
        window.__app.mount("#app");
      });
      await page.locator(".live-entry").waitFor();
      assert.match(
        await page.locator(".live-entry__role").textContent(),
        /Alex.*Achats Martin/,
      );
      await page.locator(".live-entry").click();
      assert.match(
        await page.locator(".feed-detail__meta").textContent(),
        /Alex.*Achats Martin/,
      );
      await page.evaluate(async()=>{
        window.__app.unmount();
        const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');
        const {default:Wizard}=await import('/src/components/company/CompanyIntakeWizard.vue');
        const {i18n,createI18nPlugin}=await import('/src/i18n/index.js');
        i18n.setLocale('fr');
        window.__app=createApp({render:()=>h(Wizard)});window.__app.use(createI18nPlugin());window.__app.mount('#app');
      });
      await page.setViewportSize({width:1440,height:1000});
      await page.getByRole('heading',{name:'Créer une équipe',exact:true}).waitFor();
      const cards=page.locator('.workflow-card');
      assert.ok((await cards.allTextContents()).some(text=>text.includes('Achats')));
      assert.ok((await cards.allTextContents()).some(text=>text.includes('Ventes')));
      await cards.filter({has:page.locator('.workflow-card__title',{hasText:'Achats'})}).click();
      await page.locator('.wiz__actions-right button').click();
      await page.locator('#company-business-name').fill('Ateliers Martin');
      await page.locator('.wiz__actions-right button').click();
      assert.match(await page.locator('.workspace-team-preview__roles').textContent(),/Achats/);
      assert.equal(await page.locator('#company-demo-label').locator('..').locator('..').locator('input').isChecked(),false);
      assert.doesNotMatch(await page.locator('.wiz').textContent(),/under control|sous contrôle|jusqu’au bout/);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);

test(
  "Legacy translations track state changes without restoring stale labels or translating business names",
  { skip: !url, timeout: 30000 },
  async () => {
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      await page.goto(`${url}/src/assets/tokens.css`);
      await page.setContent(
        '<main id="root"><button id="state" title="Start">Start</button><span class="company-switcher__name">Start</span><p data-i18n-skip>Stop</p></main>',
      );
      await page.evaluate(async () => {
        const { i18n } = await import("/src/i18n/index.js");
        const { installLegacyI18nBridge } = await import("/src/i18n/legacy.js");
        window.__locale = i18n;
        i18n.setLocale("fr");
        installLegacyI18nBridge(document.querySelector("#root"));
      });
      await page
        .getByRole("button", { name: "Démarrer", exact: true })
        .waitFor();
      await page.evaluate(() => {
        const el = document.querySelector("#state");
        el.firstChild.nodeValue = "Stop";
        el.title = "Stop";
      });
      await page
        .getByRole("button", { name: "Arrêter", exact: true })
        .waitFor();
      assert.equal(
        await page.locator("#state").getAttribute("title"),
        "Arrêter",
      );
      await page.evaluate(() => window.__locale.setLocale("en"));
      await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
      assert.equal(await page.locator("#state").getAttribute("title"), "Stop");
      await page.evaluate(() => window.__locale.setLocale("fr"));
      await page
        .getByRole("button", { name: "Arrêter", exact: true })
        .waitFor();
      assert.equal(
        await page.locator(".company-switcher__name").textContent(),
        "Start",
      );
      assert.equal(
        await page.locator("[data-i18n-skip]").textContent(),
        "Stop",
      );
    } finally {
      await browser.close();
    }
  },
);
