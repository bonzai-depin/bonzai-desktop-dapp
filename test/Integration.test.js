const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time, mine } = require("@nomicfoundation/hardhat-network-helpers");
const {
  MINT_FEES_BY_TYPE,
  EPOCH_DURATION,
  POOL_THRESHOLDS,
  MIN_CLAIM_BLOCK_GAP,
  TREASURY_BPS,
  POOL_BPS,
  BPS_DENOMINATOR,
  CONTENT_TYPE,
  NUM_POOLS,
  PROVIDER_SHARE_BPS,
} = require("./helpers/constants");

const BPS = 10000n;

describe("Integration Tests", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED FIXTURE
  // ═══════════════════════════════════════════════════════════════════════════

  async function deployIntegration() {
    const [owner, treasury, user1, user2] = await ethers.getSigners();

    // BONZAI token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const bonzaiToken = await MockERC20.deploy("BONZAI", "BONZAI");

    // MintPool — Arbitrum-local (no CRE forwarder)
    const BonzaiMintPool = await ethers.getContractFactory("BonzaiMintPool");
    const mintPool = await BonzaiMintPool.deploy(
      await bonzaiToken.getAddress(),
      POOL_THRESHOLDS,
      EPOCH_DURATION,
      treasury.address,
    );
    const genesis = await mintPool.genesisTime();
    await time.increaseTo(genesis);

    const BonzaiStakingVault = await ethers.getContractFactory("BonzaiStakingVault");
    const stakingThresholds = POOL_THRESHOLDS.map((value) => ethers.parseEther(String(value)));
    const stakingVault = await BonzaiStakingVault.deploy(
      await bonzaiToken.getAddress(),
      stakingThresholds,
    );
    await mintPool.setStakingVault(await stakingVault.getAddress());

    // Collectibles impl + factory (factory now takes unlockContract too)
    const BonzaiCollectibles = await ethers.getContractFactory("BonzaiCollectibles");
    const implementation = await BonzaiCollectibles.deploy();

    const BonzaiCollectiblesFactory = await ethers.getContractFactory("BonzaiCollectiblesFactory");
    const factory = await BonzaiCollectiblesFactory.deploy(
      await implementation.getAddress(),
      treasury.address,
      await mintPool.getAddress(),
      ethers.ZeroAddress, // royaltySplitter — wired below
      ethers.ZeroAddress, // unlockContract — none in this fixture
    );

    // Authorize factory on MintPool so it can register clones as authorized minters
    await mintPool.setCollectiblesFactory(await factory.getAddress());
    await factory.setStakingVault(await stakingVault.getAddress());

    // Set the factory itself as a contentContract so it can recordMint when clones mint
    // (Actually each clone is added via setAuthorizedMinter inside getOrCreateCollection.)

    // Create collections for test users
    await factory.connect(user1).getOrCreateCollection("User1 Collection");
    await factory.connect(user2).getOrCreateCollection("User2 Collection");
    const content1Addr = await factory.collections(user1.address);
    const content2Addr = await factory.collections(user2.address);
    const content = BonzaiCollectibles.attach(content1Addr);
    const content2 = BonzaiCollectibles.attach(content2Addr);

    // Splitter
    const BonzaiRoyaltySplitter = await ethers.getContractFactory("BonzaiRoyaltySplitter");
    const splitter = await BonzaiRoyaltySplitter.deploy(
      treasury.address,
      await mintPool.getAddress(),
    );
    await mintPool.setRoyaltySplitter(await splitter.getAddress());

    // Mint BONZAI to users
    await bonzaiToken.mint(user1.address, ethers.parseEther("50000"));
    await bonzaiToken.mint(user2.address, ethers.parseEther("10000"));
    await bonzaiToken.connect(user1).approve(await stakingVault.getAddress(), ethers.MaxUint256);
    await bonzaiToken.connect(user2).approve(await stakingVault.getAddress(), ethers.MaxUint256);
    await stakingVault.connect(user1).stake(ethers.parseEther("50000"), 30 * 86400);
    await stakingVault.connect(user2).stake(ethers.parseEther("10000"), 30 * 86400);

    return { bonzaiToken, mintPool, stakingVault, content, content2, factory, splitter, owner, treasury, user1, user2 };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS — Arbitrum-local: balance read on-chain, no CRE.
  // ═══════════════════════════════════════════════════════════════════════════

  async function registerUser(mintPool, user) {
    return mintPool.connect(user).registerForEpoch();
  }

  async function confirmUserClaim(mintPool, user, epochId) {
    return mintPool.connect(user).confirmClaim(epochId);
  }

  async function mintContent(content, signer, contentType = CONTENT_TYPE.IMAGE) {
    const fee = MINT_FEES_BY_TYPE[contentType];
    return content.connect(signer).mint(
      "ipfs-tx-" + Date.now(),
      "test-model",
      "ipfs://test-uri",
      contentType,
      { value: fee },
    );
  }

  async function fundSplitter(signer, splitter, amount) {
    const addr = await splitter.getAddress();
    await signer.sendTransaction({ to: addr, value: amount });
  }

  // After collection creation the factory called `setAuthorizedMinter(clone, true)`
  // on MintPool. The clone calls `recordMint` after minting, so the activity gate
  // is satisfied automatically via the production code path — no test poking
  // required. We also need to confirm a few cross-contract assumptions.

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CONTENT → MINT POOL FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  describe("1. Content → MintPool flow", function () {
    it("splits each mint fee 80/20 between treasury and MintPool, then 50/50 holder/provider on the pool side", async function () {
      const { content, mintPool, treasury, user1 } = await loadFixture(deployIntegration);
      const fee = MINT_FEES_BY_TYPE[CONTENT_TYPE.IMAGE];
      const treasuryBefore = await ethers.provider.getBalance(treasury.address);

      await mintContent(content, user1, CONTENT_TYPE.IMAGE);

      const treasuryAfter = await ethers.provider.getBalance(treasury.address);
      const treasuryAmt = (fee * TREASURY_BPS) / BPS_DENOMINATOR;
      const poolAmt = fee - treasuryAmt;
      expect(treasuryAfter - treasuryBefore).to.equal(treasuryAmt);

      // The poolAmt is split between holder and provider sides on MintPool.
      const expectedProvider = (poolAmt * PROVIDER_SHARE_BPS) / BPS;
      const expectedHolder = poolAmt - expectedProvider;
      const holderArr = await mintPool.getEpochHolderDeposits(0);
      const providerArr = await mintPool.getEpochProviderDeposits(0);
      expect(holderArr[CONTENT_TYPE.IMAGE]).to.equal(expectedHolder);
      expect(providerArr[CONTENT_TYPE.IMAGE]).to.equal(expectedProvider);
    });

    it("routes mints of different content types into separate buckets", async function () {
      const { content, mintPool, user1 } = await loadFixture(deployIntegration);
      for (let contentType = 0; contentType < NUM_POOLS; contentType++) {
        await mintContent(content, user1, contentType);
      }
      const arr = await mintPool.getEpochHolderDeposits(0);
      for (let contentType = 0; contentType < NUM_POOLS; contentType++) {
        expect(arr[contentType]).to.be.gt(0);
      }
    });

    it("enforces the staking tier for each media type on-chain", async function () {
      const { content2, user2 } = await loadFixture(deployIntegration);
      await mintContent(content2, user2, CONTENT_TYPE.IMAGE);
      await expect(
        mintContent(content2, user2, CONTENT_TYPE.VIDEO),
      ).to.be.revertedWith("Insufficient BONZAI stake");
    });

    it("records a per-(epoch,category,user) mint count via recordMint, satisfying the activity gate", async function () {
      const { content, mintPool, user1 } = await loadFixture(deployIntegration);
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);
      expect(await mintPool.getEpochMints(0, CONTENT_TYPE.IMAGE, user1.address)).to.equal(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ROYALTY SPLITTER → MINT POOL FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  describe("2. RoyaltySplitter → MintPool flow", function () {
    it("distributes 1/3 creator pending / 1/3 treasury / 1/3 across MintPool buckets weighted by activity", async function () {
      const { content, splitter, mintPool, treasury, user1, owner } = await loadFixture(deployIntegration);

      // Build some activity history: mint two image, one text
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);
      await mintContent(content, user1, CONTENT_TYPE.TEXT);

      // Fund splitter with 0.3 ETH and distribute
      const amount = ethers.parseEther("0.3");
      await fundSplitter(owner, splitter, amount);

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await splitter.distribute();
      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      const creatorShare = amount / 3n;
      const treasuryShare = creatorShare;
      // treasury also collects rounding remainder when pool deposits don't divide cleanly
      expect(treasuryAfter - treasuryBefore).to.gte(treasuryShare);
      expect(await splitter.creatorPendingPool()).to.equal(creatorShare);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. FULL EPOCH LIFECYCLE (register → mint → deposit → confirm → claim)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("3. Full epoch lifecycle", function () {
    it("end-to-end claim: register, mint, advance, confirm, claim", async function () {
      const { content, mintPool, user1 } = await loadFixture(deployIntegration);

      await registerUser(mintPool, user1);
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);
      await time.increase(EPOCH_DURATION);
      await confirmUserClaim(mintPool, user1, 0);
      await mine(MIN_CLAIM_BLOCK_GAP);

      // user1 is the only registered holder — gets all of the holder share
      const holderArr = await mintPool.getEpochHolderDeposits(0);
      const holderShare = holderArr[CONTENT_TYPE.IMAGE];
      await expect(mintPool.connect(user1).claimEpoch(0, CONTENT_TYPE.IMAGE))
        .to.changeEtherBalance(user1, holderShare);
    });

    it("activity gate: a user that registered but never minted CAN'T claim", async function () {
      const { content, mintPool, user1, user2 } = await loadFixture(deployIntegration);
      await registerUser(mintPool, user1);
      await registerUser(mintPool, user2);
      await mintContent(content, user1, CONTENT_TYPE.IMAGE); // user1 minted; user2 didn't
      await time.increase(EPOCH_DURATION);
      await confirmUserClaim(mintPool, user1, 0);
      await confirmUserClaim(mintPool, user2, 0);
      await mine(MIN_CLAIM_BLOCK_GAP);

      // user1 succeeds
      await expect(mintPool.connect(user1).claimEpoch(0, CONTENT_TYPE.IMAGE)).to.not.be.reverted;
      // user2 reverts on activity gate
      await expect(mintPool.connect(user2).claimEpoch(0, CONTENT_TYPE.IMAGE))
        .to.be.revertedWith("No mints in this category for epoch");
    });

    it("supports batch-claim across multiple categories the user minted in", async function () {
      const { content, mintPool, user1 } = await loadFixture(deployIntegration);
      await registerUser(mintPool, user1);
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);
      await mintContent(content, user1, CONTENT_TYPE.TEXT);
      await time.increase(EPOCH_DURATION);
      await confirmUserClaim(mintPool, user1, 0);
      await mine(MIN_CLAIM_BLOCK_GAP);

      const holderArr = await mintPool.getEpochHolderDeposits(0);
      const expected = holderArr[CONTENT_TYPE.IMAGE] + holderArr[CONTENT_TYPE.TEXT];
      await expect(
        mintPool.connect(user1).claimEpochBatch(0, [CONTENT_TYPE.IMAGE, CONTENT_TYPE.TEXT])
      ).to.changeEtherBalance(user1, expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. SWEEP
  // ═══════════════════════════════════════════════════════════════════════════

  describe("4. Sweep", function () {
    it("sweepUnclaimed sends only the unclaimed remainder to treasury after epoch N+2", async function () {
      const { content, mintPool, user1, treasury } = await loadFixture(deployIntegration);
      await registerUser(mintPool, user1);
      await mintContent(content, user1, CONTENT_TYPE.IMAGE);
      await time.increase(EPOCH_DURATION);
      await confirmUserClaim(mintPool, user1, 0);
      await mine(MIN_CLAIM_BLOCK_GAP);
      await mintPool.connect(user1).claimEpoch(0, CONTENT_TYPE.IMAGE);
      await time.increase(EPOCH_DURATION); // need epoch+2

      // total deposit minus what user1 claimed = sweepable remainder
      const fee = MINT_FEES_BY_TYPE[CONTENT_TYPE.IMAGE];
      const poolAmt = fee - (fee * TREASURY_BPS) / BPS_DENOMINATOR;
      const expectedProvider = (poolAmt * PROVIDER_SHARE_BPS) / BPS;
      const expectedHolder = poolAmt - expectedProvider;

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await mintPool.sweepUnclaimed(0);
      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      // user1 had 100% of the holder share; only the provider side remains
      expect(treasuryAfter - treasuryBefore).to.equal(expectedProvider);
    });
  });
});
