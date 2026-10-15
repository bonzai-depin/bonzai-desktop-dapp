import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const url = process.env.BONZAI_UI_URL;
test(
  "maintenance evidence stays compact and operable across themes, languages and constrained widths",
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
      page.setDefaultTimeout(10000);
      await page.route("**/*", (r) =>
        new URL(r.request().url()).origin === new URL(url).origin
          ? r.continue()
          : r.abort(),
      );
      await page.goto(url + "/src/assets/tokens.css");
      await page.setContent(
        '<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/components/company/company-workspace.css"><style>body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg);font-family:"Fira Sans",sans-serif}*{box-sizing:border-box}</style></head><body><main id="app" class="company-workspace"></main></body></html>',
      );
      await page.evaluate(async () => {
        const source = await fetch(
            "/src/components/company/CompanyMaintenanceControls.vue",
          ).then((r) => r.text()),
          vuePath = source.match(
            /from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/,
          )?.[1];
        if (!vuePath) throw new Error("Vue runtime unavailable");
        const { createApp, h, reactive } = await import(vuePath),
          { default: View } =
            await import("/src/components/company/CompanyMaintenanceControls.vue"),
          { i18n, createI18nPlugin } = await import(
            source.match(
              /from ["']([^"']*\/i18n\/index\.js(?:\?[^"']*)?)["']/,
            )?.[1] || "/src/i18n/index.js"
          );
        i18n.setLocale("en");
        const data = reactive({
          sites: [
            { id: "site", name: "Ateliers Martin · production et bureaux" },
          ],
          assets: [
            {
              id: "asset",
              siteId: "site",
              assetCode: "ESP-004",
              equipmentType:
                "Pressure vessel with a long descriptive location and equipment name",
            },
          ],
          plans: [],
          documents: [],
          outbox: [],
          workOrders: [],
        });
        const fixture = {
          i18n,
          data,
          fail: false,
          saves: [],
          opened: [],
          state: {
            records: [],
            workOrders: [],
            obligations: [
              {
                kind: "periodic_report",
                key: "p0_weekly",
                reportId: "p0_weekly:2026-10-01",
                siteId: "site",
                title: "Bilan P0 hebdomadaire",
                dueAt: Date.now() - 86400000,
                status: "late",
              },
            ],
          },
        };
        window.fixture = fixture;
        window.electronAPI = {
          db: {
            gmaoMaintenance: {
              snapshot: async () => structuredClone(fixture.state),
              onChanged: (cb) => {
                fixture.changed = cb;
                return () => {
                  fixture.changed = null;
                };
              },
              saveRecord: async (company, input) => {
                if (fixture.fail)
                  throw new Error("Evidence storage unavailable");
                fixture.saves.push(input);
                fixture.state.records.push({
                  ...input,
                  id: "record" + fixture.saves.length,
                });
              },
              prepareReportTask: async () => ({ issueId: "report-task" }),
            },
          },
        };
        createApp({
          render: () =>
            h(View, {
              companyId: "fixture",
              gmao: data,
              onOpenTask: (id) => fixture.opened.push(id),
            }),
        })
          .use(createI18nPlugin())
          .mount("#app");
      });
      await page.getByRole("heading", { name: "Contract controls" }).waitFor();
      assert.equal(
        await page.locator(".controls-disclosure").getAttribute("open"),
        null,
        "controls do not bury existing operation settings",
      );
      await page.getByRole("button", { name: /Deadlines to follow/ }).click();
      await page.getByRole("button", { name: /Weekly P0 report/ }).click();
      assert.deepEqual(await page.evaluate(() => window.fixture.opened), [
        "report-task",
      ]);
      await page.locator(".controls-disclosure>summary").press("Enter");
      await page.getByRole("button", { name: /People/ }).click();
      await page
        .getByLabel("Full name", { exact: true })
        .fill("Camille Martin");
      await page
        .getByLabel("Employer", { exact: true })
        .fill("Martin services");
      await page
        .getByLabel("I confirm these details and the recorded evidence.", {
          exact: true,
        })
        .check();
      await page.evaluate(() => (window.fixture.fail = true));
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Evidence storage unavailable" })
        .waitFor();
      assert.equal(
        await page.getByLabel("Full name", { exact: true }).inputValue(),
        "Camille Martin",
      );
      await page.evaluate(() => {
        window.fixture.state.obligations.push({
          kind: "evidence_expiry",
          recordKind: "person",
          recordId: "expiry",
          siteId: "site",
          title: "Accès",
          dueAt: Date.now() - 10000,
          status: "late",
        });
        window.fixture.changed({ companyId: "fixture" });
      });
      await page.waitForFunction(
        () =>
          document.querySelector(".obligation-summary .bz-metric")
            ?.textContent === "2",
      );
      assert.equal(
        await page.getByLabel("Full name", { exact: true }).inputValue(),
        "Camille Martin",
        "live evidence refresh preserves unsaved input",
      );
      await page.evaluate(() => (window.fixture.fail = false));
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("Saved.", { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(() => window.fixture.saves[0].data.name),
        "Camille Martin",
      );
      for (const locale of ["en", "fr"])
        for (const theme of ["default", "light"])
          for (const width of [1440, 800, 390]) {
            await page.evaluate(
              ({ locale, theme }) => {
                window.fixture.i18n.setLocale(locale);
                document.documentElement.dataset.theme = theme;
              },
              { locale, theme },
            );
            await page.setViewportSize({ width, height: 1000 });
            await page
              .getByRole("button", {
                name: new RegExp(
                  locale === "fr" ? "Exigences" : "Requirements",
                ),
              })
              .click()
              .catch(async (error) => {
                throw new Error(
                  error.message +
                    " " +
                    JSON.stringify({
                      labels: await page
                        .locator(".control-sections button")
                        .allTextContents(),
                      locale: await page.evaluate(
                        () => window.fixture.i18n.state.locale,
                      ),
                      errors,
                    }),
                );
              });
            assert.ok(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              locale + "/" + theme + "/" + width + " overflow",
            );
            await page.evaluate(() => scrollTo(0, 0));
            await page.screenshot({
              path: `/tmp/bonzai-maintenance-controls-${locale}-${theme}-${width}.png`,
              fullPage: false,
              animations: "disabled",
            });
          }
      assert.ok(
        (await page.getByRole("switch").count()) > 0,
        "Boolean controls use accessible styled switches",
      );
      const style = await page
        .locator(".control-check input")
        .first()
        .evaluate((el) => ({
          appearance: getComputedStyle(el).appearance,
          width: getComputedStyle(el).width,
        }));
      assert.equal(style.appearance, "none");
      assert.equal(style.width, "36px");
      const arrow = await page
        .locator(".control-form select")
        .first()
        .evaluate((el) => ({
          background: getComputedStyle(el).backgroundImage,
          padding: parseFloat(getComputedStyle(el).paddingRight),
        }));
      assert.notEqual(arrow.background, "none");
      assert.ok(
        arrow.padding >= 32,
        "select chevron has inset space under the real workspace styles",
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
