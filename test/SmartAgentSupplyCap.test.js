const {expect}=require('chai');
const {ethers}=require('hardhat');
const {loadFixture}=require('@nomicfoundation/hardhat-toolbox/network-helpers');
const {deployCompanions,deployCompanionTokenFactory}=require('./helpers/deploy');
const {COMPANION_MINT_PRICE,VALID_SPENDING_PROFILE,MIN_ETH_LIQUIDITY}=require('./helpers/constants');
// Discover a counter through its public getter, restoring every other slot.
async function setCounter(contract,getter,value){
 const address=await contract.getAddress();
 for(let slot=0;slot<50;slot++){
  const old=await ethers.provider.getStorage(address,slot);
  await ethers.provider.send('hardhat_setStorageAt',[address,ethers.toBeHex(slot,32),ethers.toBeHex(value,32)]);
  if(await contract[getter]()===BigInt(value))return;
  await ethers.provider.send('hardhat_setStorageAt',[address,ethers.toBeHex(slot,32),old]);
 }
 throw Error('Counter slot not found');
}
describe('Canonical smart-agent lifetime supply',function(){
 it('allows agent 10,000, then rejects both mint entry points even after transfer',async()=>{
  const {companions,user1,user2}=await loadFixture(deployCompanions);
  expect(await companions.MAX_SUPPLY()).to.equal(10000);
  await setCounter(companions,'totalSupply',9999);
  const args=['ipfs://agent',ethers.ZeroHash,VALID_SPENDING_PROFILE,0,ethers.ZeroAddress];
  await companions.connect(user1).mintCompanion(...args,{value:COMPANION_MINT_PRICE});
  expect(await companions.ownerOf(10000)).to.equal(user1.address);
  await companions.connect(user1).transferFrom(user1.address,user2.address,10000);
  await expect(companions.connect(user1).mintCompanion(...args,{value:COMPANION_MINT_PRICE})).to.be.revertedWith('Max supply reached');
  await expect(companions.connect(user1).mintCompanionWithToken(...args,'Agent','AGENT',{value:COMPANION_MINT_PRICE})).to.be.revertedWith('Max supply reached');
 });
 it('does not allow changing or removing the canonical token factory after minting',async()=>{
  const {companions,user1,user2}=await loadFixture(deployCompanions);
  await companions.connect(user1).mintCompanion('ipfs://agent',ethers.ZeroHash,VALID_SPENDING_PROFILE,0,ethers.ZeroAddress,{value:COMPANION_MINT_PRICE});
  // Previously unconfigured collections can install their first factory.
  await companions.setCompanionTokenFactory(user1.address);
  await companions.setCompanionTokenFactory(user1.address);
  await expect(companions.setCompanionTokenFactory(user2.address)).to.be.revertedWith('Token factory frozen after minting');
  await expect(companions.setCompanionTokenFactory(ethers.ZeroAddress)).to.be.revertedWith('Token factory frozen after minting');
 });
 it('caps social-token contracts independently of NFT registry assumptions',async()=>{
  const {factory,user1,agentWallet,companionOwner,mockCompanions}=await loadFixture(deployCompanionTokenFactory);
  expect(await factory.MAX_SOCIAL_TOKENS()).to.equal(10000);
  const launch=id=>factory.connect(user1).launchToken(id,'Agent','AGENT','ipfs://agent',agentWallet.address,companionOwner.address,{value:MIN_ETH_LIQUIDITY});
  await expect(launch(10001)).to.be.revertedWith('Social token supply cap reached');
  await mockCompanions.mintTo(user1.address);
  await setCounter(factory,'totalTokensLaunched',10000);
  await expect(launch(1)).to.be.revertedWith('Social token supply cap reached');
 });
});
