import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const url = process.env.BONZAI_UI_URL;
test(
  "billing navigation, ordinary customer and invoice forms remain readable and retain failed inputs",
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
      await page.route("**/*", (r) =>
        new URL(r.request().url()).origin === new URL(url).origin
          ? r.continue()
          : r.abort(),
      );
      await page.goto(url + "/src/assets/tokens.css");
      await page.setContent(
        '<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/components/company/company-workspace.css"><style>body{margin:0;background:var(--bz-canvas)}#app{padding:24px}*{box-sizing:border-box;transition:none!important}</style></head><body><main id="app" class="company-workspace"></main></body></html>',
      );
      await page.evaluate(async () => {
        const source=await fetch('/src/components/company/CompanyBilling.vue').then(r=>r.text());
        const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
        const { createApp, h, ref } = await import(runtime);
        const { default: View } =
          await import("/src/components/company/CompanyBilling.vue");
        const { createI18nPlugin, i18n } = await import("/src/i18n/index.js");
        window.billingFixture = { failed: true, customers: [], invoices: [] };
        window.electronAPI = {
          db: {
            companyBilling: {
              snapshot: async () =>
                structuredClone({
                  profiles: [],
                  dossiers: [],
                  legacy: [],
                  workOrders: [],
                  contracts: [],
                  subcontractors: [],
                  events: [],
                  invoices: window.billingFixture.invoices,
                  clients: window.billingFixture.customers,
                }),
              saveCustomer: async (c, input) => {
                if (window.billingFixture.failed)
                  throw new Error("Fixture storage unavailable");
                const row = { ...input, id: "client-fixture" };
                window.billingFixture.customers.push(row);
                return row;
              },
              attachEvidence: async (c, kind, id, input) => {
                const row = window.billingFixture.invoices.find(
                  (i) => i.id === id,
                );
                row.revision = (row.revision || 0) + 1;
                row.attachments = [
                  ...(row.attachments || []),
                  {
                    id: "proof-fixture",
                    filename: input.filename,
                    blobId: "fixture-blob",
                    blobExt: "txt",
                  },
                ];
                window.billingFixture.evidence = { kind, id, input };
                return structuredClone(row);
              },
              saveInvoice: async (c, input) => {
                window.billingFixture.input = input;
                const row = {
                  ...input,
                  id: "invoice-fixture",
                  number: null,
                  status: "draft",
                  issues: [],
                  totalCents: 12000,
                  amountDueCents: 12000,
                };
                window.billingFixture.invoices.push(row);
                return row;
              },
            },
          },
        };
        const billingView = ref(null);
        window.billingFixture.openInvoice = (...args) =>
          billingView.value.openInvoice(...args);
        createApp({
          render: () =>
            h(View, {
              ref: billingView,
              companyId: "fixture",
              gmaoData: {
                workOrders: [
                  {
                    id: "wo-fixture",
                    number: "OI-27",
                    title: "Quarterly maintenance",
                  },
                ],
              },
              onOpenWorkOrder: (id) => {
                window.billingFixture.openedWorkOrder = id;
              },
            }),
        })
          .use(createI18nPlugin(i18n))
          .mount("#app");
      });
      await page.getByRole("button", { name: "Clients", exact: true }).click();
      await page
        .getByRole("button", { name: "New client", exact: true })
        .click();
      await page
        .getByLabel("Client name", { exact: true })
        .fill("Atelier Montparnasse");
      await page
        .getByLabel("Email", { exact: true })
        .fill("billing@example.invalid");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Fixture storage unavailable" })
        .waitFor();
      assert.equal(
        await page.getByLabel("Client name", { exact: true }).inputValue(),
        "Atelier Montparnasse",
      );
      assert.ok(
        await page
          .getByRole("button", { name: "Save", exact: true })
          .isEnabled(),
      );
      await page.evaluate(() => (window.billingFixture.failed = false));
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "detached" });
      await page
        .getByRole("button", { name: "Customer invoices", exact: true })
        .click();
      await page
        .getByRole("button", { name: "New invoice", exact: true })
        .click();
      assert.equal(await page.locator(".billing-total strong").innerText(), "—",
        "An incomplete invoice shows a neutral total, not a validation error in metric typography");
      await page
        .getByRole("dialog")
        .getByRole("combobox")
        .nth(0)
        .selectOption("client-fixture");
      assert.equal(
        await page
          .getByRole("dialog")
          .getByRole("combobox")
          .nth(2)
          .inputValue(),
        "standalone",
      );
      await page
        .getByLabel("Issuer", { exact: true })
        .fill("Consulting Atelier");
      await page
        .getByLabel("Issuer registration number", { exact: true })
        .fill("123456789");
      await page
        .getByLabel("Recipient", { exact: true })
        .fill("Atelier Montparnasse");
      await page.getByLabel("Description", { exact: true }).fill("Consulting");
      await page
        .getByLabel("Unit price excl. tax", { exact: true })
        .fill("100");
      for (const theme of ["default", "light"])
        for (const width of [1440, 390]) {
          await page.evaluate(
            (t) => (document.documentElement.dataset.theme = t),
            theme,
          );
          await page.setViewportSize({ width, height: 1000 });
          assert.ok(
            await page
              .getByRole("dialog")
              .evaluate((e) => e.scrollWidth <= e.clientWidth),
            `${theme}/${width} modal fits`,
          );
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          );
          await page.screenshot({
            path: `/tmp/bonzai-billing-form-${theme}-${width}.png`,
          });
        }
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "detached" });
      const saved = await page.evaluate(() => window.billingFixture.input);
      assert.equal(saved.kind, "standalone");
      assert.deepEqual(saved.workOrderIds, []);
      assert.equal(saved.lines[0].unitCents, 10000);
      await page.locator(".billing-detail__head").waitFor();
      assert.equal(await page.locator(".billing-record").count(), 1);
      await page.locator('.billing-evidence input[type="file"]').setInputFiles({
        name: "acceptance-proof.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Verified receipt fixture"),
      });
      await page
        .locator(".billing-file-status")
        .filter({ hasText: "File stored" })
        .waitFor();
      assert.ok(
        await page
          .getByRole("button", { name: "Attach evidence", exact: true })
          .isVisible(),
      );
      assert.equal(
        await page.locator('.billing-evidence input[type="file"]').isVisible(),
        false,
      );
      const evidence = await page.evaluate(
        () => window.billingFixture.evidence,
      );
      assert.equal(evidence.kind, "invoice");
      assert.equal(
        Buffer.from(evidence.input.base64, "base64").toString(),
        "Verified receipt fixture",
      );
      await page.evaluate(() => {
        window.billingFixture.invoices[0].workOrderIds = ["wo-fixture"];
      });
      // Refresh the snapshot through the existing saved-evidence path, using local fixture data only.
      await page.locator('.billing-evidence input[type="file"]').setInputFiles({
        name: "work-order-proof.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Work order fixture"),
      });
      await page
        .getByRole("button", { name: /OI-27.*Quarterly maintenance/ })
        .click();
      assert.equal(
        await page.evaluate(() => window.billingFixture.openedWorkOrder),
        "wo-fixture",
      );
      for (const theme of ["default", "light"])
        for (const width of [1440, 390]) {
          await page.evaluate(
            (t) => (document.documentElement.dataset.theme = t),
            theme,
          );
          await page.setViewportSize({ width, height: 1000 });
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `${theme}/${width} register fits`,
          );
          assert.ok(
            await page
              .locator(".billing-progress")
              .evaluate((el) => el.scrollWidth <= el.clientWidth),
            `${theme}/${width} invoice stages remain visible`,
          );
          const control = await page
            .getByRole("button", { name: "Download PDF", exact: true })
            .evaluate((el) => {
              const s = getComputedStyle(el);
              return {
                fg: s.color,
                bg: s.backgroundColor,
                disabled: el.disabled,
              };
            });
          console.log(theme, width, control);
          await page.screenshot({
            path: `/tmp/bonzai-billing-${theme}-${width}.png`,
            fullPage: true,
          });
        }
      await page.evaluate(() =>
        window.billingFixture.openInvoice("invoice-fixture", 999),
      );
      await page
        .getByText(
          "This invoice has changed since approval was requested. Review the current version; the previous request needs to be renewed.",
          { exact: true },
        )
        .waitFor();
      await page.evaluate(() =>
        window.billingFixture.openInvoice("missing-invoice", 1),
      );
      await page
        .getByRole("alert")
        .filter({
          hasText: "The requested invoice was not found in this team.",
        })
        .waitFor();
      assert.equal(
        await page.locator(".billing-detail__head").count(),
        0,
        "missing IDs never fall back to another invoice",
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
