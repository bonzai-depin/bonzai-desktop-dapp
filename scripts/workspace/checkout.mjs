/** Hosted checkout authority. Never package its private key/Stripe secret in Desktop. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import { randomUUID } from 'node:crypto';
import { JsonRpcProvider, Interface, verifyMessage, isAddress, Contract } from 'ethers';
import { economyChainId } from '../../src/config/economy.config.js';
import { PRODUCT, PRICE, signLicense } from '../../src/main/workspace/license.js';
export function createCheckoutAuthority({env=process.env,fetchImpl=fetch,providerFactory=url=>new JsonRpcProvider(url),tokenDecimals=async(token,provider)=>new Contract(token,['function decimals() view returns (uint8)'],provider).decimals()}={}) {
const key = env.BONZAI_WORKSPACE_PRIVATE_KEY?.replace(/\\n/g,'\n');
if (!key) throw new Error('BONZAI_WORKSPACE_PRIVATE_KEY required');
const file = env.BONZAI_CHECKOUT_LEDGER || path.resolve('workspace-checkout-ledger.json');
let ledger = {orders:{},transactions:{}};
if(fs.existsSync(file)) ledger = JSON.parse(fs.readFileSync(file,'utf8'));
const save = () => { fs.writeFileSync(file+'.tmp',JSON.stringify(ledger),{mode:0o600});fs.renameSync(file+'.tmp',file); };
const chainId=economyChainId(env), token=env.BONZAI_WORKSPACE_USDC, recipient=env.BONZAI_WORKSPACE_RECIPIENT;
async function stripe(route, form) {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Card checkout is not configured.');
  const res=await fetchImpl('https://api.stripe.com/v1/'+route,{method:form?'POST':'GET',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:form?new URLSearchParams(form):undefined,signal:AbortSignal.timeout(20000)});
  const data=await res.json(); if(!res.ok) throw new Error('Payment provider could not process this request.'); return data;
}
const requiredConfirmations=Number(env.BONZAI_WORKSPACE_CONFIRMATIONS || 12);
if(!Number.isSafeInteger(requiredConfirmations)||requiredConfirmations<1) throw new Error('A positive confirmation count is required.');
const transfer = new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
async function route(url,input) {
  if (!/^[a-f0-9-]{36}$/.test(input.workspaceId || '')) throw new Error('Invalid workspace.');
  if (url==='/checkout') {
    const id=randomUUID(), order={id,workspaceId:input.workspaceId,method:input.method,createdAt:Date.now()};
    if (input.method==='card') {
      if (!env.BONZAI_CHECKOUT_RETURN_URL?.startsWith('https://')) throw new Error('Checkout return URL is not configured.');
      const session=await stripe('checkout/sessions',{'mode':'payment','success_url':env.BONZAI_CHECKOUT_RETURN_URL,'cancel_url':env.BONZAI_CHECKOUT_RETURN_URL,'client_reference_id':id,'metadata[workspaceId]':input.workspaceId,'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':'100','line_items[0][price_data][product_data][name]':'BonzAI company workspace — one-time test-price unlock','line_items[0][quantity]':'1'});
      order.sessionId=session.id; order.test=!session.livemode; order.url=session.url;
    } else if (input.method==='wallet') {
      if (!Number.isSafeInteger(chainId)||chainId<=0||!isAddress(token)||!isAddress(recipient)||!env.BONZAI_WORKSPACE_RPC) throw new Error('USDC checkout network is not configured.');
      order.chainId=chainId;order.token=token;order.recipient=recipient;order.amount=PRICE.units;
      order.message=`BonzAI workspace purchase\n${id}\n${input.workspaceId}\n${chainId}\n${token}\n${recipient}\n${PRICE.units}`;
    } else throw new Error('Unsupported payment method.');
    ledger.orders[id]=order; save(); return order;
  }
  if(url!=='/verify') throw new Error('Unknown request.');
  const order=ledger.orders[input.orderId];
  if(!order||order.workspaceId!==input.workspaceId) throw new Error('Checkout not found.');
  if(order.receipt) return {receipt:order.receipt};
  if(order.method==='card') {
    const s=await stripe('checkout/sessions/'+encodeURIComponent(order.sessionId));
    if(s.payment_status!=='paid') return {pending:true};
    if(s.client_reference_id!==order.id||s.metadata?.workspaceId!==order.workspaceId||s.amount_total!==100||s.currency!=='usd') throw new Error('Payment does not match this workspace.');
    order.test=!s.livemode;
  } else {
    if(!/^0x[a-fA-F0-9]{64}$/.test(input.transactionHash||'')) throw new Error('A transaction hash is required.');
    const sender=verifyMessage(order.message,input.signature);
    const provider=providerFactory(env.BONZAI_WORKSPACE_RPC);
    try {
      if(Number((await provider.getNetwork()).chainId)!==order.chainId) throw new Error('Wrong checkout network.');
      const receipt=await provider.getTransactionReceipt(input.transactionHash);
      if(!receipt) return {pending:true};
      if((await provider.getBlock(receipt.blockNumber)).timestamp < Math.floor(order.createdAt/1000)-10) throw new Error('This payment predates the checkout.');
      if(receipt.status!==1) throw new Error('USDC transfer failed.');
      if(await receipt.confirmations()<requiredConfirmations) return {pending:true};
      if(Number(await tokenDecimals(order.token,provider))!==6) throw new Error('Checkout token is not configured as six-decimal USDC.');
      const match=receipt.logs.some(log=>{try {const e=transfer.parseLog(log);return log.address.toLowerCase()===order.token.toLowerCase()&&e.name==='Transfer'&&e.args.from.toLowerCase()===sender.toLowerCase()&&e.args.to.toLowerCase()===order.recipient.toLowerCase()&&e.args.value===BigInt(order.amount);}catch{return false;}});
      if(!match) throw new Error('No matching USDC payment was found.');
      const hash=`${order.chainId}:${receipt.hash.toLowerCase()}`;
      if(ledger.transactions[hash]&&ledger.transactions[hash]!==order.id) throw new Error('Payment already used for another purchase.');
      ledger.transactions[hash]=order.id;
      order.test=env.BONZAI_WORKSPACE_TEST==='1' || order.chainId===46630;
    } finally { provider.destroy(); }
  }
  // No await between replay check above and durable issuance. Single authority process.
  order.receipt=signLicense({product:PRODUCT,workspaceId:order.workspaceId,purchaseId:order.id,issuedAt:Date.now(),perpetual:true,test:Boolean(order.test)},key); save();
  return {receipt:order.receipt};
}
return route;
}
if(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
const env=process.env, route=createCheckoutAuthority();
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  try {
    if(req.method!=='POST') throw new Error('POST required.');
    let body=''; for await(const chunk of req){body+=chunk;if(body.length>16000)throw new Error('Request too large.');}
    res.end(JSON.stringify(await route(req.url,JSON.parse(body))));
  } catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}
});
server.requestTimeout=25000;server.headersTimeout=10000;
server.listen(Number(env.PORT||8789),env.BONZAI_CHECKOUT_HOST||'127.0.0.1',()=>console.log('Workspace checkout listening. Use an HTTPS reverse proxy for public deployment.'));

}
