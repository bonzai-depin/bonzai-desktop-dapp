const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
describe('Native social-token x402/EIP-3009 payments', () => {
 async function fixture() {
  const [payer, worker, relayer] = await ethers.getSigners();
  const Token = await ethers.getContractFactory('CompanionToken');
  const token = await Token.deploy('Rose', 'ROSE', 1000n, payer.address, 'ipfs://image', worker.address, 1);
  const domain = { name: 'Rose', version: '1', chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await token.getAddress() };
  const types = { TransferWithAuthorization: [{ name:'from',type:'address' },{ name:'to',type:'address' },{ name:'value',type:'uint256' },{ name:'validAfter',type:'uint256' },{ name:'validBefore',type:'uint256' },{ name:'nonce',type:'bytes32' }] };
  const auth = { from: payer.address, to: worker.address, value: 25n, validAfter: (await time.latest())-1, validBefore: (await time.latest())+300, nonce: ethers.id('payment') };
  const signature = ethers.Signature.from(await payer.signTypedData(domain, types, auth));
  const args = [auth.from,auth.to,auth.value,auth.validAfter,auth.validBefore,auth.nonce,signature.v,signature.r,signature.s];
  return { payer,worker,relayer,token,domain,types,auth,args };
 }
 it('allows an independent relayer to pay exact tokens once without allowance or tax', async () => {
  const f = await fixture();
  await f.token.connect(f.relayer).transferWithAuthorization(...f.args);
  expect(await f.token.balanceOf(f.worker.address)).to.equal(25n);
  expect(await f.token.allowance(f.payer.address,f.relayer.address)).to.equal(0);
  expect(await f.token.totalSupply()).to.equal(1000n);
  await expect(f.token.transferWithAuthorization(...f.args)).to.be.revertedWith('Authorization already used');
 });
 it('rejects changes to recipient, amount, domain chain and expired authorization', async () => {
  const f = await fixture();
  const recipient = [...f.args];recipient[1]=f.relayer.address;
  await expect(f.token.transferWithAuthorization(...recipient)).to.be.revertedWith('Invalid authorization');
  const amount=[...f.args];amount[2]=26;
  await expect(f.token.transferWithAuthorization(...amount)).to.be.revertedWith('Invalid authorization');
  const wrong=ethers.Signature.from(await f.payer.signTypedData({...f.domain,chainId:4663},f.types,f.auth));
  await expect(f.token.transferWithAuthorization(...f.args.slice(0,6),wrong.v,wrong.r,wrong.s)).to.be.revertedWith('Invalid authorization');
  await time.increaseTo(f.auth.validBefore);
  await expect(f.token.transferWithAuthorization(...f.args)).to.be.revertedWith('Authorization outside validity window');
 });
 it('supports the dependency-free v2 exact client and local facilitator helpers', async () => {
  const f=await fixture(); const {exactRequirements,signExactPayment,verifyExactPayment,settleExactPayment}=await import('../src/services/x402Exact.js');
  const requirement=exactRequirements({chainId:Number(f.domain.chainId),asset:await f.token.getAddress(),payTo:f.worker.address,amount:'25',name:'Rose'});
  const payment=await signExactPayment(requirement,f.payer,{approved:true,now:await time.latest()});
  expect((await verifyExactPayment(payment,requirement,ethers.provider,await time.latest())).payer).to.equal(f.payer.address);
  const settled=await settleExactPayment(payment,requirement,f.relayer,{approved:true});
  expect(settled.success).to.equal(true);
  expect(await f.token.balanceOf(f.worker.address)).to.equal(25n);
  await expect(verifyExactPayment(payment,requirement,ethers.provider,await time.latest())).to.be.rejectedWith('already used');
 });
});
