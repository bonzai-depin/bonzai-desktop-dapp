const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployContent, deployCompanions, deploySplitter } = require('./helpers/deploy');
const { VALID_SPENDING_PROFILE } = require('./helpers/constants');

describe('Failed protocol fee delivery preserves the original beneficiaries', function () {
  async function collectibleFixture() {
    const f = await deployContent();
    const token = await (await ethers.getContractFactory('MockERC20')).deploy('BONZAI', 'BONZAI');
    const vault = await (await ethers.getContractFactory('BonzaiStakingVault')).deploy(await token.getAddress(), [1, 2, 3, 4, 5, 6]);
    await token.mint(f.owner.address, 6);
    await token.approve(await vault.getAddress(), 6);
    await vault.stake(6, 0);
    await f.factory.setStakingVault(await vault.getAddress());
    // An issuer can control its treasury; failed protocol fees must never come back to it.
    await f.content.setTreasury(f.owner.address);
    return f;
  }

  it('retains a collectible pool allocation even when its issuer also owns the treasury', async function () {
    const { content, factory, mockPool, owner, user1 } = await collectibleFixture();
    const originalPool = await mockPool.getAddress();
    const fee = await content.mintFees(2);
    const poolAmount = fee - fee * await content.treasuryBps() / 10000n;
    await mockPool.setShouldRevert(true);
    await expect(content.mint('cid', 'model', 'ipfs://content', 2, { value: fee }))
      .to.changeEtherBalance(owner, -poolAmount);
    expect(await content.pendingPoolFees(originalPool, 2)).to.equal(poolAmount);
    expect(await content.totalPendingPoolFees()).to.equal(poolAmount);
    await expect(content.withdrawETH()).to.be.revertedWith('No ETH to withdraw');
    await expect(content.connect(user1).retryPoolFees(originalPool, 2)).to.be.revertedWith('MockMintPool: deposit reverted');
    expect(await content.totalPendingPoolFees()).to.equal(poolAmount);
    const replacement = await (await ethers.getContractFactory('MockMintPool')).deploy();
    await factory.setMintPool(await replacement.getAddress());
    await expect(content.retryPoolFees(await replacement.getAddress(), 2)).to.be.revertedWith('No pending pool fees');
    await owner.sendTransaction({ to: await content.getAddress(), value: 1234 });
    await expect(content.withdrawETH()).to.changeEtherBalance(content, -1234);
    expect(await ethers.provider.getBalance(await content.getAddress())).to.equal(poolAmount);
    await mockPool.setShouldRevert(false);
    await expect(content.connect(user1).retryPoolFees(originalPool, 2)).to.changeEtherBalance(mockPool, poolAmount);
    expect(await content.totalPendingPoolFees()).to.equal(0);
    await expect(content.retryPoolFees(originalPool, 2)).to.be.revertedWith('No pending pool fees');
  });

  it('reserves only failed smart-agent mint categories, through configuration changes and recovery', async function () {
    const { companions, owner, treasury, user1, user2 } = await deployCompanions();
    const pool = await (await ethers.getContractFactory('MockMintPool')).deploy();
    const originalPool = await pool.getAddress();
    await companions.setMintPool(originalPool);
    await pool.setPoolShouldRevert(2, true);
    const fee = await companions.mintPrice();
    const perPool = (fee - fee / 2n) / 6n;
    await expect(companions.connect(user1).mintCompanion('ipfs://agent', ethers.id('personality'), VALID_SPENDING_PROFILE, 0, user1.address, { value: fee }))
      .to.changeEtherBalance(treasury, fee - perPool * 6n);
    expect(await companions.totalPendingPoolFees()).to.equal(perPool);
    expect(await ethers.provider.getBalance(await companions.getAddress())).to.equal(perPool);
    expect(await pool.totalDeposits()).to.equal(perPool * 5n);
    await expect(companions.withdrawETH()).to.be.revertedWith('No ETH to withdraw');
    const replacement = await (await ethers.getContractFactory('MockMintPool')).deploy();
    await companions.setMintPool(await replacement.getAddress());
    await pool.setPoolShouldRevert(2, false);
    await expect(companions.connect(user2).retryPoolFees(originalPool, 2)).to.changeEtherBalance(pool, perPool);
    expect(await companions.totalPendingPoolFees()).to.equal(0);
    expect(await replacement.totalDeposits()).to.equal(0);
    await expect(companions.connect(owner).retryPoolFees(originalPool, 2)).to.be.revertedWith('No pending pool fees');
  });

  for (const weighted of [false, true]) {
    it(`keeps ${weighted ? 'weighted' : 'equal'} royalty pool failures separate from creator and treasury balances`, async function () {
      const { splitter, mockPool, owner, treasury, user1 } = await deploySplitter();
      const originalPool = await mockPool.getAddress();
      if (weighted) {
        await mockPool.setTotalDeposited(0, 1);
        await mockPool.setTotalDeposited(2, 1);
      }
      await mockPool.setPoolShouldRevert(2, true);
      const amount = ethers.parseEther('0.03');
      await owner.sendTransaction({ to: await splitter.getAddress(), value: amount });
      const poolShare = amount - (amount / 3n) * 2n;
      const pending = weighted ? poolShare / 2n : poolShare / 6n;
      await expect(splitter.distribute()).to.changeEtherBalance(treasury, amount / 3n);
      expect(await splitter.pendingPoolFees(originalPool, 2)).to.equal(pending);
      expect(await splitter.totalPendingPoolFees()).to.equal(pending);
      expect(await ethers.provider.getBalance(await splitter.getAddress())).to.equal(amount / 3n + pending);
      await expect(splitter.distribute()).to.be.revertedWith('Below minimum distribution amount');
      await expect(splitter.withdrawETH()).to.be.revertedWith('No surplus ETH (creator funds reserved)');
      await splitter.distributeCreatorBatch([user1.address], [amount / 3n]);
      await splitter.connect(user1).claimCreatorRevenue();
      expect(await ethers.provider.getBalance(await splitter.getAddress())).to.equal(pending);
      await expect(splitter.retryPoolFees(originalPool, 2)).to.be.revertedWith('MockMintPool: deposit reverted');
      expect(await splitter.totalPendingPoolFees()).to.equal(pending);
      const replacement = await (await ethers.getContractFactory('MockMintPool')).deploy();
      await splitter.setMintPool(await replacement.getAddress());
      await mockPool.setPoolShouldRevert(2, false);
      await expect(splitter.connect(user1).retryPoolFees(originalPool, 2)).to.changeEtherBalance(mockPool, pending);
      expect(await splitter.totalPendingPoolFees()).to.equal(0);
      expect(await ethers.provider.getBalance(await splitter.getAddress())).to.equal(0);
      expect(await replacement.totalDeposits()).to.equal(0);
    });
  }
});
