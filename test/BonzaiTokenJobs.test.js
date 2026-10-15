const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('Smart-agent social-token job settlement', function () {
  async function fixture() {
    const [owner, employer, worker, treasury, contributor, outsider, nextOwner] = await ethers.getSigners();
    const bonzai = await (await ethers.getContractFactory('MockERC20')).deploy('BONZAI', 'BONZAI');
    const vault = await (await ethers.getContractFactory('BonzaiStakingVault')).deploy(await bonzai.getAddress(), [1, 2, 3, 4, 5, 6]);
    const agents = await (await ethers.getContractFactory('MockBonzaiCompanions')).deploy();
    await agents.mintTo(worker.address);
    await agents.mintTo(worker.address);
    const factory = await (await ethers.getContractFactory('MockSocialTokenFactory')).deploy(await agents.getAddress());
    const social = await (await ethers.getContractFactory('MockSettlementToken')).deploy(18);
    const otherSocial = await (await ethers.getContractFactory('MockSettlementToken')).deploy(6);
    await factory.setToken(1, await social.getAddress());
    await factory.setToken(2, await otherSocial.getAddress());
    const basket = await (await ethers.getContractFactory('BonzaiBasketRewards')).deploy(await vault.getAddress(), await factory.getAddress(), 7 * 86400);
    const router = await (await ethers.getContractFactory('BonzaiRevenueRouter')).deploy(await vault.getAddress(), treasury.address);
    await router.setBasketRewards(await basket.getAddress());
    const escrow = await (await ethers.getContractFactory('BonzaiJobEscrow')).deploy(treasury.address, await router.getAddress());
    await escrow.configureSmartAgentEconomy(await factory.getAddress(), await basket.getAddress());
    const routeSource = ethers.id('job skill royalties');
    await router.registerRoute(routeSource, 'ipfs://terms', [contributor.address], [10000], [0], ['skill']);
    const route = await router.routeIdFor(owner.address, routeSource);
    const job = ethers.id('social job');
    const amount = 1_000_000n;
    for (const token of [social, otherSocial]) {
      await token.mint(employer.address, amount * 10n);
      await token.connect(employer).approve(await escrow.getAddress(), ethers.MaxUint256);
    }
    const fund = (id = job, agentId = 1, routeId = route, workerAddress = worker.address) => escrow.connect(employer).fundTokenJob(id, workerAddress, agentId, amount, ethers.id('quote terms'), routeId, owner.address);
    const submit = async (id = job) => { await escrow.connect(worker).acceptJob(id); await escrow.connect(worker).submitWork(id, ethers.id('delivered result')); };
    return { owner, employer, worker, treasury, contributor, outsider, nextOwner, agents, factory, basket, social, otherSocial, router, escrow, job, route, amount, fund, submit };
  }

  async function conserved(escrow, token) {
    const currency = await token.getAddress();
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(
      await escrow.tokenEscrowed(currency) + await escrow.tokenTotalWithdrawable(currency)
      + await escrow.tokenPendingContributions(currency) + await escrow.pendingBasketFees(currency));
    expect(await escrow.totalEscrowed()).to.equal(0);
  }

  it('requires the exact registered agent currency and verified owner/wallet before taking payment', async function () {
    const { owner, employer, worker, outsider, escrow, job, amount, factory, basket, fund } = await fixture();
    await expect(fund(job, 1, ethers.ZeroHash, outsider.address)).to.be.revertedWith('Worker does not control smart agent');
    await expect(fund(job, 3)).to.be.revertedWith('Smart-agent token not issued');
    await expect(escrow.connect(employer).fundJob(job, worker.address, 1, ethers.id('terms'), ethers.ZeroHash, owner.address, { value: amount })).to.be.revertedWith('Use smart-agent token funding');
    await expect(escrow.configureSmartAgentEconomy(await factory.getAddress(), await basket.getAddress())).to.be.revertedWith('Economy already configured');
    await expect(fund()).to.emit(escrow, 'JobCurrencySelected');
    expect((await escrow.jobs(job)).amount).to.equal(amount);
  });

  it('settles and independently withdraws, routes royalties and funds BONZAI holders in the same token', async function () {
    const { employer, worker, treasury, contributor, social, basket, router, escrow, job, route, fund, submit } = await fixture();
    const currency = await social.getAddress();
    await fund(); await submit(); await escrow.connect(employer).approveWork(job);
    expect(await escrow.jobCurrency(job)).to.equal(currency);
    expect(await escrow.tokenWithdrawable(currency, worker.address)).to.equal(950_000);
    expect(await escrow.tokenWithdrawable(currency, treasury.address)).to.equal(12_500);
    expect(await escrow.pendingBasketFees(currency)).to.equal(0);
    expect(await basket.totalDeposited(currency)).to.equal(12_500);
    expect(await escrow.pendingContributions(job)).to.equal(25_000);
    await conserved(escrow, social);
    await escrow.connect(worker).withdrawTokenPayments(currency, worker.address);
    await escrow.connect(treasury).withdrawTokenPayments(currency, treasury.address);
    await escrow.routeContribution(job);
    expect(await router.tokenClaimable(route, currency, contributor.address)).to.equal(20_000);
    expect(await basket.totalDeposited(currency)).to.equal(15_000); // Platform 12,500 + route bonus 2,500.
    expect(await social.allowance(await escrow.getAddress(), await router.getAddress())).to.equal(0);
    expect(await social.allowance(await escrow.getAddress(), await basket.getAddress())).to.equal(0);
    await conserved(escrow, social);
    await expect(escrow.connect(employer).approveWork(job)).to.be.revertedWith('Cannot approve');
    await expect(escrow.routeBasketFees(currency)).to.be.revertedWith('No basket fees');
  });

  it('isolates liabilities and refunds across different agent currencies and decimal counts', async function () {
    const { employer, worker, social, otherSocial, escrow, job, amount, fund, submit } = await fixture();
    const secondJob = ethers.id('second currency job');
    await fund(); await fund(secondJob, 2, ethers.ZeroHash);
    await submit(); await escrow.connect(employer).approveWork(job);
    await escrow.connect(employer).cancelJob(secondJob);
    expect(await escrow.tokenWithdrawable(await otherSocial.getAddress(), employer.address)).to.equal(amount);
    expect(await escrow.tokenWithdrawable(await social.getAddress(), employer.address)).to.equal(0);
    await escrow.connect(employer).withdrawTokenPayments(await otherSocial.getAddress(), employer.address);
    await expect(escrow.connect(worker).withdrawTokenPayments(await otherSocial.getAddress(), worker.address)).to.be.revertedWith('Nothing to withdraw');
    await conserved(escrow, social); await conserved(escrow, otherSocial);
  });

  it('preserves bounded cancellation, delivery expiry and submitted review expiry in token units', async function () {
    for (const state of ['funded', 'accepted', 'submitted']) {
      const { employer, worker, outsider, social, escrow, job, amount, fund, submit } = await fixture();
      await fund(job, 1, ethers.ZeroHash);
      if (state === 'accepted') await escrow.connect(worker).acceptJob(job);
      if (state === 'submitted') await submit();
      const terms = await escrow.jobTerms(job);
      await time.increaseTo((state === 'funded' ? terms.acceptBy : state === 'accepted' ? terms.deliverBy : terms.reviewBy) + 1n);
      await escrow.connect(outsider).expireJob(job);
      expect(await escrow.tokenWithdrawable(await social.getAddress(), employer.address)).to.equal(state === 'submitted' ? 0 : amount);
      expect(await escrow.tokenWithdrawable(await social.getAddress(), worker.address)).to.equal(state === 'submitted' ? 975_000 : 0);
      await conserved(escrow, social);
    }
  });

  it('preserves agreed arbitration and partial token refunds without charging fees on refunded work', async function () {
    const { owner, employer, worker, nextOwner, social, basket, escrow, job, fund, submit } = await fixture();
    await fund(); await submit();
    await escrow.transferOwnership(nextOwner.address);
    await escrow.connect(employer).raiseDispute(job, ethers.id('incomplete'));
    await expect(escrow.connect(nextOwner).resolveDispute(job, 5000)).to.be.revertedWith('Not job arbitrator');
    await escrow.connect(owner).resolveDispute(job, 4000);
    const currency = await social.getAddress();
    expect(await escrow.tokenWithdrawable(currency, employer.address)).to.equal(600_000);
    expect(await escrow.tokenWithdrawable(currency, worker.address)).to.equal(380_000);
    expect(await escrow.pendingBasketFees(currency)).to.equal(0);
    expect(await basket.totalDeposited(currency)).to.equal(5000);
    expect(await escrow.pendingContributions(job)).to.equal(10_000);
    await conserved(escrow, social);
  });

  it('retains token royalty recovery and worker withdrawals when the router or reward sink fails', async function () {
    const { employer, worker, contributor, social, basket, router, escrow, job, fund, submit } = await fixture();
    const currency = await social.getAddress();
    await fund(); await submit();
    await router.pause(); await basket.setRewardCurrency(currency, false);
    await expect(escrow.connect(employer).approveWork(job)).to.emit(escrow, 'BasketFeeRoutingFailed');
    await expect(escrow.routeContribution(job)).to.emit(escrow, 'ContributionRoutingFailed');
    await expect(escrow.routeBasketFees(currency)).to.be.revertedWith('Basket routing unavailable');
    expect(await escrow.pendingBasketFees(currency)).to.equal(12_500);
    expect(await social.allowance(await escrow.getAddress(), await router.getAddress())).to.equal(0);
    await escrow.connect(worker).withdrawTokenPayments(currency, worker.address);
    await time.increaseTo(await escrow.contributionFallbackAt(job));
    await escrow.distributeContributionFallback(job);
    expect(await escrow.tokenWithdrawable(currency, contributor.address)).to.equal(25_000);
    await basket.setRewardCurrency(currency, true);
    await escrow.routeBasketFees(currency);
    await conserved(escrow, social);
  });

  it('rejects transfer-tax underfunding atomically', async function () {
    const { employer, social, escrow, job, amount, fund } = await fixture();
    await social.setChargeFee(true);
    await expect(fund()).to.be.revertedWith('Unsupported transfer fee');
    expect((await escrow.jobs(job)).status).to.equal(0);
    expect(await social.balanceOf(employer.address)).to.equal(amount * 10n);
    await conserved(escrow, social);
  });

  it('does not accept new jobs in a disabled settlement currency', async function () {
    const { basket, social, fund } = await fixture();
    await basket.setRewardCurrency(await social.getAddress(), false);
    await expect(fund()).to.be.revertedWith('Smart-agent currency unavailable');
  });

  it('rejects a factory registry change that could reinterpret an existing smart-agent ID', async function () {
    const { factory, basket, fund } = await fixture();
    const otherAgents = await (await ethers.getContractFactory('MockBonzaiCompanions')).deploy();
    await factory.setCompanionContract(await otherAgents.getAddress());
    await expect(fund()).to.be.revertedWith('Smart-agent registry changed');
    await expect(basket.registerSocialToken(1)).to.be.revertedWith('Smart-agent registry changed');
  });
});
