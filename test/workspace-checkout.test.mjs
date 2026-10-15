import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {Wallet,Interface} from 'ethers';
import {createCheckoutAuthority} from '../scripts/workspace/checkout.mjs';import {verifyLicense} from '../src/main/workspace/license.js';
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'checkout-'));const {privateKey,publicKey}=generateKeyPairSync('ed25519');return{dir,publicKey,env:{BONZAI_WORKSPACE_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}),BONZAI_CHECKOUT_LEDGER:path.join(dir,'ledger.json'),VITE_BONZAI_ECONOMY_CHAIN_ID:'8453',STRIPE_SECRET_KEY:'test-only',BONZAI_CHECKOUT_RETURN_URL:'https://example.org/return'}};}
test('card fulfillment requires verified paid amount, isolates workspaces and survives restart',async()=>{
 const f=fixture();try{let session;const fetchImpl=async(url,opts)=>{if(opts.method==='POST'){const form=opts.body;session={id:'cs_test',url:'https://checkout.stripe.com/test',client_reference_id:form.get('client_reference_id'),metadata:{workspaceId:form.get('metadata[workspaceId]')},payment_status:'unpaid',amount_total:100,currency:'usd',livemode:false};}return{ok:true,json:async()=>session};};
 const route=createCheckoutAuthority({env:f.env,fetchImpl});const workspaceId=randomUUID();const order=await route('/checkout',{workspaceId,method:'card'});
 assert.equal((await route('/verify',{workspaceId,orderId:order.id})).pending,true);
 await assert.rejects(()=>route('/verify',{workspaceId:randomUUID(),orderId:order.id}),/not found/);
 session.payment_status='paid';session.amount_total=1;await assert.rejects(()=>route('/verify',{workspaceId,orderId:order.id}),/does not match/);session.amount_total=100;
 const {receipt}=await route('/verify',{workspaceId,orderId:order.id});assert.ok(verifyLicense(receipt,f.publicKey,workspaceId,true));assert.equal(verifyLicense(receipt,f.publicKey,workspaceId),null);
 const restarted=createCheckoutAuthority({env:f.env,fetchImpl:()=>{throw new Error('offline');}});assert.deepEqual(await restarted('/verify',{workspaceId,orderId:order.id}),{receipt});
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('USDC checks payer binding, chain, amount, confirmations and single-use payment',async()=>{
 const f=fixture();try{const payer=Wallet.createRandom();const token=Wallet.createRandom().address,recipient=Wallet.createRandom().address;Object.assign(f.env,{BONZAI_WORKSPACE_USDC:token,BONZAI_WORKSPACE_RECIPIENT:recipient,BONZAI_WORKSPACE_RPC:'https://example.invalid'});
 const iface=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);let amount=1000000n,confirmations=12;
 const hash='0x'+'a'.repeat(64);const provider={getNetwork:async()=>({chainId:8453n}),getBlock:async()=>({timestamp:Math.floor(Date.now()/1000)}),getTransactionReceipt:async()=>({status:1,hash,blockNumber:1,confirmations:async()=>confirmations,logs:[{address:token,...iface.encodeEventLog(iface.getEvent('Transfer'),[payer.address,recipient,amount])}]}),destroy(){}};
 const route=createCheckoutAuthority({env:f.env,providerFactory:()=>provider,tokenDecimals:async()=>6});const workspaceId=randomUUID();const order=await route('/checkout',{workspaceId,method:'wallet'});const input={workspaceId,orderId:order.id,signature:await payer.signMessage(order.message),transactionHash:hash};
 confirmations=1;assert.equal((await route('/verify',input)).pending,true);confirmations=12;amount=1n;await assert.rejects(()=>route('/verify',input),/No matching/);amount=1000000n;
 const {receipt}=await route('/verify',input);assert.ok(verifyLicense(receipt,f.publicKey,workspaceId));
 const other=await route('/checkout',{workspaceId:randomUUID(),method:'wallet'});await assert.rejects(async()=>route('/verify',{workspaceId:other.workspaceId,orderId:other.id,signature:await payer.signMessage(other.message),transactionHash:hash}),/already used/);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
