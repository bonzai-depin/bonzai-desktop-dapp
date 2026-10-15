const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('BonzAI smart-agent job escrow recovery', function () {
  const ONE = ethers.parseEther('1');
  async function fixture() {
    const [owner, employer, worker, treasury, contributor, outsider, nextOwner] = await ethers.getSigners();
    const router = await (await ethers.getContractFactory('MockRevenueRouter')).deploy();
    const escrow = await (await ethers.getContractFactory('BonzaiJobEscrow')).deploy(treasury.address, await router.getAddress());
    const jobId = ethers.id('job');
    const routeId = ethers.id('route');
    await router.setRoute(routeId, [contributor.address], [10000]);
    const fund = async (route = routeId, workerAddress = worker.address, value = ONE) => escrow.connect(employer).fundJob(jobId, workerAddress, 42, ethers.id('terms'), route, owner.address, { value });
    const submit = async () => { await escrow.connect(worker).acceptJob(jobId); await escrow.connect(worker).submitWork(jobId, ethers.id('evidence')); };
    return { owner, employer, worker, treasury, contributor, outsider, nextOwner, router, escrow, jobId, routeId, fund, submit };
  }
  async function conserved(escrow) {
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
      (await escrow.totalEscrowed()) + (await escrow.totalWithdrawable()) + (await escrow.totalPendingContributions()));
  }
  async function after(deadline) { await time.increaseTo(deadline + 1n); }

  it('separates completion, withdrawals and royalty routing without losing any ETH', async function () {
    const { employer, worker, treasury, router, escrow, jobId, routeId, fund, submit } = await fixture();
    await fund(); await submit();
    await escrow.connect(employer).approveWork(jobId);
    expect((await escrow.jobs(jobId)).status).to.equal(4);
    expect(await escrow.withdrawable(worker.address)).to.equal(ethers.parseEther('0.95'));
    expect(await escrow.withdrawable(treasury.address)).to.equal(ethers.parseEther('0.025'));
    expect(await escrow.pendingContributions(jobId)).to.equal(ethers.parseEther('0.025'));
    await conserved(escrow);
    await expect(escrow.connect(worker).withdrawPayments(worker.address)).to.changeEtherBalance(worker, ethers.parseEther('0.95'));
    await escrow.connect(treasury).withdrawPayments(treasury.address);
    await escrow.routeContribution(jobId);
    expect(await router.received(routeId)).to.equal(ethers.parseEther('0.025'));
    await conserved(escrow);
    await expect(escrow.connect(employer).approveWork(jobId)).to.be.revertedWith('Cannot approve');
    await expect(escrow.routeContribution(jobId)).to.be.revertedWith('No pending contribution');
    await expect(escrow.connect(worker).withdrawPayments(worker.address)).to.be.revertedWith('Nothing to withdraw');
  });

  it('cancellation creates a refund credit and is unavailable after acceptance', async function () {
    const { employer, worker, escrow, jobId, fund } = await fixture();
    await fund(); await escrow.connect(employer).cancelJob(jobId);
    expect((await escrow.jobs(jobId)).status).to.equal(5);
    expect(await escrow.withdrawable(employer.address)).to.equal(ONE);
    await expect(escrow.connect(worker).acceptJob(jobId)).to.be.revertedWith('Cannot accept');
    await conserved(escrow);
    await expect(escrow.connect(employer).cancelJob(jobId)).to.be.revertedWith('Cannot cancel');
  });

  it('refunds unaccepted and undelivered jobs only after their respective deadlines', async function () {
    for (const accepted of [false, true]) {
      const { employer, worker, outsider, escrow, jobId, fund } = await fixture();
      await fund();
      if (accepted) await escrow.connect(worker).acceptJob(jobId);
      await expect(escrow.expireJob(jobId)).to.be.revertedWith('Not expired');
      const terms = await escrow.jobTerms(jobId);
      await after(accepted ? terms.deliverBy : terms.acceptBy);
      if (accepted) await expect(escrow.connect(worker).submitWork(jobId, ethers.id('late'))).to.be.revertedWith('Delivery expired');
      else await expect(escrow.connect(worker).acceptJob(jobId)).to.be.revertedWith('Acceptance expired');
      await escrow.connect(outsider).expireJob(jobId);
      expect(await escrow.withdrawable(employer.address)).to.equal(ONE);
      expect(await escrow.withdrawable(outsider.address)).to.equal(0);
      await conserved(escrow);
    }
  });

  it('releases submitted work after an unresponsive employer review window', async function () {
    const { worker, employer, outsider, escrow, jobId, fund, submit } = await fixture();
    await fund(ethers.ZeroHash); await submit();
    await expect(escrow.expireJob(jobId)).to.be.revertedWith('Not expired');
    await after((await escrow.jobTerms(jobId)).reviewBy);
    await expect(escrow.connect(employer).raiseDispute(jobId, ethers.id('late dispute'))).to.be.revertedWith('Cannot dispute');
    await escrow.connect(outsider).expireJob(jobId);
    expect(await escrow.withdrawable(worker.address)).to.equal(ethers.parseEther('0.975'));
    await conserved(escrow);
  });

  it('requires two distinct parties and an exact proposal for cooperative partial settlement', async function () {
    const { employer, worker, outsider, treasury, escrow, jobId, fund } = await fixture();
    await fund(); await escrow.connect(worker).acceptJob(jobId);
    await expect(escrow.connect(employer).cancelJob(jobId)).to.be.revertedWith('Cannot cancel');
    await expect(escrow.connect(outsider).proposeSettlement(jobId, 4000)).to.be.revertedWith('Not a party');
    await escrow.connect(employer).proposeSettlement(jobId, 4000);
    await expect(escrow.connect(employer).acceptSettlement(jobId, 4000)).to.be.revertedWith('No matching proposal');
    await escrow.connect(employer).proposeSettlement(jobId, 5000);
    await expect(escrow.connect(worker).acceptSettlement(jobId, 4000)).to.be.revertedWith('No matching proposal');
    await escrow.connect(worker).acceptSettlement(jobId, 5000);
    expect(await escrow.withdrawable(employer.address)).to.equal(ONE / 2n);
    expect(await escrow.withdrawable(worker.address)).to.equal(ethers.parseEther('0.475'));
    expect(await escrow.withdrawable(treasury.address)).to.equal(ethers.parseEther('0.0125'));
    expect(await escrow.pendingContributions(jobId)).to.equal(ethers.parseEther('0.0125'));
    await conserved(escrow);
  });

  it('invalidates a pre-submission settlement proposal and prevents unauthorized disputes', async function () {
    const { worker, employer, outsider, escrow, jobId, fund } = await fixture();
    await fund(); await escrow.connect(worker).acceptJob(jobId);
    await escrow.connect(employer).proposeSettlement(jobId, 0);
    await escrow.connect(worker).submitWork(jobId, ethers.id('work'));
    await expect(escrow.connect(worker).acceptSettlement(jobId, 0)).to.be.revertedWith('No matching proposal');
    await expect(escrow.connect(outsider).raiseDispute(jobId, ethers.id('dispute'))).to.be.revertedWith('Not a party');
    await expect(escrow.connect(employer).raiseDispute(jobId, ethers.ZeroHash)).to.be.revertedWith('Reason required');
  });

  it('snapshots independent arbitration and supports proportional dispute resolution', async function () {
    const { owner, nextOwner, employer, worker, escrow, jobId, fund, submit } = await fixture();
    await fund(); await submit(); await escrow.transferOwnership(nextOwner.address);
    await escrow.connect(employer).raiseDispute(jobId, ethers.id('incomplete work'));
    expect((await escrow.jobTerms(jobId)).arbitrator).to.equal(owner.address);
    await expect(escrow.connect(nextOwner).resolveDispute(jobId, 5000)).to.be.revertedWith('Not job arbitrator');
    await expect(escrow.connect(owner).resolveDispute(jobId, 10001)).to.be.revertedWith('Invalid worker share');
    await escrow.connect(owner).resolveDispute(jobId, 4000);
    expect(await escrow.withdrawable(employer.address)).to.equal(ethers.parseEther('0.6'));
    expect(await escrow.withdrawable(worker.address)).to.equal(ethers.parseEther('0.38'));
    await conserved(escrow);
  });

  it('prevents absent or party-controlled arbiters from receiving new jobs', async function () {
    const { owner, employer, worker, escrow, jobId } = await fixture();
    await expect(escrow.fundJob(jobId, worker.address, 0, ethers.id('terms'), ethers.ZeroHash, owner.address, { value: 1 })).to.be.revertedWith('Independent arbitrator required');
    await escrow.connect(owner).transferOwnership(employer.address);
    await expect(escrow.connect(employer).fundJob(jobId, worker.address, 0, ethers.id('terms'), ethers.ZeroHash, employer.address, { value: 1 })).to.be.revertedWith('Independent arbitrator required');
    await escrow.connect(employer).renounceOwnership();
    await expect(escrow.connect(worker).fundJob(jobId, employer.address, 0, ethers.id('terms'), ethers.ZeroHash, ethers.ZeroAddress, { value: 1 })).to.be.revertedWith('Independent arbitrator required');
  });

  it('rejects an owner change between reviewing funding terms and funding execution', async function () {
    const { nextOwner, escrow, fund } = await fixture();
    await escrow.transferOwnership(nextOwner.address);
    await expect(fund()).to.be.revertedWith('Arbitrator changed');
    expect(await escrow.totalEscrowed()).to.equal(0);
  });

  it('has bounded arbitrator recovery for both submitted and undelivered disputed work', async function () {
    for (const submitted of [false, true]) {
      const { owner, employer, worker, escrow, jobId, fund, submit } = await fixture();
      await fund(ethers.ZeroHash);
      if (submitted) await submit(); else await escrow.connect(worker).acceptJob(jobId);
      await escrow.connect(employer).raiseDispute(jobId, ethers.id('dispute'));
      await expect(escrow.expireJob(jobId)).to.be.revertedWith('Not expired');
      await after((await escrow.jobTerms(jobId)).resolveBy);
      await expect(escrow.connect(owner).resolveDispute(jobId, 5000)).to.be.revertedWith('Resolution expired');
      await escrow.expireJob(jobId);
      expect(await escrow.withdrawable(employer.address)).to.equal(submitted ? 0 : ONE);
      expect(await escrow.withdrawable(worker.address)).to.equal(submitted ? ethers.parseEther('0.975') : 0);
      await conserved(escrow);
    }
  });

  it('rejects missing and malformed routes before accepting ETH', async function () {
    const { contributor, escrow, routeId, router, fund } = await fixture();
    await expect(fund(ethers.id('absent'))).to.be.revertedWith('Unknown route');
    await router.setRoute(routeId, [contributor.address], [9000]);
    await expect(fund()).to.be.revertedWith('Invalid route shares');
    await router.setRoute(routeId, [ethers.ZeroAddress], [10000]);
    await expect(fund()).to.be.revertedWith('Invalid route recipient');
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0);
  });

  it('settles despite failed royalty routing and retries once the router recovers', async function () {
    const { employer, worker, router, escrow, jobId, routeId, fund, submit } = await fixture();
    await fund(); await submit(); await router.setRejectDeposits(true);
    await escrow.connect(employer).approveWork(jobId);
    await expect(escrow.routeContribution(jobId)).to.emit(escrow, 'ContributionRoutingFailed');
    expect(await escrow.pendingContributions(jobId)).to.equal(ethers.parseEther('0.025'));
    await escrow.connect(worker).withdrawPayments(worker.address);
    await conserved(escrow);
    await router.setRejectDeposits(false); await escrow.routeContribution(jobId);
    expect(await router.received(routeId)).to.equal(ethers.parseEther('0.025'));
    await conserved(escrow);
  });

  it('fallback pays snapshotted base contributors with rounding conservation and no party redirection', async function () {
    const { employer, contributor, outsider, router, escrow, jobId, routeId, fund, submit } = await fixture();
    await router.setRoute(routeId, [contributor.address, outsider.address, employer.address], [3333, 6667, 0]);
    await fund(routeId, undefined, 10001n); await submit(); await router.setRejectDeposits(true);
    await escrow.connect(employer).approveWork(jobId);
    const pending = await escrow.pendingContributions(jobId);
    await expect(escrow.distributeContributionFallback(jobId)).to.be.revertedWith('Routing retry window');
    await router.setRoute(routeId, [employer.address], [10000]); // Later router metadata cannot redirect royalties.
    await time.increaseTo(await escrow.contributionFallbackAt(jobId));
    await escrow.distributeContributionFallback(jobId);
    expect(await escrow.withdrawable(contributor.address)).to.equal(pending * 3333n / 10000n);
    expect(await escrow.withdrawable(outsider.address)).to.equal(pending - pending * 3333n / 10000n);
    expect(await escrow.withdrawable(employer.address)).to.equal(0);
    await conserved(escrow);
    await expect(escrow.distributeContributionFallback(jobId)).to.be.revertedWith('No pending contribution');
  });

  it('rejecting worker and treasury cannot block settlement and can choose a payable receiver', async function () {
    const { owner, employer, outsider, router, jobId } = await fixture();
    const recipient = await (await ethers.getContractFactory('MockEscrowParticipant')).deploy();
    await recipient.setRejectEther(true);
    const escrow = await (await ethers.getContractFactory('BonzaiJobEscrow')).connect(owner).deploy(await recipient.getAddress(), await router.getAddress());
    const addr = await escrow.getAddress();
    await escrow.connect(employer).fundJob(jobId, await recipient.getAddress(), 0, ethers.id('terms'), ethers.ZeroHash, owner.address, { value: ONE });
    await recipient.execute(addr, escrow.interface.encodeFunctionData('acceptJob', [jobId]));
    await recipient.execute(addr, escrow.interface.encodeFunctionData('submitWork', [jobId, ethers.id('evidence')]));
    await escrow.connect(employer).approveWork(jobId);
    expect(await escrow.withdrawable(await recipient.getAddress())).to.equal(ONE);
    await expect(recipient.execute(addr, escrow.interface.encodeFunctionData('withdrawPayments', [await recipient.getAddress()]))).to.be.revertedWith('Participant call failed');
    expect(await escrow.withdrawable(await recipient.getAddress())).to.equal(ONE);
    await expect(recipient.execute(addr, escrow.interface.encodeFunctionData('withdrawPayments', [outsider.address]))).to.changeEtherBalance(outsider, ONE);
    await conserved(escrow);
  });

  it('withdrawals cannot reenter or drain another job credit', async function () {
    const { employer, worker, escrow, jobId, fund, submit } = await fixture();
    const receiver = await (await ethers.getContractFactory('MockEscrowParticipant')).deploy();
    await fund(ethers.ZeroHash); await submit(); await escrow.connect(employer).approveWork(jobId);
    await receiver.setEscrow(await escrow.getAddress());
    await escrow.connect(worker).withdrawPayments(await receiver.getAddress());
    expect(await receiver.reentryAttempts()).to.equal(1);
    expect(await receiver.reentrySucceeded()).to.equal(false);
    expect(await escrow.withdrawable(worker.address)).to.equal(0);
    await conserved(escrow);
  });

  it('fallback still honors a working canonical route at its 64-recipient limit', async function () {
    const [owner, employer, worker, treasury] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory('MockERC20')).deploy('BONZAI', 'BONZAI');
    const vault = await (await ethers.getContractFactory('BonzaiStakingVault')).deploy(await token.getAddress(), [1, 2, 3, 4, 5, 6]);
    const router = await (await ethers.getContractFactory('BonzaiRevenueRouter')).deploy(await vault.getAddress(), treasury.address);
    const escrow = await (await ethers.getContractFactory('BonzaiJobEscrow')).deploy(treasury.address, await router.getAddress());
    const source = ethers.id('64 contributors');
    const wallets = Array.from({ length: 64 }, (_, index) => ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(index + 1000), 20)));
    const shares = Array(64).fill(156); shares[63] = 172;
    await router.registerRoute(source, 'ipfs://contributors', wallets, shares, Array(64).fill(0), Array(64).fill('data'));
    const routeId = await router.routeIdFor(owner.address, source);
    const jobId = ethers.id('canonical router job');
    await escrow.connect(employer).fundJob(jobId, worker.address, 0, ethers.id('terms'), routeId, owner.address, { value: ONE });
    await escrow.connect(worker).acceptJob(jobId);
    await escrow.connect(worker).submitWork(jobId, ethers.id('evidence'));
    await escrow.connect(employer).approveWork(jobId);
    await time.increaseTo(await escrow.contributionFallbackAt(jobId));
    await expect(escrow.distributeContributionFallback(jobId, { gasLimit: 500_000 })).to.be.revertedWith('Insufficient routing gas');
    expect(await escrow.pendingContributions(jobId)).to.equal(ethers.parseEther('0.025'));
    expect(await escrow.withdrawable(wallets[0])).to.equal(0);
    await expect(escrow.distributeContributionFallback(jobId, { gasLimit: 5_000_000 })).to.emit(escrow, 'ContributionRouted');
    expect(await escrow.pendingContributions(jobId)).to.equal(0);
    expect(await escrow.withdrawable(wallets[0])).to.equal(0);
    expect(await router.claimable(routeId, wallets[0])).to.be.greaterThan(0);
    await conserved(escrow);
  });
});
