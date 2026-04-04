const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");
const {
  MINT_FEE,
  MINT_FEES_BY_TYPE,
  EPOCH_DURATION,
  POOL_THRESHOLDS,
  MIN_CLAIM_BLOCK_GAP,
  TREASURY_BPS,
  POOL_BPS,
  BPS_DENOMINATOR,
  CONTENT_TYPE,
  NUM_POOLS,
} = require("./helpers/constants");

describe("Integration Tests", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED FIXTURE
  // ═══════════════════════════════════════════════════════════════════════════

  async function deployIntegration() {
    const [owner, treasury, user1, user2] = await ethers.getSigners();

    // Deploy BONZAI token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const bonzaiToken = await MockERC20.deploy("BONZAI", "BONZAI");

    // Deploy MintPool
    const BonzaiMintPool = await ethers.getContractFactory("BonzaiMintPool");
    const mintPool = await BonzaiMintPool.deploy(
      await bonzaiToken.getAddress(),
      POOL_THRESHOLDS,
      EPOCH_DURATION,
      treasury.address
    );

    // Advance time to genesis (next Monday 00:00 UTC)
    const genesis = await mintPool.genesisTime();
    await time.increaseTo(genesis);

    // Deploy BonzaiCollectibles (implementation + factory)
    const BonzaiCollectibles = await ethers.getContractFactory("BonzaiCollectibles");
    const implementation = await BonzaiCollectibles.deploy();

    const BonzaiCollectiblesFactory = await ethers.getContractFactory("BonzaiCollectiblesFactory");
    const factory = await BonzaiCollectiblesFactory.deploy(
      await implementation.getAddress(),
      treasury.address,
      await mintPool.getAddress(),
      ethers.ZeroAddress // royaltySplitter — set after splitter is deployed
    );

    // Authorize factory on MintPool so it can register clones as authorized minters
    await mintPool.setCollectiblesFactory(await factory.getAddress());

    // Create collections for test users
    await factory.connect(user1).getOrCreateCollection("User1 Collection");
    await factory.connect(user2).getOrCreateCollection("User2 Collection");
    const content1Addr = await factory.collections(user1.address);
    const content2Addr = await factory.collections(user2.address);
    const content = BonzaiCollectibles.attach(content1Addr);
    const content2 = BonzaiCollectibles.attach(content2Addr);

    // Deploy Splitter
    const BonzaiRoyaltySplitter = await ethers.getContractFactory("BonzaiRoyaltySplitter");
    const splitter = await BonzaiRoyaltySplitter.deploy(
      treasury.address,
      await mintPool.getAddress()
    );

    // Authorize depositors on MintPool
    await mintPool.setRoyaltySplitter(await splitter.getAddress());

    // Deploy companion NFT and wire into MintPool (required for claiming)
    const MockBonzaiCompanions = await ethers.getContractFactory("MockBonzaiCompanions");
    const companionNFT = await MockBonzaiCompanions.deploy();
    await mintPool.setCompanionNFT(await companionNFT.getAddress());

    // Mint BONZAI tokens to users
    await bonzaiToken.mint(user1.address, ethers.parseEther("50000"));
    await bonzaiToken.mint(user2.address, ethers.parseEther("10000"));

    // Mint companion NFTs to users (required for claiming rewards)
    await companionNFT.mintTo(user1.address);
    await companionNFT.mintTo(user2.address);

    return { bonzaiToken, mintPool, companionNFT, content, content2, factory, splitter, owner, treasury, user1, user2 };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Mint a content NFT with default parameters */
  async function mintContent(content, signer, contentType = CONTENT_TYPE.IMAGE) {
    const fee = MINT_FEES_BY_TYPE[contentType];
    return content.connect(signer).mint(
      "irys-tx-" + Date.now(),
      "test-model",
      "https://gateway.irys.xyz/test",
      contentType,
      { value: fee }
    );
  }

  /** Send ETH directly to the splitter contract */
  async function fundSplitter(signer, splitter, amount) {
    const addr = await splitter.getAddress();
    await signer.sendTransaction({ to: addr, value: amount });
  }

  /** Calculate expected pool deposit from a single mint */
  function expectedPoolAmount(contentType = CONTENT_TYPE.IMAGE) {
    const fee = MINT_FEES_BY_TYPE[contentType];
    const treasuryAmt = (fee * TREASURY_BPS) / BPS_DENOMINATOR;
    return fee - treasuryAmt;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CONTENT -> MINTPOOL FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  describe("1. Content -> MintPool Flow", function () {
    it("should split mint fee 80/20 with 20% deposited into MintPool", async function () {
      const { content, mintPool, treasury, user1 } = await loadFixture(deployIntegration);

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      const poolBefore = await ethers.provider.getBalance(await mintPool.getAddress());

      await mintContent(content, user1, CONTENT_TYPE.IMAGE);

      const treasuryAfter = await ethers.provider.getBalance(treasury.address);
      const poolAfter = await ethers.provider.getBalance(await mintPool.getAddress());

      const imageFee = MINT_FEES_BY_TYPE[CONTENT_TYPE.IMAGE];
      const expectedTreasury = (imageFee * TREASURY_BPS) / BPS_DENOMINATOR;
      const expectedPool = imageFee - expectedTreasury;

      expect(treasuryAfter - treasuryBefore).to.equal(expectedTreasury);
      expect(poolAfter - poolBefore).to.equal(expectedPool);

      // Verify pool deposit is tracked in correct pool index
      const deposits = await mintPool.getEpochDeposits(0);
      expect(deposits[CONTENT_TYPE.IMAGE]).to.equal(expectedPool);
    });

    it("should route multiple mints of different content types to separate pools", async function () {
      const { content, content2, mintPool, user1, user2 } = await loadFixture(deployIntegration);

      // Mint text content (user1's collection)
      await mintContent(content, user1, CONTENT_TYPE.TEXT);
      // Mint audio content (user2's collection)
      await mintContent(content2, user2, CONTENT_TYPE.AUDIO);
      // Mint video content (user1's collection)
      await mintContent(content, user1, CONTENT_TYPE.VIDEO);

      const deposits = await mintPool.getEpochDeposits(0);

      expect(deposits[CONTENT_TYPE.TEXT]).to.equal(expectedPoolAmount(CONTENT_TYPE.TEXT));
      expect(deposits[CONTENT_TYPE.AUDIO]).to.equal(expectedPoolAmount(CONTENT_TYPE.AUDIO));
      expect(deposits[CONTENT_TYPE.VIDEO]).to.equal(expectedPoolAmount(CONTENT_TYPE.VIDEO));
      // Unused pools should be zero
      expect(deposits[CONTENT_TYPE.IMAGE]).to.equal(0);
      expect(deposits[CONTENT_TYPE.THREE_D]).to.equal(0);
      expect(deposits[CONTENT_TYPE.TRAINING]).to.equal(0);

      // Lifetime totals
      const totals = await mintPool.getAllTotalDeposited();
      expect(totals[CONTENT_TYPE.TEXT]).to.equal(expectedPoolAmount(CONTENT_TYPE.TEXT));
      expect(totals[CONTENT_TYPE.AUDIO]).to.equal(expectedPoolAmount(CONTENT_TYPE.AUDIO));
      expect(totals[CONTENT_TYPE.VIDEO]).to.equal(expectedPoolAmount(CONTENT_TYPE.VIDEO));
    });

    it("should fallback pool share to treasury when pool reverts", async function () {
      const { treasury, user1 } = await loadFixture(deployIntegration);

      // Deploy ETHRejector (reverts on all calls including depositForPool)
      const ETHRejector = await ethers.getContractFactory("ETHRejector");
      const rejector = await ETHRejector.deploy();

      // Create factory with no pool (so getOrCreateCollection won't call setAuthorizedMinter)
      const BonzaiCollectibles = await ethers.getContractFactory("BonzaiCollectibles");
      const badImpl = await BonzaiCollectibles.deploy();

      const BonzaiCollectiblesFactory = await ethers.getContractFactory("BonzaiCollectiblesFactory");
      const badFactory = await BonzaiCollectiblesFactory.deploy(
        await badImpl.getAddress(),
        treasury.address,
        ethers.ZeroAddress, // no pool during clone creation
        ethers.ZeroAddress
      );

      await badFactory.connect(user1).getOrCreateCollection("Bad Collection");
      const badCloneAddr = await badFactory.collections(user1.address);
      const badContent = BonzaiCollectibles.attach(badCloneAddr);

      // Now set the rejector as mintPool on the clone (owner = user1)
      await badContent.connect(user1).setMintPool(await rejector.getAddress());

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);

      const imageFee = MINT_FEES_BY_TYPE[CONTENT_TYPE.IMAGE];
      await badContent.connect(user1).mint(
        "irys-bad", "model", "uri", CONTENT_TYPE.IMAGE, { value: imageFee }
      );

      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      // Treasury should receive the full fee (80% treasury + 20% fallback)
      expect(treasuryAfter - treasuryBefore).to.equal(imageFee);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ROYALTYSPLITTER -> MINTPOOL FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  describe("2. RoyaltySplitter -> MintPool Flow", function () {
    it("should distribute 2/3 to treasury and 1/3 to MintPool pools", async function () {
      const { splitter, mintPool, treasury, owner } = await loadFixture(deployIntegration);

      const amount = ethers.parseEther("0.03");
      await fundSplitter(owner, splitter, amount);

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      const poolBefore = await ethers.provider.getBalance(await mintPool.getAddress());

      await splitter.distribute();

      const treasuryAfter = await ethers.provider.getBalance(treasury.address);
      const poolAfter = await ethers.provider.getBalance(await mintPool.getAddress());

      const treasuryShare = (amount * 2n) / 3n;
      const poolShare = amount - treasuryShare;

      expect(treasuryAfter - treasuryBefore).to.equal(treasuryShare);
      expect(poolAfter - poolBefore).to.equal(poolShare);
    });

    it("should weight royalty distribution by content mint history", async function () {
      const { content, splitter, mintPool, treasury, owner, user1 } =
        await loadFixture(deployIntegration);

      const imagePoolAmt = expectedPoolAmount(CONTENT_TYPE.IMAGE);
      const textPoolAmt = expectedPoolAmount(CONTENT_TYPE.TEXT);

      // Create pool history: 3 image mints, 1 text mint
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);
      await mintContent(content, user1, CONTENT_TYPE.TEXT);

      // Now send royalty ETH and distribute
      const royaltyAmount = ethers.parseEther("0.12");
      await fundSplitter(owner, splitter, royaltyAmount);

      const poolBalanceBefore = await ethers.provider.getBalance(await mintPool.getAddress());

      await splitter.distribute();

      const poolBalanceAfter = await ethers.provider.getBalance(await mintPool.getAddress());

      const poolShare = royaltyAmount - (royaltyAmount * 2n) / 3n;

      // Total deposited: image = 3 * imagePoolAmt, text = 1 * textPoolAmt
      const imageTotal = imagePoolAmt * 3n;
      const totalDeposited = imageTotal + textPoolAmt;
      // Royalty weighted by deposited share
      const imageRoyalty = (poolShare * imageTotal) / totalDeposited;
      const textRoyalty = (poolShare * textPoolAmt) / totalDeposited;

      // Check that epoch deposits reflect the royalty distribution
      // The MintPool epoch deposits already contain the content mint deposits,
      // plus the new royalty deposits
      const deposits = await mintPool.getEpochDeposits(0);

      // Content mint deposits + royalty deposits
      expect(deposits[CONTENT_TYPE.IMAGE]).to.equal(imageTotal + imageRoyalty);
      expect(deposits[CONTENT_TYPE.TEXT]).to.equal(textPoolAmt + textRoyalty);

      // Net ETH increase to the pool should equal the poolShare (minus rounding dust to treasury)
      const netPoolIncrease = poolBalanceAfter - poolBalanceBefore;
      // May differ from poolShare by rounding dust
      expect(netPoolIncrease).to.be.lte(poolShare);
      expect(netPoolIncrease).to.be.gte(poolShare - 5n); // at most 5 wei rounding dust
    });

    it("should distribute equally when no pool history exists", async function () {
      const { splitter, mintPool, owner } = await loadFixture(deployIntegration);

      // No content mints yet, so no pool history
      const amount = ethers.parseEther("0.03");
      await fundSplitter(owner, splitter, amount);

      await splitter.distribute();

      const poolShare = amount - (amount * 2n) / 3n;
      const perPool = poolShare / 6n;

      const deposits = await mintPool.getEpochDeposits(0);

      // First 5 pools get perPool
      for (let i = 0; i < 5; i++) {
        expect(deposits[i]).to.equal(perPool);
      }
      // Last pool gets remainder
      const lastPoolExpected = poolShare - perPool * 5n;
      expect(deposits[5]).to.equal(lastPoolExpected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. FULL EPOCH LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("3. Full Epoch Lifecycle", function () {
    it("should allow register -> deposit -> advance -> confirmClaim -> mine -> claimEpoch", async function () {
      const { content, mintPool, bonzaiToken, user1 } =
        await loadFixture(deployIntegration);

      // 1. User registers for epoch 0
      await mintPool.connect(user1).registerForEpoch();
      expect(await mintPool.isRegistered(0, user1.address)).to.be.true;

      // 2. Content mint deposits ETH to pool
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);

      const poolAmt = expectedPoolAmount();
      const deposits = await mintPool.getEpochDeposits(0);
      expect(deposits[CONTENT_TYPE.IMAGE]).to.equal(poolAmt);

      // 3. Advance to epoch 1
      await time.increase(EPOCH_DURATION);
      expect(await mintPool.currentEpoch()).to.equal(1);
      expect(await mintPool.isEpochFinalized(0)).to.be.true;

      // 4. Confirm claim
      await mintPool.connect(user1).confirmClaim(0);

      // 5. Mine 256 blocks
      await mine(MIN_CLAIM_BLOCK_GAP);

      // 6. Claim epoch 0, pool IMAGE
      const user1Before = await ethers.provider.getBalance(user1.address);
      const tx = await mintPool.connect(user1).claimEpoch(0, CONTENT_TYPE.IMAGE);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const user1After = await ethers.provider.getBalance(user1.address);

      // user1 is the only registrant, so gets 100% of the pool
      expect(user1After - user1Before + gasCost).to.equal(poolAmt);

      // Verify hasClaimed
      expect(await mintPool.hasClaimed(0, user1.address, CONTENT_TYPE.IMAGE)).to.be.true;
      expect(await mintPool.totalClaimed()).to.equal(poolAmt);
    });

    it("should distribute proportionally when two users register with different balances", async function () {
      const { content, content2, mintPool, bonzaiToken, user1, user2 } =
        await loadFixture(deployIntegration);

      // user1 has 50000 BONZAI, user2 has 10000 BONZAI

      // Both register for epoch 0
      await mintPool.connect(user1).registerForEpoch();
      await mintPool.connect(user2).registerForEpoch();

      // Deposit via content mint (user1's collection)
      await mintContent(content, user1, CONTENT_TYPE.TEXT);

      const poolAmt = expectedPoolAmount(CONTENT_TYPE.TEXT);

      // Advance epoch
      await time.increase(EPOCH_DURATION);

      // Both confirm
      await mintPool.connect(user1).confirmClaim(0);
      await mintPool.connect(user2).confirmClaim(0);

      // Mine blocks
      await mine(MIN_CLAIM_BLOCK_GAP);

      // user1: 50000 / (50000 + 10000) = 5/6 of pool
      // user2: 10000 / (50000 + 10000) = 1/6 of pool
      const user1Balance = ethers.parseEther("50000");
      const user2Balance = ethers.parseEther("10000");
      const totalRegistered = user1Balance + user2Balance;

      const user1Share = (poolAmt * user1Balance) / totalRegistered;
      const user2Share = (poolAmt * user2Balance) / totalRegistered;

      // user1 claims
      const u1Before = await ethers.provider.getBalance(user1.address);
      const tx1 = await mintPool.connect(user1).claimEpoch(0, CONTENT_TYPE.TEXT);
      const r1 = await tx1.wait();
      const u1After = await ethers.provider.getBalance(user1.address);
      expect(u1After - u1Before + r1.gasUsed * r1.gasPrice).to.equal(user1Share);

      // user2 claims
      const u2Before = await ethers.provider.getBalance(user2.address);
      const tx2 = await mintPool.connect(user2).claimEpoch(0, CONTENT_TYPE.TEXT);
      const r2 = await tx2.wait();
      const u2After = await ethers.provider.getBalance(user2.address);
      expect(u2After - u2Before + r2.gasUsed * r2.gasPrice).to.equal(user2Share);
    });

    it("should batch claim across multiple pools in a single transaction", async function () {
      const { content, mintPool, user1 } = await loadFixture(deployIntegration);

      // Register
      await mintPool.connect(user1).registerForEpoch();

      // Deposit into multiple pools
      await mintContent(content, user1, CONTENT_TYPE.TEXT);
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);
      await mintContent(content, user1, CONTENT_TYPE.VIDEO);

      const poolAmt = expectedPoolAmount();

      // Advance epoch
      await time.increase(EPOCH_DURATION);

      // Confirm + mine
      await mintPool.connect(user1).confirmClaim(0);
      await mine(MIN_CLAIM_BLOCK_GAP);

      // Batch claim all three pools
      const u1Before = await ethers.provider.getBalance(user1.address);
      const tx = await mintPool.connect(user1).claimEpochBatch(
        0,
        [CONTENT_TYPE.TEXT, CONTENT_TYPE.IMAGE, CONTENT_TYPE.VIDEO]
      );
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const u1After = await ethers.provider.getBalance(user1.address);

      // user1 is the only registrant, gets 100% of each pool
      const totalClaim = poolAmt * 3n;
      expect(u1After - u1Before + gasCost).to.equal(totalClaim);

      // Verify all three are marked claimed
      expect(await mintPool.hasClaimed(0, user1.address, CONTENT_TYPE.TEXT)).to.be.true;
      expect(await mintPool.hasClaimed(0, user1.address, CONTENT_TYPE.IMAGE)).to.be.true;
      expect(await mintPool.hasClaimed(0, user1.address, CONTENT_TYPE.VIDEO)).to.be.true;
    });

    it("should sweep unclaimed funds to treasury after epoch N+2", async function () {
      const { content, mintPool, owner, treasury, user1 } = await loadFixture(deployIntegration);

      // Register and deposit in epoch 0
      await mintPool.connect(user1).registerForEpoch();
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);

      const poolAmt = expectedPoolAmount();

      // Advance to epoch 2 (skip the claim window)
      await time.increase(EPOCH_DURATION * 2);
      expect(await mintPool.currentEpoch()).to.equal(2);

      // Owner sweeps unclaimed from epoch 0 — funds go to treasury
      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await mintPool.sweepUnclaimed(0);
      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      expect(treasuryAfter - treasuryBefore).to.equal(poolAmt);
      expect(await mintPool.totalSwept()).to.equal(poolAmt);
      expect(await mintPool.epochSwept(0)).to.be.true;
    });

    it("should revert claim when user balance drops below registered amount", async function () {
      const { content2, mintPool, bonzaiToken, user2, user1 } =
        await loadFixture(deployIntegration);

      // user2 has 10000 BONZAI, registers
      await mintPool.connect(user2).registerForEpoch();
      await mintContent(content2, user2, CONTENT_TYPE.TEXT);

      // Advance epoch
      await time.increase(EPOCH_DURATION);

      // user2 sells all tokens (transfers away to user1)
      await bonzaiToken.connect(user2).transfer(
        user1.address,
        ethers.parseEther("10000")
      );

      // Confirm should fail because balance dropped
      await expect(
        mintPool.connect(user2).confirmClaim(0)
      ).to.be.revertedWith("Balance dropped below registered amount");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. MULTI-EPOCH FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  describe("4. Multi-Epoch Flow", function () {
    it("should support claim in epoch 1 + new deposits + register -> claim in epoch 2", async function () {
      const { content, mintPool, bonzaiToken, user1 } =
        await loadFixture(deployIntegration);

      const imagePool = expectedPoolAmount(CONTENT_TYPE.IMAGE);
      const textPool = expectedPoolAmount(CONTENT_TYPE.TEXT);
      const audioPool = expectedPoolAmount(CONTENT_TYPE.AUDIO);

      // ── Epoch 0 ──
      await mintPool.connect(user1).registerForEpoch();
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);

      // Advance to epoch 1
      await time.increase(EPOCH_DURATION);
      expect(await mintPool.currentEpoch()).to.equal(1);

      // Claim epoch 0
      await mintPool.connect(user1).confirmClaim(0);
      await mine(MIN_CLAIM_BLOCK_GAP);
      await mintPool.connect(user1).claimEpoch(0, CONTENT_TYPE.IMAGE);
      expect(await mintPool.totalClaimed()).to.equal(imagePool);

      // ── Epoch 1 ── (register + deposit within epoch 1)
      await mintPool.connect(user1).registerForEpoch();
      await mintContent(content, user1, CONTENT_TYPE.TEXT);
      await mintContent(content, user1, CONTENT_TYPE.AUDIO);

      // Advance to epoch 2
      await time.increase(EPOCH_DURATION);
      expect(await mintPool.currentEpoch()).to.equal(2);

      // Claim epoch 1
      await mintPool.connect(user1).confirmClaim(1);
      await mine(MIN_CLAIM_BLOCK_GAP);

      // Batch claim both pools from epoch 1
      await mintPool.connect(user1).claimEpochBatch(1, [CONTENT_TYPE.TEXT, CONTENT_TYPE.AUDIO]);

      // Total claimed = epoch0 claim + epoch1 claims
      expect(await mintPool.totalClaimed()).to.equal(imagePool + textPool + audioPool);
    });

    it("should maintain correct totalClaimed, totalDeposited, totalSwept across epochs", async function () {
      const { content, content2, mintPool, bonzaiToken, owner, user1, user2 } =
        await loadFixture(deployIntegration);

      const imagePool = expectedPoolAmount(CONTENT_TYPE.IMAGE);
      const textPool = expectedPoolAmount(CONTENT_TYPE.TEXT);
      const audioPool = expectedPoolAmount(CONTENT_TYPE.AUDIO);

      // ── Epoch 0 ──
      // user1 registers and we deposit
      await mintPool.connect(user1).registerForEpoch();
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);
      await mintContent(content, user1, CONTENT_TYPE.TEXT);

      // Advance to epoch 1
      await time.increase(EPOCH_DURATION);

      // user1 claims IMAGE but not TEXT from epoch 0
      await mintPool.connect(user1).confirmClaim(0);
      await mine(MIN_CLAIM_BLOCK_GAP);
      await mintPool.connect(user1).claimEpoch(0, CONTENT_TYPE.IMAGE);

      // ── Epoch 1 ──
      // user2 registers and deposits (AUDIO=pool 1, user2 has 10K which qualifies for pool 1=5K threshold)
      await mintPool.connect(user2).registerForEpoch();
      await mintContent(content2, user2, CONTENT_TYPE.AUDIO);

      // Advance to epoch 2 (epoch 0 claim window closes, epoch 1 claim window opens)
      await time.increase(EPOCH_DURATION);

      // Sweep unclaimed TEXT from epoch 0
      await mintPool.sweepUnclaimed(0);

      // user2 claims AUDIO from epoch 1
      await mintPool.connect(user2).confirmClaim(1);
      await mine(MIN_CLAIM_BLOCK_GAP);
      await mintPool.connect(user2).claimEpoch(1, CONTENT_TYPE.AUDIO);

      // Verify accounting
      const totals = await mintPool.getAllTotalDeposited();
      expect(totals[CONTENT_TYPE.IMAGE]).to.equal(imagePool);
      expect(totals[CONTENT_TYPE.TEXT]).to.equal(textPool);
      expect(totals[CONTENT_TYPE.AUDIO]).to.equal(audioPool);

      // totalClaimed: IMAGE (epoch 0, user1) + AUDIO (epoch 1, user2)
      expect(await mintPool.totalClaimed()).to.equal(imagePool + audioPool);

      // totalSwept: TEXT from epoch 0
      expect(await mintPool.totalSwept()).to.equal(textPool);

      // All deposited ETH is accounted for
      const totalDepositedAll = imagePool + textPool + audioPool;
      const totalClaimed = await mintPool.totalClaimed();
      const totalSwept = await mintPool.totalSwept();
      expect(totalClaimed + totalSwept).to.equal(totalDepositedAll);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. CROSS-CONTRACT ACCOUNTING
  // ═══════════════════════════════════════════════════════════════════════════

  describe("5. Cross-Contract Accounting", function () {
    it("should balance content mints + royalty distributions + claims with no ETH stuck", async function () {
      const { content, content2, mintPool, splitter, bonzaiToken, owner, treasury, user1, user2 } =
        await loadFixture(deployIntegration);

      // ── Epoch 0: Content mints + royalty distribution ──
      await mintPool.connect(user1).registerForEpoch();
      await mintPool.connect(user2).registerForEpoch();

      // 3 content mints (user1 on their collection, user2 on theirs)
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);
      await mintContent(content, user1, CONTENT_TYPE.TEXT);
      await mintContent(content2, user2, CONTENT_TYPE.AUDIO);

      // Royalty distribution (0.03 ETH)
      const royaltyETH = ethers.parseEther("0.03");
      await fundSplitter(owner, splitter, royaltyETH);
      await splitter.distribute();

      const royaltyTreasuryShare = (royaltyETH * 2n) / 3n;
      const royaltyPoolShare = royaltyETH - royaltyTreasuryShare;

      // Advance to epoch 1
      await time.increase(EPOCH_DURATION);

      // Both users confirm and claim
      await mintPool.connect(user1).confirmClaim(0);
      await mintPool.connect(user2).confirmClaim(0);
      await mine(MIN_CLAIM_BLOCK_GAP);

      const user1BalBefore = await ethers.provider.getBalance(user1.address);
      const user2BalBefore = await ethers.provider.getBalance(user2.address);

      // user1 (50k BONZAI) claims from TEXT (pool 0, threshold 1000)
      const tx1 = await mintPool.connect(user1).claimEpochBatch(
        0,
        [CONTENT_TYPE.TEXT, CONTENT_TYPE.IMAGE, CONTENT_TYPE.AUDIO]
      );
      const r1 = await tx1.wait();

      // user2 (10k BONZAI) can claim from TEXT (1000), AUDIO (1000), IMAGE (10000 = threshold)
      const tx2 = await mintPool.connect(user2).claimEpochBatch(
        0,
        [CONTENT_TYPE.TEXT, CONTENT_TYPE.AUDIO, CONTENT_TYPE.IMAGE]
      );
      const r2 = await tx2.wait();

      const user1BalAfter = await ethers.provider.getBalance(user1.address);
      const user2BalAfter = await ethers.provider.getBalance(user2.address);

      const user1Received = user1BalAfter - user1BalBefore + r1.gasUsed * r1.gasPrice;
      const user2Received = user2BalAfter - user2BalBefore + r2.gasUsed * r2.gasPrice;

      const totalClaimed = await mintPool.totalClaimed();
      expect(totalClaimed).to.equal(user1Received + user2Received);

      // Advance to epoch 2 for sweep
      await time.increase(EPOCH_DURATION);

      // Sweep any unclaimed (rounding dust or pools nobody claimed from)
      const poolBalBefore = await ethers.provider.getBalance(await mintPool.getAddress());
      await mintPool.sweepUnclaimed(0);
      const totalSwept = await mintPool.totalSwept();

      // All ETH should be accounted for: totalClaimed + totalSwept = total deposited in MintPool
      const allDeposited = await mintPool.getAllTotalDeposited();
      let totalDepositedAll = 0n;
      for (let i = 0; i < NUM_POOLS; i++) {
        totalDepositedAll += allDeposited[i];
      }

      expect(totalClaimed + totalSwept).to.equal(totalDepositedAll);

      // MintPool should have no accountable ETH remaining (only possible rounding surplus)
      const poolBalAfter = await ethers.provider.getBalance(await mintPool.getAddress());
      const accountable = totalDepositedAll - totalClaimed - totalSwept;
      expect(accountable).to.equal(0n);
    });

    it("should allow MintPool surplus withdrawal after all claims and sweeps", async function () {
      const { content, mintPool, bonzaiToken, owner, treasury, user1 } =
        await loadFixture(deployIntegration);

      const poolAmt = expectedPoolAmount();

      // Register and deposit
      await mintPool.connect(user1).registerForEpoch();
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);

      // Send extra ETH directly to MintPool (simulating edge case / stuck ETH)
      const surplus = ethers.parseEther("0.001");
      await owner.sendTransaction({
        to: await mintPool.getAddress(),
        value: surplus,
      });

      // Advance to epoch 1
      await time.increase(EPOCH_DURATION);

      // Claim
      await mintPool.connect(user1).confirmClaim(0);
      await mine(MIN_CLAIM_BLOCK_GAP);
      await mintPool.connect(user1).claimEpoch(0, CONTENT_TYPE.IMAGE);

      // Advance to epoch 2 for sweep
      await time.increase(EPOCH_DURATION);

      // Sweep any unclaimed pools from epoch 0 (pools with zero deposits are a no-op)
      await mintPool.sweepUnclaimed(0);

      // Now the surplus should be withdrawable (goes to treasury)
      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await mintPool.withdrawETH();
      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      expect(treasuryAfter - treasuryBefore).to.equal(surplus);

      // MintPool should now be completely empty
      const poolBalance = await ethers.provider.getBalance(await mintPool.getAddress());
      expect(poolBalance).to.equal(0n);
    });
  });
});
