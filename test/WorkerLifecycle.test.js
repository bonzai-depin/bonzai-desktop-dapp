const {expect}=require('chai');
const {ethers}=require('hardhat');
const {time}=require('@nomicfoundation/hardhat-network-helpers');

describe('Worker lifecycle: deployed local contracts and production authorization',function(){
 this.timeout(90000);
 it('mints, personalizes, issues, hires, delegates execution, delivers, settles, transfers and revokes',async()=>{
  const {createAgentWorkerHost,mediaHash}=await import('../src/main/agentWorkerHost.js');
  const {verifyAcceptedWorkerJob}=await import('../src/services/workerJobAuthorization.js');
  const {workerGrantMessage,workerCallMessage,workerKey}=await import('../src/services/agentWorkerProtocol.js');
  const {jobPacketMessage}=await import('../src/services/smartAgentHandoff.js');
  const [admin,owner,employer,worker,treasury,requester,buyer]=await ethers.getSigners();
  const deploy=async(name,...args)=>(await ethers.getContractFactory(name)).deploy(...args);
  const nvda=await deploy('MockNvda'), swap=await deploy('MockNvdaSwap',await nvda.getAddress()), permit=await deploy('MockPermit2');
  const positions=await deploy('MockAgentPositionManager',await permit.getAddress()), pools=await deploy('MockPoolManager');
  const agents=await deploy('BonzaiSmartAgents',treasury.address,'ipfs://slot');
  const factory=await deploy('BonzaiAgentTokenFactory',await agents.getAddress(),await nvda.getAddress(),await swap.getAddress(),await pools.getAddress(),await positions.getAddress(),await permit.getAddress());
  await agents.setLauncher(await factory.getAddress());const start=(await time.latest())+2;await agents.scheduleDrop(start,start+10000);await time.increaseTo(start);
  await agents.connect(owner).mintSlots(1,{value:ethers.parseEther('2')});
  await agents.connect(owner).personalize(1,'ipfs://agent','Rose Kanagawa','ROSE','ipfs://portrait',worker.address);
  await agents.connect(owner).issueToken(1,24000000,(await time.latest())+1000);
  const token=await ethers.getContractAt('CompanionToken',await agents.socialToken(1));
  const bonzai=await deploy('MockERC20','BONZAI','BONZAI');
  const vault=await deploy('BonzaiStakingVault',await bonzai.getAddress(),[1,2,3,4,5,6]);
  const basket=await deploy('BonzaiBasketRewards',await vault.getAddress(),await factory.getAddress(),7*86400);
  const router=await deploy('BonzaiRevenueRouter',await vault.getAddress(),treasury.address);
  await router.setBasketRewards(await basket.getAddress());
  const escrow=await deploy('BonzaiJobEscrow',treasury.address,await router.getAddress());await escrow.configureSmartAgentEconomy(await factory.getAddress(),await basket.getAddress());
  const chainId=Number((await ethers.provider.getNetwork()).chainId), amount=ethers.parseEther('100');
  await token.connect(worker).transfer(employer.address,amount);await token.connect(employer).approve(await escrow.getAddress(),amount);
  const execution={capability:'audio',input:{prompt:'One minute meditation'}};
  const terms={title:'Meditation',outcome:'Playable audio',chainId,escrow:await escrow.getAddress(),worker:worker.address,currency:await token.getAddress(),amount:amount.toString(),companionTokenId:'1',routeAssetId:ethers.ZeroHash,arbitrator:admin.address,executionPeer:'delegated-device',executionCaller:requester.address,executionHash:ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(execution)))};
  const jobId=ethers.id('complete-worker-job'),termsHash=ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(terms)));
  await escrow.connect(employer).fundTokenJob(jobId,worker.address,1,amount,termsHash,ethers.ZeroHash,admin.address);await escrow.connect(worker).acceptJob(jobId);
  const packet={version:1,kind:'bonzai-agent-job',jobId,terms};packet.signature=await employer.signMessage(jobPacketMessage(packet));
  const state=new Map();let count=0;
  const bytes=Buffer.from('RIFF'+ 'worker delivery '.repeat(100)),blobId=mediaHash(bytes);
  const identity=async()=>({owner:await agents.ownerOf(1),wallet:await agents.getAgentWallet(1),epoch:String(await agents.controlEpoch(1)),token:await agents.socialToken(1)});
  const host=createAgentWorkerHost({store:{get:(k,f)=>state.get(k)??f,set:(k,v)=>state.set(k,v)},mode:()=> 'provider',peerId:()=>terms.executionPeer,resolveIdentity:identity,
   verifyJob:async(p,ctx)=>{const j=await escrow.jobs(jobId),t=await escrow.jobTerms(jobId);return verifyAcceptedWorkerJob(p,{...terms,employer:j.employer,status:Number(j.status),termsHash:j.termsHash,deliverBy:Number(t.deliverBy)}, {...ctx,escrow:terms.escrow});},
   run:async()=>{count++;return{};},media:{prepare:async()=>({text:'Ready',artifacts:[{id:blobId,sha256:blobId,size:bytes.length,ext:'wav',mimeType:'audio/wav'}]}),read:async(a,o,n)=>bytes.subarray(o,o+n)}});
  const grant={version:1,chainId,collection:await agents.getAddress(),tokenId:'1',epoch:String(await agents.controlEpoch(1)),peerId:terms.executionPeer,name:'Rose',capabilities:['audio'],workflows:[],expiresAt:Date.now()+600000};
  await host.publish({grant,signature:await owner.signMessage(workerGrantMessage(grant))},{agentId:'rose'});
  const requestId=ethers.id('execution');
  const send=async(action,rest={})=>{const call={version:1,worker:workerKey(grant),requestId,action,expiresAt:Date.now()+60000,...rest};return host.handle({call,signature:await requester.signMessage(workerCallMessage(call))});};
  await send('execute',{...execution,job:packet});await new Promise(setImmediate);
  const result=await send('status');expect(result.status).to.equal('completed');
  expect(Buffer.from((await send('media',{artifactId:blobId,offset:0})).data,'base64')).to.deep.equal(bytes);
  await send('execute',{...execution,job:packet});expect(count).to.equal(1);
  const evidence=JSON.stringify(result.result);await escrow.connect(worker).submitWork(jobId,ethers.keccak256(ethers.toUtf8Bytes(evidence)));await escrow.connect(employer).approveWork(jobId);
  expect(await escrow.tokenWithdrawable(await token.getAddress(),worker.address)).to.equal(amount*9750n/10000n);
  await escrow.connect(worker).withdrawTokenPayments(await token.getAddress(),worker.address);
  await agents.connect(owner).transferFrom(owner.address,buyer.address,1);expect(await host.discover()).to.deep.equal([]);
  expect((await send('status')).status).to.equal('completed');
  await agents.connect(buyer).setExecutionWallet(1,buyer.address);expect(await agents.getAgentWallet(1)).to.equal(buyer.address);
 });
});
