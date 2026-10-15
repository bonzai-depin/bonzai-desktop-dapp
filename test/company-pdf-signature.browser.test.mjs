import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
const url = process.env.BONZAI_UI_URL;
test(
  "a user draws and places a PO signature locally, preserving the source PDF",
  { skip: !url, timeout: 60000 },
  async () => {
    const doc = await PDFDocument.create();
    doc
      .addPage([600, 800])
      .drawText("Purchase order - signature below", { x: 40, y: 720 });
    const bytes = await doc.save(),
      base64 = Buffer.from(bytes).toString("base64");
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    try {
      const page = await browser.newPage({
          viewport: { width: 1000, height: 1000 },
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
        '<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><style>body{padding:24px;background:var(--bz-canvas);color:var(--bz-fg);font-family:sans-serif}main{max-width:600px;margin:auto}*{box-sizing:border-box}</style></head><body><main id="app"></main></body></html>',
      );
      await page.evaluate(async (base64) => {
        window.electronAPI = { db: { blobs: { read: async () => base64 } } };
        const { createApp, h } =
          await import("/node_modules/.vite/deps/vue.js");
        const { default: View } =
          await import("/src/components/company/CompanyPdfSignature.vue");
        const { createI18nPlugin } = await import("/src/i18n/index.js");
        createApp({
          render: () =>
            h(View, {
              document: {
                id: "po",
                filename: "po.pdf",
                blobId: "local",
                blobExt: "pdf",
              },
              signer: "Lou Martin",
              onSigned: async ({ file, metadata }) =>
                (window.signed = {
                  metadata,
                  bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
                }),
            }),
        })
          .use(createI18nPlugin())
          .mount("#app");
      }, base64);
      await page.getByLabel("Place signature on the document").waitFor();
      assert.ok(
        await page
          .getByRole("button", { name: "Save signed copy" })
          .isDisabled(),
      );
      const r = await page.getByLabel("Handwritten signature").boundingBox();
      await page.mouse.move(r.x + 20, r.y + 60);
      await page.mouse.down();
      await page.mouse.move(r.x + 160, r.y + 40, { steps: 12 });
      await page.mouse.move(r.x + 190, r.y + 80, { steps: 8 });
      await page.mouse.up();
      const placement = page.getByLabel("Place signature on the document");
      await placement.click({ position: { x: 260, y: 460 } });
      await placement.press("ArrowRight");
      for (const [theme, width] of [
        ["default", 1000],
        ["light", 390],
      ]) {
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.screenshot({
          path: `/tmp/bonzai-signature-${theme}.png`,
          fullPage: true,
        });
      }
      assert.equal(await page.locator(".pdf-signature").count(), 1);
      await page.getByRole("button", { name: "Save signed copy" }).click();
      await page.waitForFunction(() => window.signed);
      const signed = await page.evaluate(() => window.signed);
      assert.equal(signed.metadata.sourceDocumentId, "po");
      assert.equal(signed.metadata.signer, "Lou Martin");
      const result = await PDFDocument.load(new Uint8Array(signed.bytes));
      assert.equal(result.getPageCount(), 1);
      assert.ok(signed.bytes.length > bytes.length);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
