const {expect}=require('chai');
const {ethers}=require('hardhat');
async function fixture(agent=false){
 const [factory,creator,owner,treasury,caller,newOwner]=await ethers.getSigners();
 const deploy=async(n,...args)=>(await ethers.getContractFactory(n)).deploy(...args);
 const positions=await deploy('MockVaultPositions'),rewards=await deploy('MockVaultRewards'),token=await deploy('MockNvda'),agents=await deploy('MockVaultAgents');
 const vault=await deploy('BonzaiLiquidityVault',await positions.getAddress(),treasury.address,await rewards.getAddress());
 await agents.mint(owner.address,creator.address);await positions.mint(await vault.getAddress(),1);
 await vault.register(1,ethers.ZeroAddress,await token.getAddress(),creator.address,agent?await agents.getAddress():ethers.ZeroAddress,agent?1:0);
 await token.mint(factory.address,10000);await token.approve(await positions.getAddress(),10000);
 const fund=async()=>{await positions.fund(1,ethers.ZeroAddress,1000,{value:1000});await positions.fund(1,await token.getAddress(),1000);};
 return {factory,creator,owner,treasury,caller,newOwner,positions,rewards,token,agents,vault,fund};
}
describe('Permanent liquidity and single-pass fee accounting',()=>{
 for(const agent of [false,true])it(agent?'splits agent fees 35/35/20/10 in both currencies':'splits model/game fees 70/20/10 exactly once in both currencies',async()=>{
  const f=await fixture(agent);await f.fund();await f.vault.connect(f.caller).collect(1);
  for(const c of [ethers.ZeroAddress,await f.token.getAddress()]){
   expect(await f.vault.claimable(c,f.creator.address)).to.equal(agent?350:700);
   expect(await f.vault.claimable(c,f.owner.address)).to.equal(agent?350:0);
   expect(await f.vault.claimable(c,f.treasury.address)).to.equal(200);
   expect(await f.vault.pendingRewards(c)).to.equal(100);
   await f.vault.connect(f.caller).flushRewards(c);expect(await f.rewards.deposited(c)).to.equal(100);
   await f.vault.connect(f.caller).claim(c,f.creator.address);expect(await f.vault.claimable(c,f.creator.address)).to.equal(0);
  }
  expect(await f.positions.principal(1)).to.equal(1000);expect(await f.positions.ownerOf(1)).to.equal(await f.vault.getAddress());
  expect(await f.positions.getApproved(1)).to.equal(ethers.ZeroAddress);
  await f.vault.collect(1);expect(await f.vault.pendingRewards(ethers.ZeroAddress)).to.equal(0);
 });
 it('snapshots earned credits but uses current NFT owner and execution wallet for future collection',async()=>{
  const f=await fixture(true);await f.fund();await f.vault.collect(1);
  await f.agents.connect(f.owner).transferFrom(f.owner.address,f.newOwner.address,1);await f.agents.connect(f.newOwner).setWallet(f.caller.address);
  await f.fund();await f.vault.collect(1);
  for(const c of [ethers.ZeroAddress,await f.token.getAddress()]) for(const who of [f.owner,f.creator,f.newOwner,f.caller])expect(await f.vault.claimable(c,who.address)).to.equal(350);
 });
 it('isolates donations and preserves pending rewards when their destination is unavailable',async()=>{
  const f=await fixture();await f.factory.sendTransaction({to:await f.vault.getAddress(),value:700});
  await f.fund();await f.rewards.setFail(true);await f.vault.collect(1);
  await expect(f.vault.flushRewards(ethers.ZeroAddress)).to.be.revertedWith('Rewards unavailable');
  expect(await f.vault.pendingRewards(ethers.ZeroAddress)).to.equal(100);
  await f.vault.claim(ethers.ZeroAddress,f.creator.address);
  await f.rewards.setFail(false);await f.vault.flushRewards(ethers.ZeroAddress);
 });
 it('rejects foreign positions, unauthorized registration and duplicate registration',async()=>{
  const f=await fixture();await expect(f.vault.collect(2)).to.be.revertedWith('Unknown position');
  await expect(f.vault.connect(f.caller).register(2,ethers.ZeroAddress,await f.token.getAddress(),f.creator.address,ethers.ZeroAddress,0)).to.be.revertedWith('Only factory');
  await expect(f.vault.register(1,ethers.ZeroAddress,await f.token.getAddress(),f.creator.address,ethers.ZeroAddress,0)).to.be.revertedWith('Invalid position');
  await f.positions.mint(f.creator.address,2);
  await expect(f.vault.register(2,ethers.ZeroAddress,await f.token.getAddress(),f.creator.address,ethers.ZeroAddress,0)).to.be.revertedWith('Position not locked');
 });
 it('splits the creator allocation among explicit contributors without taxing it a second time',async()=>{
  const f=await fixture();await f.fund();await f.vault.collect(1);
  await expect(f.vault.connect(f.caller).setCreatorRecipients(1,[f.caller.address],[10000])).to.be.revertedWith('Only creator');
  await f.vault.connect(f.creator).setCreatorRecipients(1,[f.creator.address,f.owner.address],[2500,7500]);
  await expect(f.vault.connect(f.creator).setCreatorRecipients(1,[f.creator.address],[10000])).to.be.revertedWith('Recipients already configured');
  await f.fund();await f.vault.collect(1);
  for(const c of [ethers.ZeroAddress,await f.token.getAddress()]) {
   expect(await f.vault.claimable(c,f.creator.address)).to.equal(875); // First 700 + subsequent 175.
   expect(await f.vault.claimable(c,f.owner.address)).to.equal(525);
   expect(await f.vault.claimable(c,f.treasury.address)).to.equal(400);
   expect(await f.vault.pendingRewards(c)).to.equal(200);
  }
 });
 it('rejects invalid contributor plans atomically and keeps the agent split immutable',async()=>{
  const f=await fixture();
  await expect(f.vault.connect(f.creator).setCreatorRecipients(1,[f.creator.address],[9999])).to.be.revertedWith('Shares must total 10000');
  expect((await f.vault.getCreatorRecipients(1)).length).to.equal(0);
  await expect(f.vault.connect(f.creator).setCreatorRecipients(1,[f.creator.address,f.creator.address],[5000,5000])).to.be.revertedWith('Duplicate recipient');
  const a=await fixture(true);await expect(a.vault.connect(a.creator).setCreatorRecipients(1,[a.creator.address],[10000])).to.be.revertedWith('Only creator');
 });

 it('lets a rejecting contract beneficiary recover its own fees to another wallet without touching principal',async()=>{
  const f=await fixture();const rejector=await(await ethers.getContractFactory('MockEscrowParticipant')).deploy();
  await rejector.setRejectEther(true);
  await f.vault.connect(f.creator).setCreatorRecipients(1,[await rejector.getAddress()],[10000]);
  await f.fund();await f.vault.collect(1);
  await expect(f.vault.claim(ethers.ZeroAddress,await rejector.getAddress())).to.be.revertedWith('Payment failed');
  expect(await f.vault.claimable(ethers.ZeroAddress,await rejector.getAddress())).to.equal(700);
  await expect(f.vault.connect(f.caller).claimTo(ethers.ZeroAddress,f.caller.address)).to.be.revertedWith('No fees');
  await expect(rejector.execute(await f.vault.getAddress(),f.vault.interface.encodeFunctionData('claimTo',[ethers.ZeroAddress,f.creator.address]))).to.changeEtherBalance(f.creator,700);
  expect(await f.vault.claimable(ethers.ZeroAddress,await rejector.getAddress())).to.equal(0);
  expect(await f.positions.principal(1)).to.equal(1000);
 });

});
