const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('BONZAI LVL currency basket', function () {
  const DAY = 86400;
  const EPOCH = 7 * DAY;
  const units = value => ethers.parseEther(String(value));
  const thresholds = [1000, 5000, 10000, 25000, 33000, 50000].map(units);
  async function fixture() {
    const [owner, alice, bob, payer, treasury, worker, contributor] = await ethers.getSigners();
    const bonzai = await (await ethers.getContractFactory('MockERC20')).deploy('BONZAI', 'BONZAI');
    const vault = await (await ethers.getContractFactory('BonzaiStakingVault')).deploy(await bonzai.getAddress(), thresholds);
    const agents = await (await ethers.getContractFactory('MockBonzaiCompanions')).deploy();
    await agents.mintTo(worker.address);
    const factory = await (await ethers.getContractFactory('MockSocialTokenFactory')).deploy(await agents.getAddress());
    const social = await (await ethers.getContractFactory('MockSettlementToken')).deploy(18);
    const usdc = await (await ethers.getContractFactory('MockSettlementToken')).deploy(6);
    await factory.setToken(1, await social.getAddress());
    const basket = await (await ethers.getContractFactory('BonzaiBasketRewards')).deploy(await vault.getAddress(), await factory.getAddress(), EPOCH);
    await basket.setRewardCurrency(await usdc.getAddress(), true);
    await basket.registerSocialToken(1);
    const router = await (await ethers.getContractFactory('BonzaiRevenueRouter')).deploy(await vault.getAddress(), treasury.address);
    await router.setBasketRewards(await basket.getAddress());
    for (const member of [alice, bob]) {
      await bonzai.mint(member.address, units(100000));
      await bonzai.connect(member).approve(await vault.getAddress(), ethers.MaxUint256);
    }
    for (const token of [social, usdc]) {
      await token.mint(payer.address, units(1000000));
      await token.connect(payer).approve(await basket.getAddress(), ethers.MaxUint256);
      await token.connect(payer).approve(await router.getAddress(), ethers.MaxUint256);
    }
    const startEpoch = async (epoch = 1n) => time.increaseTo(await basket.epochStart(epoch));
    return { owner, alice, bob, payer, treasury, worker, contributor, bonzai, vault, agents, factory, social, usdc, basket, router, startEpoch };
  }

  it('preserves six LVLs while rewarding additional stake in every fee currency without registrations or mints', async function () {
    const { alice, bob, payer, vault, basket, usdc, social, startEpoch } = await fixture();
    await vault.connect(alice).stakeForRewards(units(1500));
    await vault.connect(bob).stakeForRewards(units(3000));
    expect(await vault.utilityTier(alice.address)).to.equal(1);
    expect(await vault.utilityTier(bob.address)).to.equal(1);
    await startEpoch();
    await basket.connect(payer).depositToken(await usdc.getAddress(), 6_000_000);
    await basket.connect(payer).depositToken(await social.getAddress(), units(6));
    await basket.connect(payer).depositNative({ value: units(6) });
    expect(await basket.claimable(alice.address, await usdc.getAddress(), 1)).to.equal(0);
    await startEpoch(2n);
    for (const [currency, tranche] of [[await usdc.getAddress(), 1_000_000n], [await social.getAddress(), units(1)], [ethers.ZeroAddress, units(1)]]) {
      expect(await basket.claimable(alice.address, currency, 1)).to.equal(tranche / 3n);
      expect(await basket.claimable(bob.address, currency, 1)).to.equal(tranche * 2n / 3n);
      await basket.connect(alice).claim(currency, [1], alice.address);
      expect(await basket.claimable(alice.address, currency, 1)).to.equal(0);
      expect(await basket.claimed(currency, 1, alice.address)).to.equal(true);
      await expect(basket.connect(alice).claim(currency, [1], alice.address)).to.be.revertedWith('Nothing to claim');
    }
    expect(await basket.getRewardCurrencies(0, 100)).to.deep.equal([ethers.ZeroAddress, await usdc.getAddress(), await social.getAddress()]);
    expect(await basket.rewardCurrencyCount()).to.equal(3);
  });

  it('LVL 6 participates in all six tranches from a single source and preserves intermediate progression', async function () {
    const { alice, bob, payer, vault, basket, usdc, startEpoch } = await fixture();
    await vault.connect(alice).stakeForRewards(units(50000));
    await vault.connect(bob).stakeForRewards(units(10000));
    await startEpoch();
    await basket.connect(payer).depositToken(await usdc.getAddress(), 36_000_000);
    await startEpoch(2n);
    // LVL1..3 shared 5:1, LVL4..6 solely Alice.
    expect(await basket.claimable(alice.address, await usdc.getAddress(), 1)).to.equal(33_000_000);
    expect(await basket.claimable(bob.address, await usdc.getAddress(), 1)).to.equal(3_000_000);
    await basket.connect(alice).claim(await usdc.getAddress(), [1, 1], alice.address);
    await basket.connect(bob).claim(await usdc.getAddress(), [1], bob.address);
    expect(await usdc.balanceOf(await basket.getAddress())).to.equal(0);
  });

  it('legacy stake stays withdrawable until explicit reward opt-in; exit stops earning and requires 90 days', async function () {
    const { alice, vault, basket, startEpoch } = await fixture();
    await vault.connect(alice).stake(units(5000), 0);
    await vault.connect(alice).unstake(units(1000));
    expect(await vault.rewardActive(alice.address)).to.equal(false);
    await startEpoch();
    const activation = await (await vault.connect(alice).activateRewards()).wait();
    const activatedAt = BigInt((await ethers.provider.getBlock(activation.blockNumber)).timestamp);
    await expect(vault.connect(alice).unstake(1)).to.be.revertedWith('Request reward exit first');
    await time.increase(DAY);
    const exit = await (await vault.connect(alice).requestRewardExit()).wait();
    const exitedAt = BigInt((await ethers.provider.getBlock(exit.blockNumber)).timestamp);
    const exitAt = await vault.rewardExitAt(alice.address);
    expect(exitAt).to.equal(exitedAt + 90n * BigInt(DAY));
    await startEpoch(2n);
    expect(await vault.rewardStakeSeconds(alice.address, 1, await basket.epochStart(1), await basket.epochStart(2))).to.equal(units(4000) * (exitedAt - activatedAt));
    await expect(vault.connect(alice).unstake(1)).to.be.revertedWith('Reward exit pending');
    await time.increaseTo(exitAt);
    await vault.connect(alice).unstake(units(4000));
  });

  it('late entry and exit/reentry accrue only actual committed stake seconds and never rewrite closed epochs', async function () {
    const { alice, bob, payer, vault, basket, usdc, startEpoch } = await fixture();
    await vault.connect(alice).stakeForRewards(units(1000));
    await startEpoch();
    await basket.connect(payer).depositToken(await usdc.getAddress(), 6_000_000);
    const start = await basket.epochStart(1);
    await time.setNextBlockTimestamp(start + BigInt(EPOCH / 2));
    await vault.connect(bob).stakeForRewards(units(1000));
    await time.setNextBlockTimestamp(start + BigInt(EPOCH * 3 / 4));
    await vault.connect(bob).requestRewardExit();
    await startEpoch(2n);
    expect(await vault.rewardStakeSeconds(bob.address, 1, start, start + BigInt(EPOCH))).to.equal(units(1000) * BigInt(EPOCH / 4));
    expect(await basket.claimable(bob.address, await usdc.getAddress(), 1)).to.equal(200_000);
    await vault.connect(bob).activateRewards();
    await vault.connect(bob).stake(units(4000), 0);
    expect(await basket.claimable(bob.address, await usdc.getAddress(), 1)).to.equal(200_000);
    await expect(vault.setUtilityTierThreshold(1, units(900))).to.be.revertedWith('Reward thresholds frozen');
    await expect(vault.connect(bob).unstake(1)).to.be.revertedWith('Request reward exit first');
  });

  it('preserves original longer locks when opting in and exiting', async function () {
    const { alice, vault } = await fixture();
    await vault.connect(alice).stake(units(1000), 365 * DAY);
    const original = (await vault.positions(alice.address)).lockedUntil;
    await vault.connect(alice).activateRewards();
    await vault.connect(alice).requestRewardExit();
    expect(await vault.rewardExitAt(alice.address)).to.equal(original);
  });

  it('conserves each LVL denominator through mature partial withdrawals, reactivation and top-ups', async function () {
    const { alice, bob, payer, vault, basket, usdc, startEpoch } = await fixture();
    await vault.connect(alice).stakeForRewards(units(50000));
    await vault.connect(bob).stakeForRewards(units(10000));
    await startEpoch();
    await basket.connect(payer).depositToken(await usdc.getAddress(), 36_000_000);
    await startEpoch(2n);
    const earned = await basket.claimable(alice.address, await usdc.getAddress(), 1);
    await vault.connect(alice).requestRewardExit();
    await time.increaseTo(await vault.rewardExitAt(alice.address));
    await vault.connect(alice).unstake(units(45000));
    expect(await vault.utilityTier(alice.address)).to.equal(2);
    await vault.connect(alice).activateRewards();
    await vault.connect(bob).stake(units(30000), 0);
    await time.increase(DAY);
    await vault.connect(alice).requestRewardExit();
    await time.increase(DAY);
    const end = BigInt(await time.latest());
    const start = await basket.epochStart(0);
    for (let level = 1; level <= 6; level++) {
      const sum = await vault.rewardStakeSeconds(alice.address, level, start, end)
        + await vault.rewardStakeSeconds(bob.address, level, start, end);
      expect(await vault.totalRewardStakeSeconds(level, start, end)).to.equal(sum);
    }
    expect(await basket.claimable(alice.address, await usdc.getAddress(), 1)).to.equal(earned);
    await basket.connect(alice).claim(await usdc.getAddress(), [1], alice.address);
    expect(await usdc.balanceOf(alice.address)).to.equal(earned);
  });

  it('rolls only genuinely unowned tranches, without confiscating earned claims', async function () {
    const { alice, payer, vault, basket, usdc, startEpoch } = await fixture();
    await vault.connect(alice).stakeForRewards(units(1000));
    await startEpoch();
    await basket.connect(payer).depositToken(await usdc.getAddress(), 6_000_000);
    await startEpoch(2n);
    await expect(basket.rollEmptyTranche(await usdc.getAddress(), 1, 1)).to.be.revertedWith('Tranche has members');
    await basket.rollEmptyTranche(await usdc.getAddress(), 1, 2);
    expect((await basket.getEpochRewards(await usdc.getAddress(), 2))[1]).to.equal(1_000_000);
    await expect(basket.rollEmptyTranche(await usdc.getAddress(), 1, 2)).to.be.revertedWith('Already rolled');
    await time.increase(400 * DAY);
    await basket.connect(alice).claim(await usdc.getAddress(), [1], alice.address);
    expect(await usdc.balanceOf(alice.address)).to.equal(1_000_000);
  });

  it('rejects unverified currencies and transfer-tax insolvency, preserving claims if new deposits are disabled', async function () {
    const { alice, payer, vault, basket, usdc, factory, startEpoch } = await fixture();
    await expect(basket.registerSocialToken(2)).to.be.revertedWith('Agent token not issued');
    await vault.connect(alice).stakeForRewards(units(50000));
    await startEpoch();
    await usdc.setChargeFee(true);
    await expect(basket.connect(payer).depositToken(await usdc.getAddress(), 600)).to.be.revertedWith('Unsupported transfer fee');
    expect(await basket.totalDeposited(await usdc.getAddress())).to.equal(0);
    await usdc.setChargeFee(false);
    await basket.connect(payer).depositToken(await usdc.getAddress(), 600);
    await basket.setRewardCurrency(await usdc.getAddress(), false);
    await factory.setToken(2, await usdc.getAddress());
    await basket.registerSocialToken(2);
    expect(await basket.rewardCurrencyEnabled(await usdc.getAddress())).to.equal(false);
    await startEpoch(2n);
    await basket.connect(alice).claim(await usdc.getAddress(), [1], alice.address);
    expect(await usdc.balanceOf(alice.address)).to.equal(600);
  });

  it('routes native and USDC contributions to the common LVL basket while conserving creator royalties', async function () {
    const { alice, payer, treasury, contributor, basket, router, usdc } = await fixture();
    const source = ethers.id('a paid smart-agent skill');
    await router.connect(alice).registerRoute(source, 'ipfs://terms', [contributor.address], [10000], [0], ['skill creator']);
    const route = await router.routeIdFor(alice.address, source);
    await router.connect(payer).depositTokenRevenue(route, await usdc.getAddress(), 10000);
    expect(await router.tokenClaimable(route, await usdc.getAddress(), contributor.address)).to.equal(8000);
    expect(await router.tokenTreasuryClaimable(await usdc.getAddress(), treasury.address)).to.equal(1000);
    expect(await basket.totalDeposited(await usdc.getAddress())).to.equal(1000);
    await router.connect(contributor).claimToken(route, await usdc.getAddress(), contributor.address);
    await router.connect(treasury).claimTokenTreasury(await usdc.getAddress(), treasury.address);
    expect(await usdc.balanceOf(await router.getAddress())).to.equal(0);
    await router.connect(payer).depositRevenue(route, { value: 10000 });
    expect(await router.claimable(route, contributor.address)).to.equal(8000);
    expect(await basket.totalDeposited(ethers.ZeroAddress)).to.equal(1000);
  });

  it('forwards only new MintPool holder slices, preserving providers and historical claims', async function () {
    const { owner, treasury, bonzai, vault, basket } = await fixture();
    const pool = await (await ethers.getContractFactory('BonzaiMintPool')).deploy(await bonzai.getAddress(), [1000, 5000, 10000, 25000, 33000, 50000], EPOCH, treasury.address);
    await pool.setStakingVault(await vault.getAddress());
    await pool.setContentContract(owner.address);
    await time.increaseTo(await pool.genesisTime());
    await pool.depositForPool(0, { value: 10000 });
    await pool.setBasketRewards(await basket.getAddress());
    await pool.depositForPool(5, { value: 10000, gasLimit: 1_000_000 });
    expect(await pool.pendingBasketRewards()).to.equal(0);
    expect((await pool.getEpochProviderDeposits(0))[0]).to.equal(5000);
    expect((await pool.getEpochProviderDeposits(0))[5]).to.equal(5000);
    expect(await basket.totalDeposited(ethers.ZeroAddress)).to.equal(5000);
    expect(await ethers.provider.getBalance(await pool.getAddress())).to.equal(15000);
    await expect(pool.withdrawETH()).to.be.revertedWith('No surplus ETH to withdraw');
    await basket.setRewardCurrency(ethers.ZeroAddress, false);
    await expect(pool.depositForPool(0, { value: 10000 })).to.emit(pool, 'BasketRewardForwardingFailed');
    expect(await pool.pendingBasketRewards()).to.equal(5000);
    await expect(pool.withdrawETH()).to.be.revertedWith('No surplus ETH to withdraw');
    await basket.setRewardCurrency(ethers.ZeroAddress, true);
    await pool.forwardBasketRewards();
    expect(await pool.pendingBasketRewards()).to.equal(0);
    expect(await basket.totalDeposited(ethers.ZeroAddress)).to.equal(10000);
    // A low-gas upstream mint must preserve both liabilities, not revert into
    // its historical catch-to-treasury path.
    await pool.depositForPool(0, { value: 10000, gasLimit: 200_000 });
    expect(await pool.pendingBasketRewards()).to.equal(5000);
    expect((await pool.getEpochProviderDeposits(0))[0]).to.equal(15000);
    await pool.forwardBasketRewards();
    expect(await basket.totalDeposited(ethers.ZeroAddress)).to.equal(15000);
  });

  it('native royalty rounding cannot reward a zero-share recipient', async function () {
    const { alice, bob, contributor, payer, router } = await fixture();
    const source = ethers.id('rounding');
    await router.connect(alice).registerRoute(source, 'ipfs://terms', [alice.address, contributor.address, bob.address], [3333, 6667, 0], [0, 0, 0], ['a', 'b', 'none']);
    const route = await router.routeIdFor(alice.address, source);
    await router.connect(payer).depositRevenue(route, { value: 101 });
    expect(await router.claimable(route, bob.address)).to.equal(0);
    expect(await router.claimable(route, alice.address) + await router.claimable(route, contributor.address)).to.equal(81);
  });
});
