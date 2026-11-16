import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const url = process.env.BONZAI_UI_URL;
test(
  "benchmark workspace records, reviews and exports without unsolicited upload; fits small screens",
  { skip: !url, timeout: 60000 },
  async () => {
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 950 },
      });
      await page.route("https://api.pinata.cloud/**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            IpfsHash: "bafyTestReceipt",
            Timestamp: new Date().toISOString(),
            PinSize: 1000,
          }),
        }),
      );
      let uploads = 0;
      page.on("request", (r) => {
        if (r.url().includes("api.pinata.cloud")) uploads++;
      });
      await page.goto(url);
      await page.evaluate(async () => {
        document.body.innerHTML = '<div id="benchmark-shell"><div class="test-activity">Activity</div><div id="benchmark-test"></div></div>';
        const shellStyle = document.createElement('style');
        shellStyle.textContent = 'html,body{height:100%;margin:0;overflow:hidden}#benchmark-shell{height:100%;display:flex;flex-direction:column;overflow:hidden}.test-activity{flex:0 0 54px}#benchmark-test{flex:1;min-height:0;overflow:hidden}';
        document.head.append(shellStyle);
        const session = {
          id: "12345678-1234-1234-1234-123456789012",
          status: "stopped",
          startedAt: new Date().toISOString(),
          hardware: {
            cpu: { brand: "Test processor" },
            memory: { totalBytes: 34359738368 },
          },
          appVersion: "4.0.0",
          archives: [],
        };
        let started = true;
        window.exported = false;
        window.electronAPI = {
          performanceBenchmark: {
            list: async () => (started ? [session] : []),
            run: async (options) => {
              started = true;
              window.suiteOptions = options;
              session.mode = "standardized";
              session.status = "stopped";
              session.categories = options.categories;
              session.suite = {
                version: "bonzai-standard-1",
                phase: "Finished",
                completed: 3,
                total: 3,
                methodology: "One first pass, two measured passes.",
                cases: [
                  {
                    id: "image-qwen-21",
                    label: "Image · Qwen Image 2.1 512²",
                    pipeline: "/image/turbo",
                    status: "completed",
                    comparisonKey: "same",
                    params: { seed: 42 },
                    trials: [
                      {
                        phase: "warmup",
                        status: "completed",
                        metrics: { elapsedMs: 9000 },
                      },
                      {
                        phase: "measurement",
                        status: "completed",
                        metrics: { elapsedMs: 4000 },
                      },
                      {
                        phase: "measurement",
                        status: "completed",
                        metrics: { elapsedMs: 6000 },
                      },
                    ],
                  },
                ],
              };
              window.suiteReport = session;
              return session;
            },
            start: async (options) => {
              session.categories = options.categories;
              window.benchmarkCategories = options.categories;
              started = true;
              return session;
            },
            stop: async () => {
              session.status = "stopped";
            },
            report: async () => ({
              ...session,
              samples: [
                {
                  id: "sample",
                  pipeline: "/image/turbo",
                  status: "completed",
                  metrics: { elapsedMs: 12500 },
                  parameters: { width: 512, height: 512 },
                },
              ],
            }),
            export: async () => {
              window.exported = true;
            },
            archive: async (id, receipt) => {
              session.archives.push(receipt);
              window.archiveReceipt = receipt;
            },
          },
        };
        const { createApp } = await import("/node_modules/.vite/deps/vue.js");
        const { default: View } =
          await import("/src/components/PerformanceBenchmark.vue");
        createApp(View).mount("#benchmark-test");
      });
      await page.getByRole('heading', { name: 'Performance Benchmark', exact: true }).waitFor();
      // The app shell clips overflow: the report itself must own scrolling.
      for (const width of [1440, 375]) {
        await page.setViewportSize({width, height:600});
        const view=page.locator('.benchmark-view');
        await view.hover();
        await page.mouse.wheel(0, 1200);
        await page.waitForFunction(()=>document.querySelector('.benchmark-view').scrollTop > 0);
        assert.equal(await page.evaluate(()=>document.scrollingElement.scrollTop),0);
        await view.evaluate(el=>{el.scrollTop=el.scrollHeight;});
        assert.ok(await view.evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop)<2),'last report content must be reachable');
        await view.evaluate(el=>{el.scrollTop=0;});
      }
      await page.setViewportSize({width:1440,height:950});
      assert.equal(await page.getByRole('button', { name: 'Start measurement' }).count(), 0);
      assert.match(
        await page.locator(".pipeline-result").first().innerText(),
        /Image · Klein/,
      );
      await page
        .getByRole("searchbox", { name: "Find a pipeline" })
        .fill("not a pipeline");
      await page
        .getByText("No pipelines match these filters.", { exact: false })
        .waitFor();
      await page.getByRole("button", { name: "Clear filters" }).click();
      await page.getByRole("checkbox", { name: "Measured only" }).check();
      assert.equal(await page.locator(".pipeline-result").count(), 1);
      await page.locator(".pipeline-result > summary").first().click();
      await page.getByRole("button", { name: "Inspect requests" }).click();
      await page.getByRole("heading", { name: "Request history" }).waitFor();
      await page.locator(".sample-result > summary").click();
      await page.getByText("Total time", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Pipelines", exact: true })
        .click();
      await page.getByRole("checkbox", { name: "Measured only" }).uncheck();
      await page.getByRole("button", { name: "Export JSON" }).click();
      assert.equal(await page.evaluate(() => window.exported), true);
      await page.getByRole("button", { name: "Archive to IPFS" }).click();
      await page
        .getByRole("heading", { name: "Publish this report to IPFS?" })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Publish report", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(uploads, 0);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Archive to IPFS" }).click();
      await page.locator("dialog").getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Publish report", exact: true })
        .click();
      await page.waitForFunction(
        () => window.archiveReceipt?.url === "ipfs://bafyTestReceipt",
      );
      assert.equal(uploads, 1);
      for (const width of [1440, 650, 375]) {
        await page.setViewportSize({ width, height: 950 });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        );
        assert.equal(overflow, false, `horizontal overflow at ${width}`);
      }
      await page.getByRole("button", { name: "Hardware", exact: true }).click();
      await page
        .locator(".hardware")
        .getByText("Test processor", { exact: true })
        .waitFor();
      await page.screenshot({
        path: "/tmp/bonzai-performance-mobile.png",
        fullPage: true,
      });
      await page.evaluate(
        () => (document.documentElement.dataset.theme = "warm"),
      );
      assert.equal(
        await page.getByRole("button", { name: "Export JSON" }).isEnabled(),
        true,
      );
      assert.equal(
        await page.getByRole("button", { name: "Archive to IPFS" }).isEnabled(),
        true,
      );
      await page.screenshot({
        path: "/tmp/bonzai-performance-light.png",
        fullPage: false,
      });
      await page.evaluate(
        () => (document.documentElement.dataset.theme = "default"),
      );
      await page.setViewportSize({ width: 1440, height: 950 });
      await page
        .getByRole("button", { name: "Pipelines", exact: true })
        .click();
      await page.screenshot({
        path: "/tmp/bonzai-performance-desktop.png",
        fullPage: false,
      });
      await page
        .getByRole("button", { name: "Run scenarios", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Choose benchmark tests" })
        .waitFor();
      await page
        .getByRole("checkbox", { name: /Video.*scenarios/ })
        .uncheck();
      assert.equal(
        await page.getByRole("checkbox", { name: /Include H3/ }).count(),
        0,
      );
      await page.getByRole('checkbox', { name: /Text · structured extraction/ }).uncheck();
      await page.screenshot({ path: "/tmp/bonzai-scenarios-setup.png" });
      await page
        .getByRole("button", { name: "Run selected scenarios", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Standardized results" })
        .waitFor();
      assert.equal(
        (await page.evaluate(() => window.suiteOptions.categories)).includes(
          "Video",
        ),
        false,
      );
      assert.equal((await page.evaluate(() => window.suiteOptions.scenarioIds)).includes('text-extract'), false);
      assert.equal((await page.evaluate(() => window.suiteOptions.scenarioIds)).includes('text-explain'), true);
      const comparisonLayout=await page.evaluate(()=>{
        const select=document.querySelector('.comparison-picker select').getBoundingClientRect();
        const upload=document.querySelector('.baseline-picker').getBoundingClientRect();
        return {selectBottom:select.bottom,uploadBottom:upload.bottom,selectRight:select.right,uploadLeft:upload.left};
      });
      assert.ok(Math.abs(comparisonLayout.selectBottom-comparisonLayout.uploadBottom)<2,'comparison controls align on one baseline');
      assert.ok(comparisonLayout.uploadLeft>=comparisonLayout.selectRight,'comparison controls must not overlap');
      await page.locator(".scenario-result > summary").click();
      const baseline = await page.evaluate(() =>
        JSON.stringify(window.suiteReport),
      );
      await page
        .locator(".baseline-picker input")
        .setInputFiles({
          name: "baseline.json",
          mimeType: "application/json",
          buffer: Buffer.from(baseline),
        });
      await page.getByText(/1.00× relative speed/).waitFor();
      for (const width of [1440, 650, 375]) {
        await page.setViewportSize({ width, height: 950 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
        );
      }
      await page.screenshot({
        path: "/tmp/bonzai-scenarios-mobile.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 950 });
      await page.screenshot({ path: "/tmp/bonzai-scenarios-results.png" });
    } finally {
      await browser.close();
    }
  },
);
