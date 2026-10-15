import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const url = process.env.BONZAI_UI_URL;
test(
  "Record flow exposes linked invoices, reviewed email/SMS and persistent reminder controls across themes",
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
        '<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;background:var(--bz-canvas)}#app{padding:24px;max-width:900px;margin:auto}*{box-sizing:border-box}</style></head><body><main id="app"></main></body></html>',
      );
      await page.evaluate(async () => {
        const { createApp, h, ref } =
          await import("/node_modules/.vite/deps/vue.js");
        const { default: View } =
          await import("/src/components/company/CompanyRecordFlow.vue");
        const { createI18nPlugin, i18n } = await import("/src/i18n/index.js");
        const kind = ref("workOrder"),
          data = {
            record: {
              status: "reported",
              title: "OI-2026-014",
              terminal: false,
              version: "v1",
            },
            contact: { email: "client@example.invalid" },
            messages: [],
            reminder: null,
            attachments: [],
            parts: [
              {
                procurementId: "p1",
                partKey: "k1",
                workOrderId: "wo",
                description: "Pompe de circulation / Circulation pump",
                quantity: 2,
                received: 2,
                billedQuantity: 1,
                status: "received",
                supplierInvoices: [
                  {
                    id: "s1",
                    reference: "SUP-2026-14",
                    orderNumber: "PO-22",
                    costUnitCents: 15000,
                    status: "matched",
                  },
                ],
                customerInvoices: [
                  {
                    id: "c1",
                    number: "BZF-2026-11",
                    status: "draft",
                    quantity: 1,
                  },
                ],
              },
            ],
          };
        window.fixture = { kind, i18n, data, sends: 0 };
        window.electronAPI = {
          db: {
            recordOperations: {
              snapshot: async () => structuredClone(data),
              onChanged: () => () => {},
              prepareMessage: async (c, input) => {
                const m = {
                  ...input,
                  id: "m1",
                  status: "draft",
                  revision: 1,
                  createdAt: Date.now(),
                  attachment: input.attachPdf
                    ? { filename: "OI-2026-014.pdf" }
                    : null,
                };
                data.messages = [m];
                return structuredClone(m);
              },
              sendMessage: async (c, id, approval) => {
                if (!approval.confirmed) throw Error("Not approved");
                window.fixture.sends++;
                data.messages[0].status = "submitted";
                return structuredClone(data.messages[0]);
              },
              saveCollection: async (c,input)=>{data.collection={...input,id:'response'};window.fixture.response=input;},
              saveReminder: async (c, input) => {
                data.reminder = { ...input, nextAt: Date.now() + 86400000 };
                window.fixture.reminder = input;
              },
              setPartDisposition: async () => {},
            },
          },
        };
        createApp({
          render: () =>
            h(View, {
              companyId: "fixture",
              kind: kind.value,
              recordId: "wo",
              "onPrepare-invoice": (parts) => (window.fixture.parts = parts),
            }),
        })
          .use(createI18nPlugin())
          .mount("#app");
      });
      await page.getByRole("heading", { name: "Parts & invoices" }).waitFor();
      for (const locale of ["en", "fr"])
        for (const theme of ["default", "light"])
          for (const width of [1440, 390]) {
            await page.evaluate(
              ({ locale, theme }) => {
                window.fixture.i18n.setLocale(locale);
                document.documentElement.setAttribute("data-theme", theme);
              },
              { locale, theme },
            );
            await page.setViewportSize({ width, height: 1000 });
            assert.ok(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              "No page overflow",
            );
            await page.screenshot({
              path: `/tmp/bonzai-record-flow-${locale}-${theme}-${width}.png`,
              fullPage: true,
            });
          }
      await page.evaluate(() => window.fixture.i18n.setLocale("en"));
      await page
        .getByRole("button", { name: "Prepare customer invoice", exact: true })
        .click();
      assert.equal(
        (await page.evaluate(() => window.fixture.parts))[0].procurementId,
        "p1",
      );
      await page.getByRole("button", { name: "Email", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await dialog
        .getByLabel("From", { exact: true })
        .fill("sender@example.invalid");
      assert.equal(
        await dialog.getByLabel("To", { exact: true }).inputValue(),
        "client@example.invalid",
      );
      await dialog
        .getByRole("button", { name: "Preview before sending" })
        .click();
      assert.equal(
        await dialog
          .getByRole("button", { name: "Send", exact: true })
          .isDisabled(),
        true,
      );
      await dialog.getByRole("switch").check();
      await dialog.getByRole("button", { name: "Send", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      assert.equal(await page.evaluate(() => window.fixture.sends), 1);
      await page
        .getByText("Communication history", { exact: false })
        .first()
        .click();
      assert.equal(
        await page.locator(".record-history .is-done").count(),
        2,
        "Submitted never claims delivered",
      );
      await page.locator(".record-reminder summary").filter({hasText:"Reminders"}).click();
      await page
        .getByRole("switch", { name: "Review when the status stalls" })
        .check();
      await page.getByLabel("After (days)").fill("3");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      assert.equal(
        (await page.evaluate(() => window.fixture.reminder)).days,
        3,
      );
      await page.evaluate(()=>{window.fixture.kind.value='customerInvoice';});
      await page.locator('summary').filter({hasText:'Payment follow-up'}).click();
      await page.getByLabel('Customer / supplier response',{exact:true}).fill('Customer disputes scope');
      await page.getByLabel('Evidence reference',{exact:true}).fill('Email from customer');
      await page.getByRole('button',{name:'Save response',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.fixture.response.status),'disputed');
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
