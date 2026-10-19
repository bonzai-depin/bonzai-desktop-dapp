import { ethers } from 'ethers';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { getProvider, getSigner, switchNetwork } from './web3.service.js';
const FACTORY_ABI = [
  'function liquidityVault() view returns(address)',
  'function liquidityPosition(address) view returns(uint256)',
];
const ABI = [
  'function factory() view returns(address)',
  'function positions(uint256) view returns(address currency0,address currency1,address beneficiary,address agentCollection,uint256 agentId,bool registered)',
  'function claimable(address,address) view returns(uint256)',
  'function pendingRewards(address) view returns(uint256)',
  'function collect(uint256)',
  'function claim(address,address)',
  'function flushRewards(address)',
];
export async function getLiquidityVault(token,kind,beneficiary) {
  if(!ethers.isAddress(token))throw new Error('Select an issued token.');
  const factories=kind==='companion'?[CONFIG.smartAgentIssuance?.factoryAddress,CONFIG.companionTokenFactory?.contractAddress]:[kind==='game'?CONFIG.gameTokenFactory?.contractAddress:CONFIG.fineTuneTokenFactory?.contractAddress];
  const provider=await getProvider(ECONOMY_NETWORK_KEY);
  let failed=false;
  for(const factoryAddress of [...new Set(factories.filter(a=>ethers.isAddress(a)&&a!==ethers.ZeroAddress))]) {
    let address,id;
    try { const factory=new ethers.Contract(factoryAddress,FACTORY_ABI,provider);[address,id]=await Promise.all([factory.liquidityVault(),factory.liquidityPosition(token)]); }
    catch {failed=true;continue;}
    if(address===ethers.ZeroAddress||id===0n)continue;
    const vault=new ethers.Contract(address,ABI,provider);
    if((await vault.factory()).toLowerCase()!==factoryAddress.toLowerCase())throw new Error('Invalid liquidity vault binding.');
    const position=await vault.positions(id);if(!position.registered)throw new Error('Liquidity position is not registered.');
    if(![position.currency0,position.currency1].some(c=>c.toLowerCase()===token.toLowerCase()))throw new Error('Position token mismatch.');
    const currencies=await Promise.all([position.currency0,position.currency1].map(async currency=>{
      const asset=currency===ethers.ZeroAddress?null:new ethers.Contract(currency,['function symbol() view returns(string)','function decimals() view returns(uint8)'],provider);
      const [symbol,decimals,claimable,rewards]=await Promise.all([asset?asset.symbol():'ETH',asset?asset.decimals():18,ethers.isAddress(beneficiary)?vault.claimable(currency,beneficiary):0n,vault.pendingRewards(currency)]);
      return {address:currency,symbol,claimable,rewards,amount:ethers.formatUnits(claimable,decimals),rewardAmount:ethers.formatUnits(rewards,decimals)};
    }));
    return {address,positionId:id,currencies};
  }
  if(failed)throw new Error('Liquidity data could not be read. Retry.');
  return null;
}
export async function transactLiquidityFees({token,kind,action,currency}) {
  if(!['collect','claim','rewards'].includes(action))throw new Error('Unknown fee action.');
  await switchNetwork(ECONOMY_NETWORK_KEY);
  const signer=await getSigner(),beneficiary=await signer.getAddress();
  const info=await getLiquidityVault(token,kind,beneficiary);
  if(!info)throw new Error('No locked liquidity position found.');
  const vault=new ethers.Contract(info.address,ABI,signer);
  if(action!=='collect'&&!info.currencies.some(c=>c.address.toLowerCase()===String(currency).toLowerCase()))throw new Error('Unknown fee currency.');
  const tx=action==='collect'?await vault.collect(info.positionId):action==='claim'?await vault.claim(currency,beneficiary):await vault.flushRewards(currency);
  return (await tx.wait()).hash;
}
