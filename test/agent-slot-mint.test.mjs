import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ethers } from 'ethers';
import { CONFIG } from '../src/config/web3.config.js';
import { BonzaiSmartAgentsABI } from '../src/contracts/abi/BonzaiSmartAgents.abi.js';
const wallet='0x0000000000000000000000000000000000000001', collection='0x0000000000000000000000000000000000000002';
const iface=new ethers.Interface(BonzaiSmartAgentsABI);
let now=150, minted=0n, signerWallet=wallet, sent=null, price=ethers.parseEther('2');
const provider={getBlock:async()=>({timestamp:now}),call:async ({data})=>{
 const fn=iface.getFunction(data.slice(0,10));
 const values={MINT_PRICE:price,LP_RESERVE:ethers.parseEther('1'),mintStart:100n,mintEnd:200n,totalSupply:10n,MAX_SUPPLY:10000n,mintedBy:minted,MAX_PER_WALLET:3n,launcher:wallet};
 return iface.encodeFunctionResult(fn,[values[fn.name]]);
}};
const signer={provider,getAddress:async()=>signerWallet,sendTransaction:async tx=>{sent=tx;throw new Error('Stopped before wallet submission');}};
globalThis.__slotWeb3={state:{walletAddress:wallet},getProvider:async()=>provider,switchNetwork:async()=>{},getBrowserProvider:async()=>({getSigner:async()=>signer})};
const url=new URL('../src/services/agentSlotMint.js',import.meta.url);
let source=(await readFile(url,'utf8')).replace(/^import \{ web3Service \} from .*;$/m,'const web3Service=globalThis.__slotWeb3;');
source=source.replace(/from ['"]([^'"]+)['"]/g,(_,spec)=>`from '${spec.startsWith('.')?new URL(spec,url).href:import.meta.resolve(spec)}'`);
const {readSlotSale,mintAgentSlot}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
CONFIG.smartAgentIssuance.contractAddress=collection;
test('slot review reads live sale terms and purchase sends exactly one slot at that price',async()=>{
 const review=await readSlotSale(wallet);
 assert.equal(review.reason,'');assert.equal(review.priceDisplay,'2.0');assert.equal(review.reserveDisplay,'1.0');
 await assert.rejects(mintAgentSlot(review),/Stopped before wallet submission/);
 assert.equal(sent.value,ethers.parseEther('2'));
 assert.equal(iface.decodeFunctionData('mintSlots',sent.data)[0],1n);
});
test('closed sale, wallet limits, changed prices and changed wallets cannot reach signing',async()=>{
 const review=await readSlotSale(wallet);sent=null;
 try {
  now=200;await assert.rejects(mintAgentSlot(review),/ended/);assert.equal(sent,null);
  now=150;minted=3n;await assert.rejects(mintAgentSlot(review),/limit/);assert.equal(sent,null);
  minted=0n;price=ethers.parseEther('3');await assert.rejects(mintAgentSlot(review),/terms changed/);assert.equal(sent,null);
  price=ethers.parseEther('2');signerWallet=collection;await assert.rejects(mintAgentSlot(review),/Wallet changed/);assert.equal(sent,null);
 } finally {now=150;minted=0n;price=ethers.parseEther('2');signerWallet=wallet;}
});
