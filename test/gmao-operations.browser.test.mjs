import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const url = process.env.BONZAI_UI_URL;
test(
  "maintenance cockpit, client scope, planning, dossier and approval forms work across themes and widths",
  { skip: !url, timeout: 120000 },
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
      page.setDefaultTimeout(12000);
      page.on("pageerror", (e) => { errors.push(e.message); console.error("UI error:",e.message); });
      await page.route("**/*", (r) =>
        new URL(r.request().url()).hostname !== "127.0.0.1"
          ? r.abort()
          : r.continue(),
      );
      await page.goto(`${url}/src/assets/tokens.css`);
      await page.setContent(
        '<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;padding:28px;background:var(--bz-canvas);font-family:"Fira Sans",sans-serif}*{box-sizing:border-box}@media(max-width:700px){body{padding:16px}}</style></head><body><main id="app"></main></body></html>',
      );
      await page.evaluate(async () => {
        const { createApp, reactive, h } =
          await import("/node_modules/.vite/deps/vue.js");
        const { default: Component } =
          await import("/src/components/company/CompanyGmao.vue");
        const {i18n,createI18nPlugin}=await import("/src/i18n/index.js");
        i18n.setLocale("fr"); window.__locale=i18n;
        const now = Date.now(),
          date = new Date();
        date.setHours(9, 0, 0, 0);
        const at = date.getTime();
        const data = reactive({
          contract: { name: "Opérations" },
          clients: [
            {
              id: "a",
              name: "Ateliers Martin",
              contactName: "Sophie Martin",
              email: "sophie@example.invalid",
              phone: "+33600000000",
              address: "12 rue des Ateliers",
            },
            {
              id: "b",
              name: "Maison des Orangers",
              contactName: "Karim Nguyen",
              email: "karim@example.invalid",
            },
          ],
          serviceContracts: [],
          sites: [
            {
              id: "s1",
              clientId: "a",
              name: "Siège · Fort-de-France",
              address: "12 rue des Ateliers",
              active: true,
            },
            {
              id: "s2",
              clientId: "b",
              name: "Boutique · Le Lamentin",
              active: true,
            },
          ],
          assets: [],
          plans: [],
          workOrders: [
            {
              id: "wo1",
              workOrderNumber: "OT-2026-001",
              clientOiNumber: "OI-0241",
              title: "Climatisation à l’arrêt — espace accueil",
              description:
                "Diagnostiquer le système de climatisation et confirmer la disponibilité du ventilateur.",
              siteId: "s1",
              status: "waiting_parts",
              priority: "P1",
              assigneeHuman: "Lucas Bernard",
              scheduledAt: at,
              reportedAt: now - 86400000,
              type: "corrective",
              durationMinutes: 90,
            },
            {
              id: "wo2",
              workOrderNumber: "OT-2026-002",
              title: "Visite préventive — centrale de traitement d’air",
              siteId: "s1",
              status: "assigned",
              priority: "P2",
              assigneeHuman: "Léa Moreau",
              scheduledAt: at + 3 * 3600000,
              reportedAt: now,
              type: "preventive",
              durationMinutes: 60,
            },
            {
              id: "wo3",
              workOrderNumber: "OT-2026-003",
              title: "Contrôle ventilation — boutique",
              siteId: "s2",
              status: "reported",
              priority: "P2",
              reportedAt: now,
              type: "corrective",
            },
          ],
          procurements: [
            {
              id: "p1",
              workOrderId: "wo1",
              description: "Ventilateur de remplacement · unité extérieure",
              supplierName: "Froid Service",
              status: "proforma_received",
              amountCents: 28500,
              responsible: "Camille Laurent",
              items: [{ label: "Ventilateur", quantity: 1, received: 0 }],
            },
          ],
          suppliers: [{ id: "supplier", name: "Froid Service" }],
          quotes: [
            {
              id: "q1",
              workOrderId: "wo1",
              quoteNumber: "DEV-2026-042",
              totalCents: 38500,
              status: "draft",
            },
          ],
          invoices: [],
          documents: [],
          events: [
            {
              id: "e2",
              workOrderId: "wo1",
              eventType: "attachment_recorded",
              actorName: "Lucas Bernard",
              note: "Diagnostic confirmé : ventilateur à remplacer.",
              happenedAt: now - 3600000,
            },
            {
              id: "e1",
              workOrderId: "wo1",
              eventType: "created",
              note: "Demande reçue par téléphone.",
              happenedAt: now - 86400000,
            },
          ],
          attachmentSheets: [],
          notifications: [],
          handoffs: [
            {
              id: "h1",
              workOrderId: "wo1",
              procurementId: "p1",
              status: "requested",
            },
          ],
          documentIntake: [],
          outbox: [
            {
              id: "m1",
              workOrderId: "wo1",
              channel: "email",
              sender: "atelier@example.invalid",
              recipient: "sophie@example.invalid",
              subject: "Votre devis d’intervention",
              message: "Bonjour Sophie, voici votre devis.",
              status: "draft",
              revision: 2,
              createdAt: now,
            },
          ],
          kpis: {},
        });
        const calls = [];
        window.__calls = calls;
        window.__data = data;
        const store = {
          state: {activeId:"qa-cmms", companies:[]},
          refreshActive: async()=>{},
          runGmaoAutomation: async () => ({}),
          createGmaoWorkOrder: async input => {
            calls.push({action:'create-work-order',input});
            if (window.__failWorkOrder) throw new Error('Enregistrement impossible');
            const record={...input,id:'qa-new-wo',status:'reported',repairMode:'none',workOrderNumber:'OT-QA-004',reportedAt:Date.now()};
            data.workOrders.push(record);
            return record;
          },
          saveGmaoClient: async (input) => {
            calls.push({ action: "client", input });
            const c = { id: "new-client", ...input };
            data.clients.push(c);
            return c;
          },
          sendGmaoOutbox: async (id, input) => {
            calls.push({ action: "send", id, input });
            const msg = data.outbox.find((m) => m.id === id);
            Object.assign(msg, {
              status: "submitted",
              providerId: "fake-provider-receipt",
            });
            return msg;
          },
          updateGmaoWorkOrder: async (id, input) => {
            calls.push({ action: "schedule", id, input });
            const w = data.workOrders.find((w) => w.id === id);
            Object.assign(w, input);
            return w;
          },
          transitionGmaoWorkOrder: async (id, status) => {
            const w = data.workOrders.find((w) => w.id === id);
            w.status = status;
            return w;
          },
        };
        createApp({ render: () => h(Component, { gmao: data, store }) }).use(createI18nPlugin()).mount(
          "#app",
        );
      });
      await page
        .getByRole("heading", { name: "Actions à traiter" })
        .waitFor().catch(async error => { await page.screenshot({path:"/tmp/bonzai-gmao-failure.png"}); throw new Error(error.message + " Rendered: " + await page.locator("body").innerText()); });
      await page.evaluate(()=>window.__locale.setLocale('en'));
      await page.getByRole('heading',{name:'Pending actions',exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'New work order',exact:true}).count(),1);
      assert.equal(await page.getByText('À planifier',{exact:true}).count(),0);
      await page.getByRole('button',{name:'New work order',exact:true}).click();
      await page.getByLabel('Work order title',{exact:true}).fill('Client words stay unchanged');
      await page.evaluate(()=>window.__locale.setLocale('fr'));
      assert.equal(await page.getByLabel('Objet de l’intervention',{exact:true}).inputValue(),'Client words stay unchanged');
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.fonts.ready);
      for (const theme of [
        "default",
        "light",
        "midnight",
        "terminal",
        "warm",
      ]) {
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        for (const width of [1440, 700, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          assert.equal(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth <= window.innerWidth + 1,
            ),
            true,
            `${theme}/${width} overflow`,
          );
          if (
            ["default", "light"].includes(theme) &&
            [1440, 390].includes(width)
          )
            await page.screenshot({
              path: `/tmp/bonzai-operations-${theme}-${width}.png`,
              fullPage: true,
            });
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.evaluate(
        () => (document.documentElement.dataset.theme = "default"),
      );
      await page.getByLabel("Filtrer par client").selectOption("a");
      assert.equal(
        await page
          .getByRole("button")
          .filter({ hasText: "Contrôle ventilation — boutique" })
          .count(),
        0,
      );
      await page
        .getByRole("navigation", { name: "Navigation maintenance" })
        .getByRole("button", { name: "Planning", exact: true })
        .click();
      await page.getByRole("grid").waitFor();
      assert.ok((await page.getByRole("gridcell").count()) >= 28);
      await page.screenshot({
        path: "/tmp/bonzai-operations-planning.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 900 });
      assert.equal(await page.getByRole("grid").isVisible(), false);
      assert.equal(await page.locator(".ops-calendar-list").isVisible(), true);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Interventions", exact: true })
        .click();
      await page.getByRole("button", { name: /OI-0241/ }).click();
      await page.getByRole("dialog").waitFor();
      assert.equal(
        await page
          .getByRole("heading", { name: "Chronologie factuelle" })
          .isVisible(),
        true,
      );
      await page.screenshot({ path: "/tmp/bonzai-operations-dossier.png" });
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Fermer", exact: true })
        .click();
      await page
        .getByRole("navigation")
        .getByRole("button", { name: /Demandes de pièces/ })
        .click();
      await page.getByRole("heading", { name: "Demandes de pièces" }).waitFor();
      await page.getByRole("button", { name: "Traiter la demande" }).click();
      await page.getByLabel("Responsable achats").waitFor();
      assert.equal(
        await page.getByLabel("Responsable achats").inputValue(),
        "Camille Laurent",
      );
      await page.keyboard.press("Escape");
      await page
        .getByRole("navigation")
        .getByRole("button", { name: /Messages/ })
        .click();
      await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
      const submit = page.getByRole("button", {
        name: "Valider & envoyer réellement",
      });
      await submit.click();
      assert.equal(
        await page.evaluate(() => window.__calls.length),
        0,
        "required consent blocks sending",
      );
      await page
        .getByLabel("J’autorise l’envoi réel", { exact: false })
        .check();
      await submit.click();
      await page.waitForFunction(() =>
        window.__calls.some((c) => c.action === "send"),
      );
      assert.equal(
        await page.evaluate(
          () => window.__calls.find((c) => c.action === "send").input.revision,
        ),
        2,
      );
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Clients", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Ajouter un client", exact: true })
        .click();
      await page
        .getByLabel("Nom du client", { exact: true })
        .fill("Client test");
      await page
        .getByRole("button", { name: "Enregistrer", exact: true })
        .click();
      await page.waitForFunction(() =>
        window.__calls.some((c) => c.action === "client"),
      );
      await page.getByRole("button", { name: "Réglages", exact: true }).click();
      await page
        .getByRole("heading", { name: "Équipements", exact: true })
        .waitFor();
      for (const theme of ["default", "light"])
        for (const width of [1440, 390]) {
          await page.evaluate(
            (t) => (document.documentElement.dataset.theme = t),
            theme,
          );
          await page.setViewportSize({ width, height: 1000 });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            true,
            `settings ${theme}/${width}`,
          );
          await page.screenshot({
            path: `/tmp/bonzai-settings-${theme}-${width}.png`,
            fullPage: true,
          });
        }
      await page
        .getByRole("button", { name: "Créer une gamme", exact: true })
        .count();
      await page
        .getByRole("navigation", { name: "Réglages opérationnels" })
        .getByRole("button", { name: /Préventif/ })
        .click();
      await page
        .getByRole("button", { name: "Créer une gamme", exact: true })
        .first()
        .click();
      await page.getByLabel("Fréquence en mois", { exact: true }).waitFor();
      assert.equal(
        await page
          .getByLabel("Fréquence en mois", { exact: true })
          .inputValue(),
        "6",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
        "settings form mobile",
      );
      await page.keyboard.press("Escape");
      // Exercise the same intake form that previously leaked purchasing defaults.
      await page.setViewportSize({width:1440,height:1000});
      await page.getByRole('navigation',{name:'Navigation maintenance'}).getByRole('button',{name:'Interventions',exact:true}).click();
      await page.getByRole('button',{name:'Nouvelle intervention',exact:true}).click();
      const intake=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Nouvelle intervention',exact:true})});
      await intake.getByLabel('Objet de l’intervention',{exact:true}).fill('QA — rétablir la ventilation');
      await intake.getByRole('combobox',{name:/^Site/}).selectOption('s1');
      await page.evaluate(()=>window.__failWorkOrder=true);
      await intake.getByRole('button',{name:'Enregistrer',exact:true}).click();
      await intake.getByText('Enregistrement impossible',{exact:true}).waitFor();
      assert.equal(await intake.getByLabel('Objet de l’intervention',{exact:true}).inputValue(),'QA — rétablir la ventilation');
      await page.evaluate(()=>window.__failWorkOrder=false);
      await intake.getByRole('button',{name:'Enregistrer',exact:true}).click();
      await intake.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>window.__data.workOrders.filter(row=>row.id==='qa-new-wo').length),1);
      const submitted=await page.evaluate(()=>window.__calls.filter(row=>row.action==='create-work-order').at(-1).input);
      assert.equal(submitted.status,undefined);
      assert.equal(submitted.repairMode,undefined);
      assert.equal(submitted.siteId,'s1');
      await page.getByRole('heading',{name:'QA — rétablir la ventilation',exact:true}).waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
