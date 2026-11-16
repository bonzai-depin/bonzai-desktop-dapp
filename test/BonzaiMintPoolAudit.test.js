const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time, mine } = require('@nomicfoundation/hardhat-network-helpers');
const { deployMintPool } = require('./helpers/deploy');
const { EPOCH_DURATION, MIN_CLAIM_BLOCK_GAP } = require('./helpers/constants');

describe('MintPool release accounting regressions', function () {
  async function funded() {
    const fixture = await deployMintPool();
    const { mintPool, treasury, user3 } = fixture;
    const accounting = await (await ethers.getContractFactory('MockServiceAccounting')).deploy();
    await mintPool.setServiceTimeContract(await accounting.getAddress());
    fixture.accounting = accounting;
    await mintPool.setContentContract(treasury.address);
    await mintPool.connect(treasury).depositForPool(0, { value: ethers.parseEther('2') });
    return fixture;
  }

  it('starts weekly epochs on Monday UTC', async function () {
    const { mintPool } = await loadFixture(funded);
    const date = new Date(Number(await mintPool.genesisTime()) * 1000);
    expect(date.getUTCDay()).to.equal(1);
    expect(date.getUTCHours()).to.equal(0);
  });

  for (const settle of ['sweepUnclaimed', 'recirculateUnclaimed']) {
    it(`preserves old provider liabilities when governance calls ${settle}`, async function () {
      const { mintPool, treasury, user1, accounting } = await loadFixture(funded);
      await time.increase(EPOCH_DURATION * 20);
      await expect(mintPool[settle](0)).to.be.revertedWith('Earned rewards never expire');
      await mintPool.connect(treasury).depositForPool(0, { value: ethers.parseEther('3') });
      await expect(accounting.withdraw(await mintPool.getAddress(), 0, 0, user1.address, 1, 1))
        .to.changeEtherBalance(user1, ethers.parseEther('1'));
      expect((await mintPool.getEpochProviderDeposits(await mintPool.currentEpoch()))[0]).to.equal(ethers.parseEther('1.5'));
    });
  }

  it('never pays more than an epoch provider allocation', async function () {
    const { mintPool, user1, accounting } = await loadFixture(funded);
    await time.increase(EPOCH_DURATION);
    await accounting.withdraw(await mintPool.getAddress(), 0, 0, user1.address, 1, 1);
    await expect(accounting.withdraw(await mintPool.getAddress(), 0, 0, user1.address, 1, 1))
      .to.be.revertedWith('Provider pool exhausted');
  });

  it('preserves old liabilities and permits withdrawal of only unsolicited surplus', async function () {
    const { mintPool, owner, treasury } = await loadFixture(funded);
    const before = await mintPool.getAllTotalDeposited();
    await time.increase(EPOCH_DURATION * 2);
    await expect(mintPool.recirculateUnclaimed(0)).to.be.revertedWith('Earned rewards never expire');
    expect(await mintPool.getAllTotalDeposited()).to.deep.equal(before);
    await owner.sendTransaction({ to: await mintPool.getAddress(), value: 1234n });
    await expect(mintPool.withdrawETH()).to.changeEtherBalance(treasury, 1234n);
    expect(await ethers.provider.getBalance(await mintPool.getAddress())).to.equal(ethers.parseEther('2'));
    await expect(mintPool.withdrawETH()).to.be.revertedWith('No surplus ETH to withdraw');
  });

  it('does not allow governance to replace trusted accounting or bind an EOA', async function () {
    const { mintPool, user1, accounting } = await loadFixture(funded);
    await expect(mintPool.setServiceTimeContract(user1.address)).to.be.revertedWith('ServiceTime is immutable');
    const other = await (await ethers.getContractFactory('MockServiceAccounting')).deploy();
    await expect(mintPool.setServiceTimeContract(await other.getAddress())).to.be.revertedWith('ServiceTime is immutable');
    await mintPool.setServiceTimeContract(await accounting.getAddress());
  });

  for (const batch of [false, true]) {
    it(`keeps the balance locked through ${batch ? 'batch' : 'single'} settlement`, async function () {
      const { mintPool, token, stakingVault, user1, treasury } = await loadFixture(funded);
      const balance = ethers.parseEther('1000');
      await token.mint(user1.address, balance);
      await token.connect(user1).approve(await stakingVault.getAddress(), balance);
      await stakingVault.connect(user1).stake(balance, 30 * 86400);
      await mintPool.connect(user1).registerForEpoch();
      await mintPool.setCollectiblesFactory(treasury.address);
      await mintPool.connect(treasury).setAuthorizedMinter(treasury.address, true);
      await mintPool.connect(treasury).recordMint(user1.address, 0);
      await time.increase(EPOCH_DURATION);
      await mintPool.connect(user1).confirmClaim(0);
      await mine(MIN_CLAIM_BLOCK_GAP);
      await expect(stakingVault.connect(user1).unstake(balance))
        .to.be.revertedWithCustomError(stakingVault, 'StakeStillLocked');
      const claim = batch ? mintPool.connect(user1).claimEpochBatch(0, [0]) : mintPool.connect(user1).claimEpoch(0, 0);
      await expect(claim).to.changeEtherBalance(user1, ethers.parseEther('1'));
    });
  }

  it('rejects rotating one flexible position through multiple registration wallets', async function () {
    const { mintPool, token, stakingVault, user1, user2 } = await loadFixture(funded);
    const balance = ethers.parseEther('1000');
    await token.mint(user1.address, balance);
    for (const user of [user1, user2]) {
      await token.connect(user).approve(await stakingVault.getAddress(), balance);
      await stakingVault.connect(user).stake(balance, 0);
      await expect(mintPool.connect(user).registerForEpoch()).to.be.revertedWith('Lock must cover claim window');
      await stakingVault.connect(user).unstake(balance);
      if (user === user1) await token.connect(user).transfer(user2.address, balance);
    }
    expect(await mintPool.totalWeightedRegistered(0)).to.equal(0);
  });

  it('requires extending an expiring lock before registering another epoch', async function () {
    const { mintPool, token, stakingVault, user1 } = await loadFixture(funded);
    const balance = ethers.parseEther('1000');
    await token.mint(user1.address, balance);
    await token.connect(user1).approve(await stakingVault.getAddress(), balance);
    await stakingVault.connect(user1).stake(balance, 30 * 86400);
    await time.increase(23 * 86400);
    await expect(mintPool.connect(user1).registerForEpoch()).to.be.revertedWith('Lock must cover claim window');
    await stakingVault.connect(user1).extendLock(30 * 86400);
    await mintPool.connect(user1).registerForEpoch();
    expect(await mintPool.registeredBalances(await mintPool.currentEpoch(), user1.address)).to.equal(balance);
  });

  it('does not let governance replace the balance source after any registration', async function () {
    const { mintPool, token, stakingVault, user1 } = await loadFixture(funded);
    const balance = ethers.parseEther('1000');
    await token.mint(user1.address, balance);
    await token.connect(user1).approve(await stakingVault.getAddress(), balance);
    await stakingVault.connect(user1).stake(balance, 30 * 86400);
    await mintPool.connect(user1).registerForEpoch();
    const vault = await (await ethers.getContractFactory('BonzaiStakingVault')).deploy(await token.getAddress(), [1,2,3,4,5,6]);
    await expect(mintPool.setStakingVault(await vault.getAddress())).to.be.revertedWith('Staking vault is frozen');
    await mintPool.setStakingVault(await stakingVault.getAddress());
  });

  it('requires a vault for the same canonical token and never falls back to liquid holdings', async function () {
    const { token, user1, treasury } = await loadFixture(funded);
    const pool = await (await ethers.getContractFactory('BonzaiMintPool')).deploy(await token.getAddress(), [1,2,3,4,5,6], EPOCH_DURATION, treasury.address);
    await token.mint(user1.address, ethers.parseEther('1000'));
    await expect(pool.connect(user1).registerForEpoch()).to.be.revertedWith('Staking vault not configured');
    const otherToken = await (await ethers.getContractFactory('MockERC20')).deploy('Other', 'OTHER');
    const otherVault = await (await ethers.getContractFactory('BonzaiStakingVault')).deploy(await otherToken.getAddress(), [1,2,3,4,5,6]);
    await expect(pool.setStakingVault(await otherVault.getAddress())).to.be.revertedWith('Wrong staking token');
  });

  it('accepts a lock ending exactly at the claim deadline and permits withdrawal only then', async function () {
    const { token, user1, treasury } = await loadFixture(funded);
    const thresholds = [1000,5000,10000,25000,33000,50000];
    const pool = await (await ethers.getContractFactory('BonzaiMintPool')).deploy(await token.getAddress(), thresholds, 15 * 86400, treasury.address);
    const vault = await (await ethers.getContractFactory('BonzaiStakingVault')).deploy(await token.getAddress(), thresholds.map(n => ethers.parseEther(String(n))));
    await pool.setStakingVault(await vault.getAddress());
    const balance = ethers.parseEther('1000');
    await token.mint(user1.address, balance);
    await token.connect(user1).approve(await vault.getAddress(), balance);
    await time.setNextBlockTimestamp(await pool.genesisTime());
    await vault.connect(user1).stake(balance, 30 * 86400);
    const claimDeadline = await pool.epochEndTime(1);
    expect((await vault.positions(user1.address)).lockedUntil).to.equal(claimDeadline);
    await pool.connect(user1).registerForEpoch();
    await time.setNextBlockTimestamp(claimDeadline - 1n);
    await expect(vault.connect(user1).unstake(balance)).to.be.revertedWithCustomError(vault, 'StakeStillLocked');
    await time.setNextBlockTimestamp(claimDeadline);
    await vault.connect(user1).unstake(balance);
    await expect(pool.connect(user1).confirmClaim(0)).to.emit(pool, 'ClaimConfirmed');
  });
});
