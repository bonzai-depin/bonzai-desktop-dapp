import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
const url = process.env.BONZAI_UI_URL;
test(
  "application portal reviews exact fields and evidence; deliverables preview and return to their record",
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
      page.setDefaultTimeout(8000);
      await page.route("**/*", (r) =>
        new URL(r.request().url()).origin === new URL(url).origin
          ? r.continue()
          : r.abort(),
      );
      await page.goto(url + "/src/assets/tokens.css");
      await page.setContent(
        '<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{padding:24px;margin:0;color:var(--bz-fg);background:var(--bz-canvas)}*{box-sizing:border-box}</style><main id="app"></main>',
      );
      await page.evaluate(async () => {
        const src = await fetch(
          "/src/components/company/CompanyBrowserPanel.vue",
        ).then((r) => r.text());
        const runtime = src.match(
          /from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/,
        )[1];
        const { createApp, h } = await import(runtime),
          { default: Portal } =
            await import("/src/components/company/CompanyBrowserPanel.vue"),
          { default: Files } =
            await import("/src/components/company/CompanyOperationalFiles.vue");
        const { createI18nPlugin, i18n } = await import("/src/i18n/index.js");
        i18n.setLocale("en");
        const document = { id: "receipt", label: "School invoice.pdf" },
          dossier = {
            id: "application",
            title: "School cooling",
            beneficiary: "School A",
          };
        const observation = {
          title: "Grant form",
          url: "https://example.test/application",
          snapshotId: "snapshot",
          elements: [
            { id: 1, tag: "INPUT", type: "text", label: "Beneficiary" },
            { id: 2, tag: "INPUT", type: "file", label: "Invoice" },
            { id: 3, tag: "INPUT", type: "password", label: "Password" },
          ],
        };
        window.fixture = {
          calls: [],
          events: [],
          change: [],
          original: null,
        };
        window.electronAPI = {
          db: {
            companyGrants: {
              portalPackage: async () => ({
                dossier,
                documents: [document],
                preparation: { blockers: [] },
              }),
              snapshot: async () => ({ events: window.fixture.events }),
              onChanged: (cb) => {
                window.fixture.change.push(cb);
                return () => {};
              },
            },
            companyBrowser: Object.fromEntries(
              ["navigate", "inspect", "fillForm", "uploadDocument"].map(
                (method) => [
                  method,
                  async (company, input) => {
                    window.fixture.calls.push({ method, company, input });
                    return method === "fillForm" ? {} : observation;
                  },
                ],
              ),
            ),
            companyWorkspace: {
              deliverables: async () => ({
                rows: [
                  {
                    id: "grant:receipt",
                    recordId: "application",
                    kind: "grant",
                    title: "Review.md",
                    ext: "txt",
                    status: "Document",
                    updatedAt: Date.now(),
                  },
                ],
                total: 1,
              }),
              readDeliverable: async () => ({
                base64: btoa("# Verified dossier\n\n**Invoice** received."),
                ext: "txt",
              }),
            },
          },
        };
        createApp({
          render: () =>
            h("div", [
              h(Portal, {
                companyId: "team",
                dossierId: "application",
                initialUrl: "https://example.test",
              }),
              h(Files, {
                companyId: "team",
                onOpenRecord: (record) => (window.fixture.original = record),
              }),
            ]),
        })
          .use(createI18nPlugin())
          .mount("#app");
      });
      await page
        .getByRole("button", { name: "Open portal", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("Beneficiary", { exact: true }).inputValue(),
        "School A",
      );
      assert.equal(
        await page.getByLabel("Password", { exact: true }).count(),
        0,
      );
      await page
        .getByLabel("Beneficiary", { exact: true })
        .fill("School A · reviewed");
      await page
        .getByRole("button", { name: "Fill reviewed form", exact: true })
        .click();
      assert.deepEqual(
        await page.evaluate(
          () => window.fixture.calls.find((c) => c.method === "fillForm").input,
        ),
        {
          dossierId: "application",
          snapshotId: "snapshot",
          fields: [{ elementId: 1, value: "School A · reviewed" }],
        },
      );
      await page
        .getByRole("button", { name: "Read page", exact: true })
        .click();
      await page.getByLabel("Upload field", { exact: true }).selectOption("2");
      await page
        .getByLabel("Document", { exact: true })
        .selectOption("receipt");
      await page
        .getByRole("button", { name: "Upload document", exact: true })
        .click();
      assert.equal(
        await page.evaluate(() => window.fixture.calls.at(-1).input.dossierId),
        "application",
      );
      await page.evaluate(() => {
        window.fixture.events = [
          {
            id: "event",
            dossierId: "application",
            operation: "download",
            status: "attachment_failed",
            filename: "receipt.pdf",
            message: "Attachment test failure",
          },
        ];
        window.fixture.change.forEach((cb) => cb({ companyId: "team" }));
      });
      await page
        .getByRole("alert")
        .filter({ hasText: "Attachment test failure" })
        .waitFor();
      await page.getByRole("button", { name: /Review.md/ }).click();
      await page.getByRole("heading", { name: "Verified dossier" }).waitFor();
      await page.getByRole("button", { name: "Open original record" }).click();
      assert.deepEqual(await page.evaluate(() => window.fixture.original), {
        kind: "grant",
        id: "application",
      });
      for (const theme of ["default", "light"])
        for (const width of [1440, 390]) {
          await page.evaluate(
            (t) => (document.documentElement.dataset.theme = t),
            theme,
          );
          await page.setViewportSize({ width, height: 1000 });
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            `${theme}/${width} stays within the viewport`,
          );
          await page.screenshot({
            path: `/tmp/bonzai-documents-${theme}-${width}.png`,
            fullPage: true,
          });
        }
      const pdf = await PDFDocument.create();
      pdf
        .addPage([400, 220])
        .drawText("Verified PDF evidence", { x: 40, y: 130, size: 22 });
      await page.evaluate(
        (bytes) => {
          window.electronAPI.db.companyWorkspace.deliverables = async () => ({
            rows: [
              {
                id: "grant:pdf",
                recordId: "application",
                kind: "grant",
                title: "Invoice.pdf",
                ext: "pdf",
                status: "Document",
                updatedAt: Date.now(),
              },
            ],
            total: 1,
          });
          window.electronAPI.db.companyWorkspace.readDeliverable =
            async () => ({ base64: bytes, ext: "pdf" });
          window.fixture.change.forEach((cb) => cb({ companyId: "team" }));
        },
        await pdf.saveAsBase64(),
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole("button", { name: /Invoice.pdf/ }).click();
      await page
        .getByRole("img", { name: "Verified PDF evidence", exact: true })
        .waitFor();
      await page.locator(".operational-files article").scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      await page
        .locator(".operational-files article")
        .screenshot({ path: "/tmp/bonzai-document-pdf.png" });
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
