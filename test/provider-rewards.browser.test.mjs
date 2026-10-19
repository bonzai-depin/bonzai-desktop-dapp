import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const url = process.env.BONZAI_UI_URL;
test(
  "provider claims require chain eligibility, explicit review and confirmation recovery",
  { skip: !url, timeout: 60000 },
  async () => {
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    try {
      const page = await browser.newPage({
          viewport: { width: 390, height: 900 },
        }),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.setDefaultTimeout(10000);
      await page.route("**/src/config/web3.config.js*", async (r) => {
        const response = await r.fetch();
        await r.fulfill({
          response,
          body:
            (await response.text()) +
            `
;CONFIG.mintPool.contractAddress='0x0000000000000000000000000000000000000001';`,
        });
      });
      await page.route("**/src/services/serviceTime.service.js*", (r) =>
        r.fulfill({
          contentType: "application/javascript",
          body: `export const isConfigured=()=>true;export const fetchProviderRewards=async()=>{window.reads++;return {current:3,epoch:2,finalized:true,stakeEligible:true,paused:window.paused,rows:[{pool:0,label:'Text',seconds:'60',amount:'0.01',claimed:false,canClaim:!window.paused}]}};export const claimProviderRewards=async()=>{window.claims++;throw Object.assign(new Error('Transaction submitted; check confirmation.'),{transactionHash:'0xsubmitted',confirmationPending:true});};`,
        }),
      );
      await page.route("**/src/services/web3.service.js*", (r) =>
        r.fulfill({
          contentType: "application/javascript",
          body: `export const web3Service={state:{walletAddress:'0x0000000000000000000000000000000000000001'},getProvider:async()=>({getTransactionReceipt:async()=>window.confirmed?{status:1}:null})};`,
        }),
      );
      await page.goto(url + "/src/assets/tokens.css");
      await page.setContent(
        '<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><div id="app" style="padding:20px"></div>',
      );
      await page.evaluate(async () => {
        window.reads = 0;
        window.claims = 0;
        window.paused = true;
        window.confirmed = false;
        const { CONFIG } = await import("/src/config/web3.config.js");
        CONFIG.mintPool.contractAddress =
          "0x0000000000000000000000000000000000000001";
        const source = await fetch("/src/components/ProviderRewards.vue").then(
          (r) => r.text(),
        );
        const { createApp } = await import(
          source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1]
        );
        const { default: View } =
          await import("/src/components/ProviderRewards.vue");
        createApp(View).mount("#app");
      });
      assert.equal(await page.evaluate(() => window.reads), 0);
      await page
        .getByRole("button", { name: "Check Provider Rewards" })
        .click();
      await page
        .getByText("Claims are paused pending verified service receipts.")
        .waitFor();
      assert.ok(
        await page
          .getByRole("button", { name: "Claim", exact: true })
          .isDisabled(),
      );
      await page.evaluate(() => (window.paused = false));
      await page
        .getByRole("button", { name: "Check Provider Rewards" })
        .click();
      await page.getByText(/earned rewards remain claimable/).waitFor();
      await page.getByRole("button", { name: "Claim", exact: true }).click();
      await page
        .getByRole("link", { name: "View submitted transaction ↗" })
        .waitFor();
      assert.equal(await page.evaluate(() => window.claims), 1);
      assert.ok(
        await page
          .getByRole("button", { name: "Claim", exact: true })
          .isDisabled(),
      );
      await page
        .getByRole("button", { name: "Check Provider Rewards" })
        .click();
      assert.ok(
        await page
          .getByRole("button", { name: "Claim", exact: true })
          .isDisabled(),
      );
      await page.evaluate(() => (window.confirmed = true));
      await page
        .getByRole("button", { name: "Check Provider Rewards" })
        .click();
      await page
        .getByRole("link", { name: "View confirmed transaction ↗" })
        .waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
