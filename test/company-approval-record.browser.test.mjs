import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const url = process.env.BONZAI_UI_URL;
test(
  "approval and outcome review open the exact saved financial record without executing it",
  { skip: !url, timeout: 30000 },
  async () => {
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    try {
      const page = await browser.newPage({
          viewport: { width: 1280, height: 900 },
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
        '<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/components/company/company-workspace.css"></head><body><main id="app" class="company-workspace"></main></body></html>',
      );
      await page.evaluate(async () => {
        const source = await fetch('/src/components/company/CompanyInbox.vue').then(response => response.text());
        const runtime = source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
        const { createApp, h } = await import(runtime);
        const { default: Inbox } =
          await import("/src/components/company/CompanyInbox.vue");
        const { default: Review } =
          await import("/src/components/company/CompanyTaskReview.vue");
        const { i18n, createI18nPlugin } = await import("/src/i18n/index.js");
        i18n.setLocale("en");
        window.approvalFixture = { opened: [], executed: 0 };
        const invoice = {
            type: "billing.chorusAction",
            recordId: "invoice-42",
            input: { revision: 7, operation: "submit" },
          },
          rfq = {
            type: "purchasing.sendRfq",
            recordId: "rfq-19",
            input: { revision: 3 },
          };
        const props = {
          state: {
            approvals: [
              { id: "a1", action: invoice },
              { id: "a2", action: rfq },
              {
                id: "a3",
                action: {
                  type: "purchasing.approveRequest",
                  recordId: "purchase-8",
                  input: { revision: 4, quoteRevision: 12 },
                },
              },
              {
                id: "a4",
                action: {
                  type: "purchasing.issueOrder",
                  recordId: "purchase-9",
                  input: { revision: 6 },
                },
              },
            ],
          },
          charter: { name: "Local fixture" },
          store: { approve: () => window.approvalFixture.executed++ },
          onOpenOperationalRecord: (target) =>
            window.approvalFixture.opened.push(target),
        };
        let app = createApp({ render: () => h(Inbox, props) });
        app.use(createI18nPlugin()).mount("#app");
        window.approvalFixture.review = () => {
          app.unmount();
          app = createApp({
            render: () =>
              h(Review, {
                companyId: "fixture",
                issue: {
                  title: "Verify submission",
                  execution: {
                    steps: [
                      {
                        id: "s1",
                        status: "unknown",
                        action: { ...invoice, recordId: "unresolved-id" },
                        resolvedAction: invoice,
                      },
                    ],
                  },
                },
                onOpenOperationalRecord: (target) =>
                  window.approvalFixture.opened.push(target),
              }),
          });
          app.use(createI18nPlugin()).mount("#app");
        };
      });
      await page
        .getByRole("button", { name: "View invoice", exact: true })
        .click();
      await page
        .locator(".inbox-item")
        .filter({ hasText: "Send supplier request" })
        .click();
      await page
        .getByRole("button", { name: "View supplier request", exact: true })
        .click();
      for (const title of [
        "Approve purchase request",
        "Create purchase order",
      ]) {
        await page.locator(".inbox-item").filter({ hasText: title }).click();
        await page
          .getByRole("button", { name: "View purchase request", exact: true })
          .click();
      }
      assert.deepEqual(
        await page.evaluate(() => window.approvalFixture.opened),
        [
          { kind: "invoice", id: "invoice-42", revision: 7 },
          { kind: "rfq", id: "rfq-19", revision: 3 },
          { kind: "purchaseRequest", id: "purchase-8", revision: 4 },
          { kind: "purchaseRequest", id: "purchase-9", revision: 6 },
        ],
      );
      assert.equal(
        await page.evaluate(() => window.approvalFixture.executed),
        0,
      );
      await page.evaluate(() => window.approvalFixture.review());
      await page
        .getByRole("button", { name: "View invoice", exact: true })
        .click();
      assert.deepEqual(
        await page.evaluate(() => window.approvalFixture.opened.at(-1)),
        { kind: "invoice", id: "invoice-42", revision: 7 },
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
