const {expect}=require('chai');
const {ethers}=require('hardhat');
const {loadFixture,time}=require('@nomicfoundation/hardhat-toolbox/network-helpers');
const ETH=ethers.parseEther;
async function fixture(){
 const [owner,buyer,other,treasury,wallet]=await ethers.getSigners();
 const deploy=async(name,...args)=>{const f=await ethers.getContractFactory(name);return f.deploy(...args);};
 const nvda=await deploy('MockNvda'),swapper=await deploy('MockNvdaSwap',await nvda.getAddress());
 const permits=await deploy('MockPermit2'),positions=await deploy('MockAgentPositionManager',await permits.getAddress()),pools=await deploy('MockPoolManager');
 const agents=await deploy('BonzaiSmartAgents',treasury.address,'ipfs://slot');
 const factory=await deploy('BonzaiAgentTokenFactory',await agents.getAddress(),await nvda.getAddress(),await swapper.getAddress(),await pools.getAddress(),await positions.getAddress(),await permits.getAddress());
 const rewards=await (await ethers.getContractFactory("MockVaultRewards")).deploy();
 await factory.configureLiquidityVault(treasury.address,await rewards.getAddress());
 await agents.setLauncher(await factory.getAddress());
 const start=(await time.latest())+10;await agents.scheduleDrop(start,start+3600);await time.increaseTo(start);
 const mint=async(q=1)=>agents.connect(buyer).mintSlots(q,{value:ETH(String(q*2))});
 const personalize=async(id=1,signer=buyer)=>agents.connect(signer).personalize(id,'ipfs://generated-agent','Rose Kanagawa','ROSE','ipfs://portrait',wallet.address);
 const issue=async(id=1,signer=buyer)=>agents.connect(signer).issueToken(id,24_000_000,(await time.latest())+300);
 return {owner,buyer,other,treasury,wallet,nvda,swapper,permits,positions,pools,agents,factory,mint,personalize,issue};
}
describe('Smart-agent reserved NVDA launch',function(){
 it('enforces the last available slot and exact payment',async()=>{
  const f=await loadFixture(fixture),C=await ethers.getContractFactory('MockCappedSmartAgents');
  const agents=await C.deploy(f.treasury.address);
  await expect(agents.setLauncher(await f.factory.getAddress())).to.be.revertedWith('Wrong collection binding');
  const Factory=await ethers.getContractFactory('BonzaiAgentTokenFactory');
  const launcher=await Factory.deploy(await agents.getAddress(),await f.nvda.getAddress(),await f.swapper.getAddress(),await f.pools.getAddress(),await f.positions.getAddress(),await f.permits.getAddress());
  await agents.setLauncher(await launcher.getAddress());
  const start=(await time.latest())+5;await agents.scheduleDrop(start,start+100);await time.increaseTo(start);
  await agents.seedLifetimeSupply(9999);
  await expect(agents.mintSlots(2,{value:ETH('4')})).to.be.revertedWith('Supply cap');
  await expect(agents.mintSlots(1,{value:ETH('1')})).to.be.revertedWith('Exact mint price required');
  await agents.mintSlots(1,{value:ETH('2')});expect(await agents.ownerOf(10000)).to.equal(f.owner.address);
  await expect(agents.connect(f.buyer).mintSlots(1,{value:ETH('2')})).to.be.revertedWith('Supply cap');
 });
 it('prevents metadata changes inside the safe-mint callback',async()=>{
  const f=await loadFixture(fixture),C=await ethers.getContractFactory('MockAgentMintReceiver'),receiver=await C.deploy();
  await receiver.mint(await f.agents.getAddress(),{value:ETH('2')});
  expect(await receiver.personalizedDuringMint()).to.equal(false);
  expect((await f.agents.getIdentity(1)).ready).to.equal(false);
  expect(await f.agents.tokenURI(1)).to.equal('ipfs://slot');
 });
 it('locks rounding dust and never increases the agent wallet allocation',async()=>{
  const f=await loadFixture(fixture);await f.positions.setLeaveDust(true);await f.mint();await f.personalize();await f.issue();
  const token=await ethers.getContractAt('CompanionToken',await f.agents.socialToken(1));
  const burn='0x000000000000000000000000000000000000dEaD';
  expect(await token.balanceOf(burn)).to.equal(1);expect(await f.nvda.balanceOf(burn)).to.equal(1);
  expect(await token.balanceOf(f.wallet.address)).to.equal(ETH('40000000'));
  expect(await token.balanceOf(await f.factory.getAddress())).to.equal(0);
 });
 it('mints blank slots at 2 ETH and protects all unissued reserves from withdrawal',async()=>{
  const f=await loadFixture(fixture);await f.mint(3);
  expect(await f.agents.totalReservedETH()).to.equal(ETH('3'));expect(await f.agents.tokenURI(1)).to.equal('ipfs://slot');
  await expect(f.agents.withdrawProceeds()).to.changeEtherBalance(f.treasury,ETH('3'));
  expect(await ethers.provider.getBalance(await f.agents.getAddress())).to.equal(ETH('3'));
  await expect(f.agents.withdrawProceeds()).to.be.revertedWith('No proceeds');
  await f.agents.connect(f.buyer).transferFrom(f.buyer.address,f.other.address,1);
  await expect(f.mint()).to.be.revertedWith('Wallet mint limit');
  expect(await f.agents.getOwnerCompanions(f.buyer.address)).to.deep.equal([2n,3n]);
  expect(await f.agents.getOwnerCompanions(f.other.address)).to.deep.equal([1n]);
 });
 it('requires finalized metadata and lets only the current owner spend the slot reserve once',async()=>{
  const f=await loadFixture(fixture);await f.mint();await expect(f.issue()).to.be.revertedWith('Personalize first');
  await f.agents.connect(f.buyer).transferFrom(f.buyer.address,f.other.address,1);
  await expect(f.personalize()).to.be.revertedWith('Not owner');await f.personalize(1,f.other);
  await expect(f.issue()).to.be.revertedWith('Not owner');await f.issue(1,f.other);
  expect(await f.agents.reserveOf(1)).to.equal(0);expect(await f.agents.totalReservedETH()).to.equal(0);
  await expect(f.issue(1,f.other)).to.be.revertedWith('Already issued');
  await expect(f.personalize(1,f.other)).to.be.revertedWith('Identity locked after issuance');
 });
 it('uses all purchased NVDA and 96% supply in a sorted, 1% hookless pool with permanently vaulted LP',async()=>{
  const f=await loadFixture(fixture);await f.mint();await f.personalize();await f.issue();
  const address=await f.agents.socialToken(1),token=await ethers.getContractAt('CompanionToken',address);
  expect(await token.balanceOf(f.wallet.address)).to.equal(ETH('40000000'));
  expect(await token.balanceOf(await f.positions.getAddress())).to.equal(ETH('960000000'));
  expect(await f.nvda.balanceOf(await f.positions.getAddress())).to.equal(25_000_000);
  expect(await f.positions.ownerOf(1)).to.equal(await f.factory.liquidityVault());
  expect(BigInt(await f.positions.currency0())).to.be.lessThan(BigInt(await f.positions.currency1()));
  expect(await token.allowance(await f.factory.getAddress(),await f.permits.getAddress())).to.equal(0);
  expect(await f.nvda.allowance(await f.factory.getAddress(),await f.permits.getAddress())).to.equal(0);
  expect(await ethers.provider.getBalance(await f.swapper.getAddress())).to.equal(ETH('1'));
 });
 for(const failure of ['swap','slippage','LP','recipient'])it(`restores the reserve and leaves no token when ${failure} fails`,async()=>{
  const f=await loadFixture(fixture);await f.mint();await f.personalize();
  if(failure==='swap')await f.swapper.setFail(true);
  if(failure==='slippage')await f.swapper.setOutput(1);
  if(failure==='LP')await f.positions.setFail(true);
  if(failure==='recipient')await f.positions.setWrongRecipient(true);
  await expect(f.issue()).to.be.reverted;
  expect(await f.agents.reserveOf(1)).to.equal(ETH('1'));expect(await f.agents.totalReservedETH()).to.equal(ETH('1'));
  expect(await f.factory.getToken(1)).to.equal(ethers.ZeroAddress);expect(await f.factory.totalTokensLaunched()).to.equal(0);
  expect(await f.nvda.totalSupply()).to.equal(0);
 });
 it('rejects owner bypasses, zero minimums and stale quotes',async()=>{
  const f=await loadFixture(fixture);await f.mint();await f.personalize();
  await expect(f.agents.connect(f.buyer).issueToken(1,0,(await time.latest())+10)).to.be.revertedWith('Invalid execution bounds');
  await expect(f.agents.connect(f.buyer).issueToken(1,1,(await time.latest())-1)).to.be.revertedWith('Invalid execution bounds');
  await expect(f.agents.setLauncher(await f.swapper.getAddress())).to.be.reverted;
  await expect(f.factory.launch(1,'Rose','ROSE','ipfs://portrait',f.wallet.address,1,(await time.latest())+30,{value:ETH('1')})).to.be.revertedWith('Only slot contract');
  await time.increase(4000);await expect(f.mint()).to.be.revertedWith('Drop not active');
 });
 it('encodes exact-input Universal Router NVDA purchase and rejects insufficient output',async()=>{
  const f=await loadFixture(fixture),Router=await ethers.getContractFactory('MockAgentRouter'),router=await Router.deploy();
  const Swap=await ethers.getContractFactory('BonzaiNvdaSwap'),swap=await Swap.deploy(await f.nvda.getAddress(),await router.getAddress(),3000,60);
  await swap.connect(f.buyer).swap(24_000_000,(await time.latest())+60,{value:ETH('1')});
  expect(await f.nvda.balanceOf(f.buyer.address)).to.equal(25_000_000);
  await expect(swap.swap(26_000_000,(await time.latest())+60,{value:ETH('1')})).to.be.revertedWith('NVDA slippage');
 });
});

