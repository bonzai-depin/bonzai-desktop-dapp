import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ethers} from 'ethers';
import {CONFIG} from '../src/config/web3.config.js';

test('game liquidity failures never submit a registration transaction', async () => {
  const file = new URL('../src/services/gameToken.service.js', import.meta.url);
  let source = await readFile(file, 'utf8');
  const address = '0x0000000000000000000000000000000000000001';
  const originalFactory = CONFIG.gameTokenFactory.contractAddress;
  const originalRegistry = CONFIG.gameRegistry.contractAddress;
  const abi = new ethers.Interface([
    'function liquidityVault() view returns(address)',
    'function minEthLiquidity() view returns(uint256)',
  ]);
  let configured = false;
  const transactions = [];
  const signer = {
    getAddress: async () => address,
    call: async ({data}) => {
      const fn = abi.getFunction(data.slice(0,10));
      return abi.encodeFunctionResult(fn, [fn.name === 'liquidityVault' ? (configured ? address : ethers.ZeroAddress) : ethers.parseEther('0.01')]);
    },
    sendTransaction: async tx => { transactions.push(tx); throw new Error('Unexpected transaction'); },
  };
  globalThis.__gameLiquidityWallet = {getSigner: async()=>signer, getProvider: async()=>signer, switchNetwork:async()=>{}};
  source = source.replace(/^import \{ getSigner, getProvider, switchNetwork \} from .*;$/m, 'const {getSigner,getProvider,switchNetwork}=globalThis.__gameLiquidityWallet;');
  source = source.replace(/from ["']([^"']+)["']/g, (_,specifier)=>`from '${specifier.startsWith('.') ? new URL(specifier,file).href : import.meta.resolve(specifier)}'`);
  try {
    CONFIG.gameTokenFactory.contractAddress = address;
    CONFIG.gameRegistry.contractAddress = address;
    const {issueGameToken} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const input = {collectible:address,collectibleTokenId:1,name:'Test Game',symbol:'GAME',metadataURI:'ipfs://game',projectManifest:{schema:'bonzai.game-project',kind:'game'}};
    await assert.rejects(issueGameToken({...input,liquidityEth:'0.01'}), /vault is not configured/);
    configured = true;
    await assert.rejects(issueGameToken({...input,liquidityEth:'0.001'}), /Minimum game liquidity/);
    assert.equal(transactions.length,0);
  } finally {
    CONFIG.gameTokenFactory.contractAddress = originalFactory;
    CONFIG.gameRegistry.contractAddress = originalRegistry;
    delete globalThis.__gameLiquidityWallet;
  }
});

test('game recovery distinguishes pending registration from issued tokens without sending funds',async()=>{
 const file=new URL('../src/services/gameToken.service.js',import.meta.url);
 const address='0x0000000000000000000000000000000000000001', token='0x0000000000000000000000000000000000000002';
 const original=CONFIG.gameTokenFactory.contractAddress;
 const abi=new ethers.Interface(['function tokenForCollectible(bytes32) view returns(address)']);
 let receipt=null, issued=false;
 globalThis.__gameRecovery={getProvider:async()=>({getTransactionReceipt:async()=>receipt,call:async({data})=>{
  const [key]=abi.decodeFunctionData('tokenForCollectible',data);
  assert.equal(key,ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address','uint256'],[address,7])));
  return abi.encodeFunctionResult('tokenForCollectible',[issued?token:ethers.ZeroAddress]);
 }}),getSigner:()=>{throw new Error('Recovery must not sign');},switchNetwork:()=>{throw new Error('Recovery must not switch the wallet');}};
 let source=(await readFile(file,'utf8')).replace(/^import \{ getSigner, getProvider, switchNetwork \} from .*;$/m,'const {getSigner,getProvider,switchNetwork}=globalThis.__gameRecovery;');
 source=source.replace(/from ["']([^"']+)["']/g,(_,spec)=>`from '${spec.startsWith('.')?new URL(spec,file).href:import.meta.resolve(spec)}'`);
 try {
  CONFIG.gameTokenFactory.contractAddress=address;
  const {recoverGameIssuance}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.deepEqual(await recoverGameIssuance(address,7,'0xsubmitted'),{pending:true});
  receipt={status:0};assert.deepEqual(await recoverGameIssuance(address,7,'0xsubmitted'),{reverted:true});
  receipt={status:1,hash:'0xconfirmed'};assert.deepEqual(await recoverGameIssuance(address,7,'0xsubmitted'),{registeredOnly:true});
  issued=true;assert.equal((await recoverGameIssuance(address,7,'0xsubmitted')).tokenAddress,token);
 }finally {CONFIG.gameTokenFactory.contractAddress=original;delete globalThis.__gameRecovery;}
});
