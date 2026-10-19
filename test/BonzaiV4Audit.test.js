const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployCompanionTokenFactory, deployFineTuneTokenFactory, deployHook } = require('./helpers/deploy');

function packDelta(amount0, amount1) {
  return BigInt.asIntN(256, (BigInt.asUintN(128, amount0) << 128n) | BigInt.asUintN(128, amount1));
}
const poolIdFor = key => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
  ['tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'], [key]));

describe('BonzAI v4 economic audit regressions', function () {
  for (const kind of ['companion', 'model']) {
    it(`${kind}: initializes token-per-ETH price, funds locked liquidity and leaves no admin-accessible supply`, async function () {
      const f = await loadFixture(kind === 'companion' ? deployCompanionTokenFactory : deployFineTuneTokenFactory);
      const value = ethers.parseEther('0.05');
      let tx;
      if (kind === 'companion') {
        await f.mockCompanions.mintTo(f.user1.address);
        tx = await f.factory.connect(f.user1).launchToken(1,'Audit Companion','AUD','ipfs://image',f.agentWallet.address,f.user1.address,{value});
      } else {
        await f.mockContent.mintTo(f.user1.address);
        tx = await f.factory.connect(f.user1).launchValidatedToken(f.contentCollection,1,'Audit Model','AUD','ipfs://model','Tested model','ipfs://image','fine_tuned',ethers.id('validation'),f.user1.address,{value});
      }
      const receipt = await tx.wait();
      const event = receipt.logs.map(log => {try{return f.factory.interface.parseLog(log)}catch{return null}}).find(e=>e?.name.endsWith('TokenLaunched'));
      const token = await ethers.getContractAt(kind==='companion'?'CompanionToken':'FineTuneToken',event.args.token);
      const poolTokens = ethers.parseEther('960000000');
      const price = await f.poolManager.initialSqrtPrice(event.args.poolId);
      const impliedTokens = value * price * price / (1n << 192n);
      expect(impliedTokens).to.be.closeTo(poolTokens, 1000000000n);
      expect(await f.positionManager.lastLiquidity()).to.be.greaterThan(0);
      expect(await f.positionManager.lastAmount0Max()).to.equal(value);
      expect(await f.positionManager.lastAmount1Max()).to.equal(poolTokens);
      expect(await token.balanceOf(await f.positionManager.getAddress())).to.equal(poolTokens);
      expect(await token.balanceOf(await f.factory.getAddress())).to.equal(0);
      expect(await token.allowance(await f.factory.getAddress(),await f.permit2.getAddress())).to.equal(0);
      expect((await f.permit2.allowance(await f.factory.getAddress(),await token.getAddress(),await f.positionManager.getAddress())).amount).to.equal(0);
      expect(await f.positionManager.ownerOf(event.args.positionId)).to.equal(await f.factory.liquidityVault());
      await expect(f.factory.recoverERC20(await token.getAddress())).to.be.revertedWith('No tokens to recover');
    });
  }

  it('persists the zero-wallet fallback used by atomic companion token issuance', async function () {
    const f = await loadFixture(deployCompanionTokenFactory);
    const Companions = await ethers.getContractFactory('BonzaiCompanions');
    const companions = await Companions.deploy(f.owner.address);
    await f.factory.setCompanionContract(await companions.getAddress());
    await companions.setCompanionTokenFactory(await f.factory.getAddress());
    await expect(companions.connect(f.user1).mintCompanionWithToken(
      'ipfs://companion',ethers.id('personality'),0x555555555555n,0,ethers.ZeroAddress,'Fallback Companion','FALL',
      {value:ethers.parseEther('0.30')}
    )).to.emit(companions,'AgentWalletSet').withArgs(1,f.user1.address,f.user1.address);
    const token = await ethers.getContractAt('CompanionToken',await f.factory.getToken(1));
    expect(await token.agentWallet()).to.equal(f.user1.address);
    expect(await companions.getAgentWallet(1)).to.equal(await token.agentWallet());
    expect(await token.balanceOf(f.user1.address)).to.equal(ethers.parseEther('40000000'));
  });

  async function modelHookFixture() {
    const f = await deployHook();
    const key = {currency0:ethers.ZeroAddress,currency1:'0x0000000000000000000000000000000000000099',fee:0,tickSpacing:60,hooks:await f.hook.getAddress()};
    const poolId = poolIdFor(key);
    await f.hook.authorizeFactory(f.owner.address,true);
    await f.hook.registerPool(poolId,f.beneficiary.address,ethers.ZeroAddress,0,1,5);
    return {...f,key,poolId};
  }

  it('uses real packed V4 deltas and cannot create liabilities without received ETH', async function () {
    const f = await loadFixture(modelHookFixture);
    const params = {zeroForOne:false,amountSpecified:-ethers.parseEther('2'),sqrtPriceLimitX96:0};
    const delta = packDelta(ethers.parseEther('1'),-ethers.parseEther('2'));
    await expect(f.poolManager.callAfterSwap(await f.hook.getAddress(),f.user1.address,f.key,params,delta,'0x')).to.be.reverted;
    expect(await f.hook.totalUnclaimedBeneficiary()).to.equal(0);
    await f.user1.sendTransaction({to:await f.poolManager.getAddress(),value:ethers.parseEther('1')});
    const [,fee] = await f.poolManager.callAfterSwap.staticCall(await f.hook.getAddress(),f.user1.address,f.key,params,delta,'0x');
    expect(fee).to.equal(ethers.parseEther('0.01'));
    await f.poolManager.callAfterSwap(await f.hook.getAddress(),f.user1.address,f.key,params,delta,'0x');
    expect(await ethers.provider.getBalance(await f.hook.getAddress())).to.equal(fee);
  });

  it('rejects exact-output ETH sales which cannot pay an afterSwap output fee', async function () {
    const f = await loadFixture(modelHookFixture);
    await expect(f.poolManager.callAfterSwap(await f.hook.getAddress(),f.user1.address,f.key,
      {zeroForOne:false,amountSpecified:1000,sqrtPriceLimitX96:0},packDelta(1000n,-2000n),'0x')).to.be.reverted;
  });

  it('leaves ERC20 output buys untaxed and enforces supported pool types', async function () {
    const f = await loadFixture(modelHookFixture);
    const [,fee] = await f.poolManager.callAfterSwap.staticCall(await f.hook.getAddress(),f.user1.address,f.key,
      {zeroForOne:true,amountSpecified:-1000,sqrtPriceLimitX96:0},packDelta(-1000n,2000n),'0x');
    expect(fee).to.equal(0);
    await expect(f.hook.registerPool(ethers.id('invalid-pool'),f.beneficiary.address,ethers.ZeroAddress,0,2,0)).to.be.revertedWith('Invalid pool type');
  });

  it('routes model fees to the beneficiary namespace despite an attacker pre-registering the pool ID', async function () {
    const f = await loadFixture(modelHookFixture);
    const Token = await ethers.getContractFactory('MockERC20');
    const token = await Token.deploy('BONZAI','BONZAI');
    const Vault = await ethers.getContractFactory('BonzaiStakingVault');
    const vault = await Vault.deploy(await token.getAddress(),[1,2,3,4,5,6]);
    const Router = await ethers.getContractFactory('BonzaiRevenueRouter');
    const router = await Router.deploy(await vault.getAddress(),f.treasury.address);
    await router.connect(f.user1).registerRoute(f.poolId,'fake',[f.user1.address],[10000],[0],['attacker']);
    await router.connect(f.beneficiary).registerRoute(f.poolId,'real',[f.beneficiary.address],[10000],[0],['creator']);
    await f.hook.setRevenueRouter(await router.getAddress());
    await f.user1.sendTransaction({to:await f.poolManager.getAddress(),value:ethers.parseEther('1')});
    await f.poolManager.callAfterSwap(await f.hook.getAddress(),f.user1.address,f.key,
      {zeroForOne:false,amountSpecified:-ethers.parseEther('2'),sqrtPriceLimitX96:0},packDelta(ethers.parseEther('1'),-ethers.parseEther('2')),'0x');
    await f.hook.flushModelRevenue(f.poolId);
    const id = await router.routeIdFor(f.beneficiary.address,f.poolId);
    expect(await router.claimable(id,f.beneficiary.address)).to.equal(ethers.parseEther('0.0064'));
    expect(await router.claimable(id,f.user1.address)).to.equal(0);
    expect(await f.hook.totalUnclaimedRoutedRevenue()).to.equal(0);
  });

  it('requires content/evaluation evidence and invalidates reviewed metadata after edits', async function () {
    const [owner,user] = await ethers.getSigners();
    for (const [name,method,event,idField,args,update] of [
      ['BonzaiContributionRegistry','registerContribution','ContributionRegistered','contributionId',[ethers.id('data'),'ipfs://original','license','source',0,90,2,[]],id=>[id,'ipfs://changed',100]],
      ['BonzaiDatasetRegistry','registerDataset','DatasetRegistered','datasetId',[ethers.id('data'),'ipfs://original','license',true,true,true,[]],id=>[id,'ipfs://changed',true]],
      ['BonzaiModelRegistry','publishModel','ModelPublished','modelId',[0,ethers.id('model'),'ipfs://original','license',user.address,90,[],[]],id=>[id,'ipfs://changed',100,true]],
    ]) {
      const Factory=await ethers.getContractFactory(name); const registry=await Factory.deploy();
      const invalid=[...args]; invalid[name==='BonzaiModelRegistry'?1:0]=ethers.ZeroHash;
      await expect(registry.connect(user)[method](...invalid)).to.be.revertedWith('Content hash required');
      const receipt=await (await registry.connect(user)[method](...args)).wait();
      const id=receipt.logs.map(log=>{try{return registry.interface.parseLog(log)}catch{return null}}).find(e=>e?.name===event).args[idField];
      await registry.setVerified(id,true);
      const [getter,updater] = name==='BonzaiContributionRegistry'?['contributions','updateContribution']:name==='BonzaiDatasetRegistry'?['datasets','updateDataset']:['models','updateModel'];
      await registry.connect(user)[updater](...update(id));
      expect((await registry[getter](id)).verified).to.equal(false);
    }
    const Evaluation=await ethers.getContractFactory('BonzaiEvaluationRegistry'); const registry=await Evaluation.deploy();
    await expect(registry.registerEvaluation(ethers.id('target'),0,ethers.ZeroHash,'ipfs://review',90)).to.be.revertedWith('Evidence and target required');
  });
});
