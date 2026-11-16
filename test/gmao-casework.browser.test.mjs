import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { chromium } from "playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

test(
  "CMMS scan review, evidence, pricing and aliases remain usable at desktop and narrow widths",
  { timeout: 120000 },
  async () => {
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), "bonzai-cmms-vite-"));
    const probe = net.createServer();
    await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const server = await createServer({
      configFile: false,
      root: process.cwd(),
      cacheDir: cache,
      plugins: [vue()],
      server: { host: "127.0.0.1", port, strictPort: true },
      optimizeDeps: { include: ["vue"] },
    });
    let browser;
    try {
      await server.listen();
      const url = server.resolvedUrls.local[0];
      browser = await chromium.launch({ channel: "chrome", headless: true });
      const page = await browser.newPage({
          viewport: { width: 1440, height: 1000 },
        }),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.setDefaultTimeout(15000);
      await page.route("**/*", (r) =>
        new URL(r.request().url()).origin === new URL(url).origin
          ? r.continue()
          : r.abort()
      );
      const pdf = await PDFDocument.create(),
        font = await pdf.embedFont(StandardFonts.Helvetica),
        sheet = pdf.addPage([595, 842]);
      sheet.drawText("BON D INTERVENTION - SYNTHETIC TEST", {
        x: 35,
        y: 780,
        size: 16,
        font,
      });
      sheet.drawText("DI 02210 - Motor reuse - 23/09/2016", {
        x: 35,
        y: 740,
        size: 12,
        font,
      });
      sheet.drawText("Signature technician: present. Customer visa: blank.", {
        x: 35,
        y: 700,
        size: 12,
        font,
      });
      const bytes = [...(await pdf.save())];
      await page.goto(url + "src/assets/tokens.css");
      await page.setContent(
        '<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fields.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg);font-family:"Fira Sans",sans-serif}main{max-width:1600px;margin:auto}section{min-width:0}button{font:inherit}</style></head><body><main id="app"></main></body></html>'
      );
      await page.evaluate(async (bytes) => {
        const source = await fetch(
            "/src/components/company/CompanyCasework.vue"
          ).then((r) => r.text()),
          vuePath = source.match(
            /from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/
          )?.[1];
        const { createApp, h, reactive } = await import(vuePath);
        const { i18n } = await import("/src/i18n/index.js");
        i18n.setLocale("fr");
        const { default: Cases } = await import(
            "/src/components/company/CompanyCasework.vue"
          ),
          { default: Archive } = await import(
            "/src/components/company/MaintenanceArchiveReview.vue"
          ),
          { default: Pricing } = await import(
            "/src/components/company/CompanyPricingVersions.vue"
          ),
          { default: Aliases } = await import(
            "/src/components/company/CompanySiteAliases.vue"
          );
        const state = reactive({
          mode: "field",
          workOrderId: "w",
          fail: false,
          records: [],
          data: {
            title: "Remplacement du moteur et contrôle des deux unités",
            site: "Ateliers Nord",
            occurredOn: "2016-09-23",
            references: [
              { type: "DI", value: "02210", issuer: "Client", year: 2016 },
            ],
            equipment: [],
            parts: [],
            visits: [],
            fluids: [],
            signatures: [],
            blockers: [],
          },
        });
        const sites = [{ id: "s", name: "Ateliers Nord", trigram: "NTH" }],
          assets = [{ id: "a", assetCode: "K7", serialNumber: "SER-129" }];
        window.fixture = { state, i18n };
        window.electronAPI = {
          db: {
            gmao: { snapshot: async () => ({ sites, assets }) },
            blobs: { read: async () => new Uint8Array(bytes) },
            gmaoCasework: {
              snapshot: async () => ({
                records: JSON.parse(JSON.stringify(state.records)),
              }),
              findMatches: async () => [],
              history: async () => [],
              stockMovements: async (_, { workOrderId }) => {
                state.lastStockWork = workOrderId;
                if (workOrderId === "w")
                  return new Promise((resolve) => {
                    window.fixture.finishStock = () =>
                      resolve({
                        movements: [
                          {
                            id: "old-movement",
                            reference: "Ancien dossier",
                            type: "consume",
                            quantity: 1,
                          },
                        ],
                      });
                  });
                return {
                  movements: [
                    {
                      id: "new-movement",
                      reference: "Nouveau dossier",
                      type: "consume",
                      quantity: 1,
                    },
                  ],
                };
              },
              saveRecord: async (_, input) => {
                if (state.fail)
                  throw new Error("Enregistrement indisponible. Réessayez.");
                state.records.push({
                  ...input.data,
                  id: "saved",
                  kind: input.kind,
                  revision: 1,
                });
              },
              savePricingVersion: async (_, input) =>
                state.records.push({
                  id: "p",
                  kind: "pricing",
                  contractId: input.contractId,
                  profile: input.profile,
                }),
              saveSiteAlias: async (_, input) =>
                state.records.push({
                  id: "alias",
                  kind: "site_alias",
                  ...input,
                }),
            },
          },
        };
        createApp({
          render: () =>
            state.mode === "field"
              ? h(Cases, {
                  companyId: "c",
                  workOrderId: state.workOrderId,
                  assets,
                })
              : state.mode === "archive"
              ? h(Archive, {
                  companyId: "c",
                  source: { blobId: "b", ext: "pdf" },
                  modelValue: state.data,
                  "onUpdate:modelValue": (v) => (state.data = v),
                })
              : state.mode === "pricing"
              ? h(Pricing, {
                  companyId: "c",
                  contracts: [
                    {
                      id: "ct",
                      name: "Maintenance annuelle",
                      reference: "CT-1",
                    },
                  ],
                })
              : h(Aliases, { companyId: "c", sites }),
        }).mount("#app");
      }, bytes);
      await page.getByRole("button", { name: /Ajouter une preuve/ }).click();
      await page
        .getByLabel("Désignation", { exact: true })
        .fill("Unité de climatisation du bâtiment principal");
      await page
        .getByLabel("État après intervention")
        .selectOption("out_of_service");
      await page.evaluate(() => (window.fixture.state.fail = true));
      await page.getByRole("button", { name: "Enregistrer la preuve" }).click();
      await page.getByRole("alert").waitFor();
      assert.match(
        await page.getByLabel("Désignation", { exact: true }).inputValue(),
        /climatisation/
      );
      await page.evaluate(() => (window.fixture.state.fail = false));
      await page.getByRole("button", { name: "Enregistrer la preuve" }).click();
      await page
        .getByText("Unité de climatisation du bâtiment principal", {
          exact: true,
        })
        .waitFor();
      await page.getByRole("button", { name: /^Pièces/ }).click();
      await page.waitForFunction(
        () => typeof window.fixture.finishStock === "function"
      );
      await page.evaluate(
        () => (window.fixture.state.workOrderId = "new-work")
      );
      await page.waitForFunction(
        () => window.fixture.state.lastStockWork === "new-work"
      );
      await page.evaluate(() => window.fixture.finishStock());
      await page.getByRole("button", { name: /Ajouter une preuve/ }).click();
      const stockOptions = await page
        .getByLabel("Sortie de stock enregistrée (Achats)")
        .locator("option")
        .allTextContents();
      assert.ok(stockOptions.some((text) => text.includes("Nouveau dossier")));
      assert.ok(
        !stockOptions.some((text) => text.includes("Ancien dossier")),
        "a late response must never display another dossier's stock"
      );
      await page.getByRole("button", { name: "Annuler", exact: true }).click();
      await page.getByRole("button", { name: /^Équipements/ }).click();
      for (const mode of ["field", "archive", "pricing", "aliases"]) {
        await page.evaluate((mode) => (window.fixture.state.mode = mode), mode);
        if (mode === "archive") {
          await page.locator(".source-page img").waitFor();
          const b = await page.locator(".source-page").boundingBox();
          await page.mouse.move(b.x + b.width * 0.1, b.y + b.height * 0.1);
          await page.mouse.down();
          await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.2);
          await page.mouse.up();
          await page
            .getByLabel("Champ concerné", { exact: true })
            .fill("Visa client");
          await page.getByLabel("État dans la source").selectOption("blank");
          assert.equal(
            await page.evaluate(
              () => window.fixture.state.data.sourceLocations[0].state
            ),
            "blank"
          );
          assert.equal(
            await page.evaluate(
              () => window.fixture.state.data.sourceLocations[0].region.length
            ),
            4
          );
        }
        if (mode === "pricing") {
          await page.locator(".pricing-versions > summary").click();
          await page.locator(".pricing-head select").selectOption("ct");
          await page.getByRole("button", { name: /Nouvelle version/ }).click();
        }
        if (mode === "aliases")
          await page.locator(".site-aliases > summary").click();
        for (const theme of ["default", "light", "solarized"])
          for (const width of [1440, 800, 390]) {
            await page.evaluate(
              (theme) => (document.documentElement.dataset.theme = theme),
              theme
            );
            await page.setViewportSize({ width, height: 1000 });
            assert.ok(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth
              ),
              `${mode}/${theme}/${width} horizontal overflow`
            );
            const invisible = await page
              .locator("input,select,textarea")
              .evaluateAll((els) =>
                els
                  .filter((e) => e.offsetParent && e.type !== "checkbox")
                  .some((e) => {
                    const b = e.getBoundingClientRect();
                    return (
                      b.width < 50 || b.left < 0 || b.right > innerWidth + 1
                    );
                  })
              );
            assert.equal(
              invisible,
              false,
              `${mode}/${width} inputs stay usable`
            );
            if (theme === "default" && [1440, 390].includes(width))
              await page.screenshot({
                path: `/tmp/bonzai-cmms-${mode}-${width}.png`,
                fullPage: true,
                animations: "disabled",
              });
          }
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await server.close();
      fs.rmSync(cache, { recursive: true, force: true });
    }
  }
);
