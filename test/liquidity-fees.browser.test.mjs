import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('fee controls keep currencies separate, require explicit actions, and fit narrow layouts',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/services/liquidityVault.service.js*',r=>r.fulfill({contentType:'application/javascript',body:`export async function getLiquidityVault(){if(window.failFees)throw new Error('RPC unavailable');return {address:'vault',positionId:1n,currencies:[{address:'0x0000000000000000000000000000000000000000',symbol:'ETH',amount:'0.003',rewardAmount:'0.001',claimable:3n,rewards:1n},{address:'0x0000000000000000000000000000000000000002',symbol:'LONG_MODEL_SYMBOL',amount:'30',rewardAmount:'0',claimable:30n,rewards:0n}]}};export async function transactLiquidityFees(args){window.feeActions.push(args);return '0xconfirmed';}`}));
  await page.route('**/src/services/web3.service.js*',r=>r.fulfill({contentType:'application/javascript',body:`export const web3Service={state:{walletAddress:'0x0000000000000000000000000000000000000001'},connectWallet:async()=>{}};`}));
  await page.goto(url+'/src/assets/tokens.css');await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"></head><body><main id="fee-test" style="padding:24px"></main></body></html>');
  await page.evaluate(async()=>{window.feeActions=[];const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');const {default:Fees}=await import('/src/components/markets/LiquidityFees.vue');createApp({render:()=>h(Fees,{token:'0x0000000000000000000000000000000000000002',kind:'fine_tuned'})}).mount('#fee-test');});
  await page.getByRole('button',{name:'Collect pool fees'}).waitFor();assert.deepEqual(await page.evaluate(()=>window.feeActions),[]);
  await page.getByRole('button',{name:'Collect pool fees'}).click();await page.getByRole('link',{name:'View confirmed transaction ↗'}).waitFor();
  await page.getByRole('button',{name:'Claim my fees'}).nth(1).click();
  await page.waitForFunction(()=>window.feeActions.length===2);
  assert.equal((await page.evaluate(()=>window.feeActions[1])).currency,'0x0000000000000000000000000000000000000002');
  assert.equal(await page.getByRole('button',{name:'Deposit rewards'}).nth(1).isDisabled(),true);
  for(const width of [1440,900,600]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await page.evaluate(()=>{window.failFees=true});await page.getByRole('button',{name:'Refresh fee balances'}).click();await page.getByRole('alert').filter({hasText:'RPC unavailable'}).waitFor();assert.equal(await page.getByRole('button',{name:'Claim my fees'}).count(),0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