describe('Minted worker to paid delivery integration', function () {
 it('settles a real newly issued agent token and funds BONZAI basket rewards', async () => {
  const f = await loadFixture(fixture);
  await f.mint(); await f.personalize(); await f.issue();
  const token = await ethers.getContractAt('CompanionToken', await f.agents.socialToken(1));
  const bonzai = await (await ethers.getContractFactory('MockERC20')).deploy('BONZAI', 'BONZAI');
  const vault = await (await ethers.getContractFactory('BonzaiStakingVault')).deploy(await bonzai.getAddress(), [1,2,3,4,5,6]);
  const basket = await (await ethers.getContractFactory('BonzaiBasketRewards')).deploy(await vault.getAddress(), await f.factory.getAddress(), 7 * 86400);
  const router = await (await ethers.getContractFactory('BonzaiRevenueRouter')).deploy(await vault.getAddress(), f.treasury.address);
  await router.setBasketRewards(await basket.getAddress());
  const escrow = await (await ethers.getContractFactory('BonzaiJobEscrow')).deploy(f.treasury.address, await router.getAddress());
  await escrow.configureSmartAgentEconomy(await f.factory.getAddress(), await basket.getAddress());
  await token.connect(f.wallet).transfer(f.other.address, ETH('100'));
  await token.connect(f.other).approve(await escrow.getAddress(), ETH('100'));
  const id = ethers.id('new minted worker order');
  await escrow.connect(f.other).fundTokenJob(id, f.wallet.address, 1, ETH('100'), ethers.id('agreed brief'), ethers.ZeroHash, f.owner.address);
  await expect(escrow.connect(f.buyer).submitWork(id, ethers.id('fake'))).to.be.reverted;
  await escrow.connect(f.wallet).acceptJob(id);
  await escrow.connect(f.wallet).submitWork(id, ethers.id('delivered meditation'));
  await escrow.connect(f.other).approveWork(id);
  expect(await escrow.tokenWithdrawable(await token.getAddress(), f.wallet.address)).to.equal(ETH('97.5'));
  expect(await basket.totalDeposited(await token.getAddress())).to.equal(ETH('1.25'));
  await escrow.connect(f.wallet).withdrawTokenPayments(await token.getAddress(), f.wallet.address);
  expect(await escrow.tokenWithdrawable(await token.getAddress(), f.wallet.address)).to.equal(0);
  expect((await escrow.jobs(id)).status).to.equal(4);
 });
});

