import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const url = process.env.BONZAI_UI_URL;
test(
  "Purchasing request, supplier and stock views remain usable across themes and widths",
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
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === new URL(url).origin
          ? route.continue()
          : route.abort(),
      );
      await page.goto(`${url}/src/assets/tokens.css`);
      await page.setContent(
        '<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/components/company/company-workspace.css"><style>body{margin:0;background:var(--bz-canvas);color:var(--bz-fg)}*{box-sizing:border-box}</style></head><body><main id="app" class="company-workspace"></main></body></html>',
      );
      await page.evaluate(async () => {
        const snapshot = {
          settings: { directionThresholdCents: null },
          requests: [
            {
              id: "request",
              title: "Replacement pump for chilled-water return circuit",
              description:
                "Motor reference checked against the equipment plate.",
              type: "intervention",
              status: "requested",
              technicalConfirmed: true,
              items: [
                {
                  id: "line",
                  label: "Condensate pump",
                  quantity: 2,
                  brand: "Daikin",
                  manufacturerReference: "PUMP-2026",
                },
              ],
              createdAt: Date.now(),
              context: {
                workOrderNumber: "OI-2026-42",
                title: "Workshop cooling",
                asset: {
                  brand: "Daikin",
                  modelReference: "EWAT",
                  serialNumber: "00042",
                },
                diagnosis:
                  "Pump fails under load; supplier compatibility needs confirmation.",
                documents: [],
              },
            },
          ],
          suppliers: [
            {
              id: "supplier",
              name: "Martinique Technical Supplies",
              region: "local",
              brands: ["Daikin", "Midea"],
              families: ["Cooling", "Electrical"],
              contacts: [
                {
                  name: "Technical sales",
                  channel: "email",
                  address: "technical.sales@example.invalid",
                },
              ],
            },
          ],
          items: [
            {
              id: "item",
              name: "Condensate pump",
              sku: "PUMP-2026",
              brand: "Daikin",
              onHand: 4,
              reserved: 2,
              available: 2,
              minimum: 3,
            },
          ],
          quotes: [
            {
              id: "quote",
              requestId: "request",
              supplierId: "supplier",
              supplierName: "Martinique Technical Supplies",
              reference: "DEV-42",
              totalCents: 48000,
              leadDays: 3,
              region: "local",
              compatible: true,
              transport: "local",
              transportConfirmed: true,
            },
          ],
          equipment: [
            {
              id: "tool",
              name: "Recovery station",
              reference: "TOOL-2026-004",
              type: "shared",
              status: "available",
            },
          ],
          reviews: [],
          orders: [],
          receipts: [],
          invoices: [],
          payments: [],
          rfqs: [],
          replies: [],
          approvals: [],
          preferences: [],
          history: [],
          forecast: [],
          dpgf: [],
        };
        window.purchasingFixture = {
          snapshot,
          saves: [],
          paymentPreparations: [],
          fail: true,
        };
        window.electronAPI = {
          db: {
            purchasing: {
              snapshot: async () => structuredClone(snapshot),
              onChanged: () => () => {},
              preparePayment: async (_id, invoiceId, value) => {
                window.purchasingFixture.paymentPreparations.push({
                  invoiceId,
                  value,
                });
                const dossier = {
                  id: "payment-dossier",
                  invoiceId,
                  issueId: "finance-task",
                  supplierName: "Martinique Technical Supplies",
                  amountCents: 48000,
                  invoiceReference: "INV-42",
                  orderNumber: "PO-42",
                  dueAt: Date.now(),
                  missing: ["verified_bank_details"],
                  financeRole: "CFO",
                };
                snapshot.paymentDossiers = [dossier];
                return dossier;
              },
              saveRequest: async (_id, value) => {
                if (window.purchasingFixture.fail)
                  throw new Error("Storage unavailable");
                window.purchasingFixture.saves.push(value);
                return { id: "new" };
              },
            },
          },
        };
        const source = await fetch(
          "/src/components/company/CompanyPurchasing.vue",
        ).then((r) => r.text());
        const vue = source.match(
          /from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/,
        )[1];
        const { createApp, h } = await import(vue);
        const { default: View } =
          await import("/src/components/company/CompanyPurchasing.vue");
        const i18nUrl = source.match(
          /from ["']([^"']*\/i18n\/index\.js(?:\?[^"']*)?)["']/,
        )[1];
        const { i18n, createI18nPlugin } = await import(i18nUrl);
        i18n.setLocale("en");
        window.purchasingFixture.i18n = i18n;
        const vm = createApp({
          render: () => h(View, { companyId: "fixture", ref: "purchasing" }),
        })
          .use(createI18nPlugin())
          .mount("#app");
        window.purchasingFixture.view = vm.$refs.purchasing;
      });
      await page
        .getByRole("heading", {
          name: "Replacement pump for chilled-water return circuit",
        })
        .waitFor();
      for (const theme of ["default", "light"])
        for (const width of [1440, 390]) {
          await page.evaluate(
            (theme) => (document.documentElement.dataset.theme = theme),
            theme,
          );
          await page.setViewportSize({ width, height: 1000 });
          await page.evaluate(() => document.fonts.ready);
          for (const section of [
            "Requests",
            "Stock",
            "Equipment",
            "Suppliers",
          ]) {
            await page
              .getByRole("navigation", { name: "Purchasing sections" })
              .getByRole("button", { name: section, exact: true })
              .click();
            if (section === "Requests")
              await page.screenshot({
                path: `/tmp/bonzai-purchasing-requests-${theme}-${width}.png`,
                fullPage: true,
              });
            assert.ok(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              `${theme}/${width}/${section}: no page overflow`,
            );
          }
          await page.screenshot({
            path: `/tmp/bonzai-purchasing-${theme}-${width}.png`,
            fullPage: true,
          });
        }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page
        .getByRole("navigation", { name: "Purchasing sections" })
        .getByRole("button", { name: "Requests", exact: true })
        .click();
      await page
        .getByRole("button", { name: "New request", exact: true })
        .click();
      const selectStyle = await page
        .locator(".buy-form select")
        .first()
        .evaluate((el) => ({
          appearance: getComputedStyle(el).appearance,
          image: getComputedStyle(el).backgroundImage,
          position: getComputedStyle(el).backgroundPosition,
        }));
      assert.equal(selectStyle.appearance, "none");
      assert.notEqual(
        selectStyle.image,
        "none",
        "Teleported modal keeps themed inset chevrons",
      );
      assert.match(selectStyle.position, /14px/);
      await page
        .getByLabel("Request title", { exact: true })
        .fill("Replacement safety gloves");
      await page
        .getByLabel("Description", { exact: true })
        .fill("Insulated safety gloves");
      await page
        .getByLabel("I reviewed these records and confirm this operation.")
        .check();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Storage unavailable" })
        .waitFor();
      assert.equal(
        await page.getByLabel("Request title", { exact: true }).inputValue(),
        "Replacement safety gloves",
        "failed persistence retains draft",
      );
      await page.getByLabel("Request title", { exact: true }).focus();
      assert.equal(
        await page
          .getByLabel("Request title", { exact: true })
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.evaluate(() => (window.purchasingFixture.fail = false));
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(
        await page.evaluate(
          () => window.purchasingFixture.saves[0].items[0].label,
        ),
        "Insulated safety gloves",
      );
      await page.evaluate(() => {
        const f = window.purchasingFixture;
        f.snapshot.rfqs = [
          {
            id: "approved-draft",
            requestId: "request",
            revision: 7,
            subject: "Reviewed supplier quote request",
            message: "Two condensate pumps; confirm delivery to the workshop.",
            contacts: [
              { channel: "email", address: "supplier@example.invalid" },
            ],
            status: "draft",
          },
        ];
        f.snapshot.orders = [
          {
            id: "order",
            requestId: "request",
            supplier: { name: "Martinique Technical Supplies" },
            number: "PO-42",
            totalCents: 48000,
            items: [],
          },
        ];
        f.snapshot.invoices = [
          {
            id: "invoice",
            orderId: "order",
            reference: "INV-42",
            totalCents: 48000,
            dueAt: Date.now(),
            exceptions: [],
            status: "matched",
          },
        ];
        f.snapshot.requests[0].status = "received";
      });
      assert.equal(
        await page.evaluate(() =>
          window.purchasingFixture.view.openRfq("approved-draft", 7),
        ),
        true,
      );
      assert.equal(
        await page
          .locator("#buy-rfq-approved-draft")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      assert.equal(
        await page.evaluate(() =>
          window.purchasingFixture.view.openRfq("approved-draft", 6),
        ),
        false,
      );
      await page
        .getByRole("alert")
        .filter({ hasText: "changed after the approval request" })
        .waitFor();
      await page.evaluate(() =>
        window.purchasingFixture.view.openRfq("approved-draft", 7),
      );
      await page
        .getByRole("button", { name: "Prepare payment", exact: true })
        .click();
      assert.equal(
        await page.evaluate(
          () => window.purchasingFixture.paymentPreparations.length,
        ),
        0,
        "Opening payment preparation does not enqueue or execute anything",
      );
      await page
        .getByLabel("I reviewed these records and confirm this operation.")
        .check();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(
        await page.evaluate(
          () => window.purchasingFixture.paymentPreparations[0].invoiceId,
        ),
        "invoice",
      );
      await page
        .getByRole("button", { name: "Open finance task · CFO", exact: true })
        .waitFor();
      await page.evaluate(() => window.purchasingFixture.i18n.setLocale("fr"));
      await page.getByRole("button", { name: "Paramètres achats" }).click();
      await page
        .getByRole("heading", { name: "Paramètres achats", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Ajouter un responsable", exact: true })
        .click();
      assert.equal(await page.getByLabel("Nom", { exact: true }).count(), 1);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
