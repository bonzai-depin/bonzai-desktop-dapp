import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const url = process.env.BONZAI_UI_URL;
test(
  "onchain recovery is explicit, wallet-scoped and readable at desktop and mobile widths",
  { skip: !url, timeout: 60000 },
  async () => {
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
      args: ["--disable-gpu"],
    });
    try {
      const page = await browser.newPage(),
        errors = [];
      page.setDefaultTimeout(10000);
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/src/config/web3.config.js*", async (r) => {
        const response = await r.fetch();
        await r.fulfill({
          response,
          body:
            (await response.text()) +
            `
;CONFIG.contributionEconomy.jobEscrowAddress='0x0000000000000000000000000000000000000002';CONFIG.stakingEconomy.revenueRouterAddress='0x0000000000000000000000000000000000000003';CONFIG.mintPool.contractAddress='0x0000000000000000000000000000000000000005';`,
        });
      });
      await page.route("**/src/services/web3.service.js*", (r) =>
        r.fulfill({
          contentType: "application/javascript",
          body: `export const web3Service={state:{walletAddress:'0x0000000000000000000000000000000000000001'},getProvider:async()=>({})};`,
        }),
      );
      await page.route("**/src/services/protocolRecovery.js*", (r) =>
        r.fulfill({
          contentType: "application/javascript",
          body: `export const discoverPayments=async()=>{window.reads++;return [{kind:'payment',currency:'0x0000000000000000000000000000000000000002',amount:'25.0',symbol:'AGENT'}];};export const discoverRoyalties=async()=>({rows:[],next:1,hasMore:false});export const claimRecovered=async(row,wallet,recipient)=>{window.claims.push({row,wallet,recipient});};export const discoverWalletJobs=async()=>({rows:[{id:'0x'+'a'.repeat(64),deadline:1,status:1,expired:true}],next:1,hasMore:false});export const finalizeExpiredJob=async()=>{window.expired++;};export const setNativeRewardRecipient=async()=>{};export const rollEmptyRewards=async()=>{};export const inspectRecoveryJob=async(id)=>({id,status:6,isParty:true,isArbitrator:false,amount:'25',symbol:'AGENT',proposer:'0x0000000000000000000000000000000000000002',workerBps:2500,hasPendingRoyalties:true,pendingRoyalties:'1',fallbackAt:1,canFallback:true});export const routeRecoveryFees=async(id,action)=>{window.routed={id,action};};export const settleRecoveryJob=async(id,action,bps)=>{window.settled={id,action,bps};};`,
        }),
      );
      await page.goto(url + "/src/assets/tokens.css");
      await page.setContent(
        '<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><div id="app" style="padding:20px"></div>',
      );
      await page.evaluate(async () => {
        window.reads = 0;
        window.claims = [];
        window.expired = 0;
        const { CONFIG } = await import("/src/config/web3.config.js");
        CONFIG.contributionEconomy.jobEscrowAddress =
          "0x0000000000000000000000000000000000000002";
        CONFIG.stakingEconomy.revenueRouterAddress =
          "0x0000000000000000000000000000000000000003";
        const source = await fetch("/src/components/ProtocolRecovery.vue").then(
          (r) => r.text(),
        );
        const { createApp } = await import(
          source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1]
        );
        const { default: View } =
          await import("/src/components/ProtocolRecovery.vue");
        createApp(View).mount("#app");
      });
      assert.equal(await page.evaluate(() => window.reads), 0);
      await page
        .getByRole("button", { name: "Check Onchain Balances" })
        .click();
      await page.getByText("25.0 AGENT").waitFor();
      await page.getByRole("button", { name: "Review Claim" }).click();
      assert.equal(await page.evaluate(() => window.claims.length), 0);
      await page
        .getByLabel("Receiving wallet", { exact: true })
        .fill("0x0000000000000000000000000000000000000004");
      await page.getByRole("button", { name: "Confirm Claim" }).click();
      assert.equal(
        (await page.evaluate(() => window.claims[0])).recipient,
        "0x0000000000000000000000000000000000000004",
      );
      await page
        .getByText("Recover Workflow Deadlines", { exact: true })
        .click();
      await page.getByRole("button", { name: "Find My Jobs" }).click();
      await page.getByRole("button", { name: "Finalize Expired Job" }).click();
      assert.equal(await page.evaluate(() => window.expired), 1);
      await page
        .getByText("Resolve a Workflow Payment", { exact: true })
        .click();
      await page
        .getByLabel("Job ID", { exact: true })
        .fill("0x" + "a".repeat(64));
      await page
        .getByRole("button", { name: "Inspect Job", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Accept This Split and Settle" })
        .click();
      assert.equal((await page.evaluate(() => window.settled)).bps, 2500);
      await page.getByRole("button", { name: "Forward Royalties", exact: true }).click();
      assert.equal((await page.evaluate(() => window.routed)).action, "routeContribution");
      await page.getByRole("button", { name: "Recover to Original Contributors", exact: true }).click();
      assert.equal((await page.evaluate(() => window.routed)).action, "distributeContributionFallback");
      await page.getByText("Native Reward Recovery", { exact: true }).click();
      for (const theme of ["dark", "light"])
        for (const width of [1280, 360]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.evaluate(
            (t) => document.documentElement.setAttribute("data-theme", t),
            theme,
          );
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
        }
      assert.equal(await page.getByRole("heading", { name: "Payments & Royalties" }).count(), 1);
      if (process.env.BONZAI_UI_CAPTURE) {
        assert.equal(await page.getByRole("button", { name: "Confirm Receiving Wallet" }).isEnabled(), true);
        await page.setViewportSize({ width: 360, height: 3000 });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: process.env.BONZAI_UI_CAPTURE,
          fullPage: false,
        });
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