describe('Smart-agent transfer and delegation continuity', function () {
 it('revokes old grants and wallet on transfer, preserves identity/token, and lets only the buyer bind a new wallet', async () => {
  const f = await loadFixture(fixture); await f.mint(); await f.personalize(); await f.issue();
  const token = await f.agents.socialToken(1), epoch = await f.agents.controlEpoch(1);
  await f.agents.connect(f.buyer).transferFrom(f.buyer.address, f.other.address, 1);
  expect(await f.agents.controlEpoch(1)).to.equal(epoch + 1n);
  expect(await f.agents.getAgentWallet(1)).to.equal(ethers.ZeroAddress);
  expect(await f.agents.socialToken(1)).to.equal(token);
  expect((await f.agents.getIdentity(1)).name).to.equal('Rose Kanagawa');
  await expect(f.agents.connect(f.buyer).setExecutionWallet(1, f.wallet.address)).to.be.revertedWith('Not owner');
  await f.agents.connect(f.other).setExecutionWallet(1, f.other.address);
  expect(await f.agents.getAgentWallet(1)).to.equal(f.other.address);
  await f.agents.connect(f.other).revokeExecutionGrants(1);
  expect(await f.agents.controlEpoch(1)).to.equal(epoch + 3n);
 });
 it('does not let a transferred personalized slot issue supply to the seller wallet', async () => {
  const f = await loadFixture(fixture); await f.mint(); await f.personalize();
  await f.agents.connect(f.buyer).transferFrom(f.buyer.address, f.other.address, 1);
  await expect(f.issue(1, f.other)).to.be.revertedWith('Set execution wallet after transfer');
  await f.agents.connect(f.other).setExecutionWallet(1, f.other.address); await f.issue(1, f.other);
  const token = await ethers.getContractAt('CompanionToken', await f.agents.socialToken(1));
  expect(await token.balanceOf(f.other.address)).to.equal(ETH('40000000'));
  expect(await token.balanceOf(f.wallet.address)).to.equal(0);
 });
});
