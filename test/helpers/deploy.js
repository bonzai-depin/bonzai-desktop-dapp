const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  UNLOCK_PRICE,
  POOL_THRESHOLDS,
  EPOCH_DURATION,
} = require("./constants");

/**
 * Deploy BonzaiUnlock with foundation and liquidity wallets
 */
async function deployUnlock() {
  const [owner, foundation, liquidity, user1, user2, user3] = await ethers.getSigners();

  const BonzaiUnlock = await ethers.getContractFactory("BonzaiUnlock");
  const unlock = await BonzaiUnlock.deploy(foundation.address, liquidity.address, UNLOCK_PRICE);

  return { unlock, owner, foundation, liquidity, user1, user2, user3 };
}

/**
 * Deploy MockERC20 (BONZAI token)
 */
async function deployMockERC20(name = "BONZAI", symbol = "BONZAI") {
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const token = await MockERC20.deploy(name, symbol);
  return token;
}

/**
 * Deploy BonzaiMintPool — Arbitrum-local: no CRE forwarder, simple
 * (token, thresholds, epochDuration, treasury) constructor.
 */
async function deployMintPool() {
  const [owner, user1, user2, user3, treasury] = await ethers.getSigners();

  const token = await deployMockERC20();

  const BonzaiMintPool = await ethers.getContractFactory("BonzaiMintPool");
  const mintPool = await BonzaiMintPool.deploy(
    await token.getAddress(),
    POOL_THRESHOLDS,
    EPOCH_DURATION,
    treasury.address,
  );

  // Genesis is next Monday 00:00 UTC — advance time so tests start in epoch 0
  const genesis = await mintPool.genesisTime();
  await time.increaseTo(genesis);

  return { mintPool, token, owner, user1, user2, user3, treasury };
}

/**
 * Deploy BonzaiCollectibles (implementation) + BonzaiCollectiblesFactory,
 * then create a collection clone for the test user (owner).
 */
async function deployContent() {
  const [owner, treasury, user1, user2] = await ethers.getSigners();

  // Deploy implementation
  const BonzaiCollectibles = await ethers.getContractFactory("BonzaiCollectibles");
  const implementation = await BonzaiCollectibles.deploy();

  // Mock pool
  const MockMintPool = await ethers.getContractFactory("MockMintPool");
  const mockPool = await MockMintPool.deploy();

  // Factory now takes (impl, treasury, mintPool, royaltySplitter, unlockContract)
  const BonzaiCollectiblesFactory = await ethers.getContractFactory("BonzaiCollectiblesFactory");
  const factory = await BonzaiCollectiblesFactory.deploy(
    await implementation.getAddress(),
    treasury.address,
    await mockPool.getAddress(),
    ethers.ZeroAddress, // royaltySplitter
    ethers.ZeroAddress, // unlockContract — tests opt out by default
  );

  // Create a collection for the owner
  await factory.getOrCreateCollection("Test Collection");
  const cloneAddress = await factory.collections(owner.address);

  const content = BonzaiCollectibles.attach(cloneAddress);

  return { factory, content, implementation, mockPool, owner, treasury, user1, user2 };
}

/**
 * Deploy BonzaiRoyaltySplitter
 */
async function deploySplitter() {
  const [owner, treasury, user1] = await ethers.getSigners();

  const MockMintPool = await ethers.getContractFactory("MockMintPool");
  const mockPool = await MockMintPool.deploy();

  const BonzaiRoyaltySplitter = await ethers.getContractFactory("BonzaiRoyaltySplitter");
  const splitter = await BonzaiRoyaltySplitter.deploy(treasury.address, await mockPool.getAddress());

  return { splitter, mockPool, owner, treasury, user1 };
}

/**
 * Deploy BonzaiCompanions (no unlock contract dependency anymore)
 */
async function deployCompanions() {
  const [owner, treasury, user1, user2, user3] = await ethers.getSigners();

  const BonzaiCompanions = await ethers.getContractFactory("BonzaiCompanions");
  const companions = await BonzaiCompanions.deploy(treasury.address);

  return { companions, owner, treasury, user1, user2, user3 };
}

/**
 * Deploy BonzaiUniswapHook with mocks
 */
async function deployHook() {
  const [owner, treasury, beneficiary, companionOwner, user1] = await ethers.getSigners();

  const MockPoolManager = await ethers.getContractFactory("MockPoolManager");
  const poolManager = await MockPoolManager.deploy();

  const MockMintPool = await ethers.getContractFactory("MockMintPool");
  const mockPool = await MockMintPool.deploy();

  // Mock companions NFT — H7 routing reads ownerOf + getAgentWallet live.
  const MockBonzaiCompanions = await ethers.getContractFactory("MockBonzaiCompanions");
  const mockCompanions = await MockBonzaiCompanions.deploy();
  // Mint NFT id 1 to companionOwner so live owner = companionOwner;
  // mintTo also sets agentWallet = companionOwner by default. Tests can
  // call mockCompanions.setAgentWallet(1, beneficiary) to differentiate.
  await mockCompanions.mintTo(companionOwner.address);
  await mockCompanions.setAgentWallet(1, beneficiary.address);
  const mockCompanionsAddr = await mockCompanions.getAddress();

  const BonzaiUniswapHook = await ethers.getContractFactory("BonzaiUniswapHook");
  const hook = await BonzaiUniswapHook.deploy(
    await poolManager.getAddress(),
    treasury.address,
    await mockPool.getAddress(),
    owner.address,
  );

  return { hook, poolManager, mockPool, mockCompanions, mockCompanionsAddr, owner, treasury, beneficiary, companionOwner, user1 };
}

/**
 * Deploy CompanionTokenFactory with mock infrastructure
 */
async function deployCompanionTokenFactory() {
  const [owner, user1, agentWallet, companionOwner] = await ethers.getSigners();

  const MockPoolManager = await ethers.getContractFactory("MockPoolManager");
  const poolManager = await MockPoolManager.deploy();

  const MockPositionManager = await ethers.getContractFactory("MockPositionManager");
  const positionManager = await MockPositionManager.deploy();

  const MockPermit2 = await ethers.getContractFactory("MockPermit2");
  const permit2 = await MockPermit2.deploy();

  const MockFeeHook = await ethers.getContractFactory("MockFeeHook");
  const feeHook = await MockFeeHook.deploy();

  const MockBonzaiCompanions = await ethers.getContractFactory("MockBonzaiCompanions");
  const mockCompanions = await MockBonzaiCompanions.deploy();

  const CompanionTokenFactory = await ethers.getContractFactory("CompanionTokenFactory");
  const factory = await CompanionTokenFactory.deploy(
    await poolManager.getAddress(),
    await positionManager.getAddress(),
    await permit2.getAddress(),
    await feeHook.getAddress(),
  );

  await factory.setCompanionContract(await mockCompanions.getAddress());

  return { factory, poolManager, positionManager, permit2, feeHook, mockCompanions, owner, user1, agentWallet, companionOwner };
}

/**
 * Deploy FineTuneTokenFactory with mock infrastructure
 */
async function deployFineTuneTokenFactory() {
  const [owner, user1, creator] = await ethers.getSigners();

  const MockPoolManager = await ethers.getContractFactory("MockPoolManager");
  const poolManager = await MockPoolManager.deploy();

  const MockPositionManager = await ethers.getContractFactory("MockPositionManager");
  const positionManager = await MockPositionManager.deploy();

  const MockPermit2 = await ethers.getContractFactory("MockPermit2");
  const permit2 = await MockPermit2.deploy();

  const MockFeeHook = await ethers.getContractFactory("MockFeeHook");
  const feeHook = await MockFeeHook.deploy();

  const MockBonzaiContent = await ethers.getContractFactory("MockBonzaiContent");
  const mockContent = await MockBonzaiContent.deploy();

  const FineTuneTokenFactory = await ethers.getContractFactory("FineTuneTokenFactory");
  const factory = await FineTuneTokenFactory.deploy(
    await poolManager.getAddress(),
    await positionManager.getAddress(),
    await permit2.getAddress(),
    await feeHook.getAddress(),
  );

  await factory.setContentContract(await mockContent.getAddress());

  return { factory, poolManager, positionManager, permit2, feeHook, mockContent, owner, user1, creator };
}

/**
 * Deploy BonzaiProviderRegistry — single-arg constructor (treasury only)
 */
async function deployProviderRegistry() {
  const [owner, treasury, provider1, provider2, provider3, paymentContract] = await ethers.getSigners();

  const BonzaiProviderRegistry = await ethers.getContractFactory("BonzaiProviderRegistry");
  const registry = await BonzaiProviderRegistry.deploy(treasury.address);

  return { registry, owner, treasury, provider1, provider2, provider3, paymentContract };
}

/**
 * Deploy BonzaiSkillRegistry with token-gated companion ownership.
 */
async function deploySkillRegistry() {
  const [owner, treasury, author1, author2, buyer1, buyer2] = await ethers.getSigners();

  // Deploy a simple mock ownership contract that accepts ETH via payable distributeRevenue
  const MockSkillOwnership = await ethers.getContractFactory("MockSkillOwnership");
  const mockOwnership = await MockSkillOwnership.deploy();

  const BonzaiSkillRegistry = await ethers.getContractFactory("BonzaiSkillRegistry");
  const registry = await BonzaiSkillRegistry.deploy(await mockOwnership.getAddress());

  return { registry, mockOwnership, owner, treasury, author1, author2, buyer1, buyer2 };
}

/**
 * Deploy BonzaiSkillOwnership — ETH-only
 */
async function deploySkillOwnership() {
  const [owner, treasury, attestationSigner, registrar1, registrar2, skillRegistryWallet] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const bonzaiToken = await MockERC20.deploy("BONZAI", "BONZAI");

  const MockBonzaiCompanions = await ethers.getContractFactory("MockBonzaiCompanions");
  const companionNFT = await MockBonzaiCompanions.deploy();

  const BonzaiSkillOwnership = await ethers.getContractFactory("BonzaiSkillOwnership");
  const ownership = await BonzaiSkillOwnership.deploy(
    skillRegistryWallet.address,
    await bonzaiToken.getAddress(),
    treasury.address,
    attestationSigner.address,
    await companionNFT.getAddress(),
  );

  return { ownership, bonzaiToken, companionNFT, owner, treasury, attestationSigner, registrar1, registrar2, skillRegistryWallet };
}

/**
 * Deploy BonzaiServiceTime
 */
async function deployServiceTime() {
  const [owner, provider, consumer, treasury] = await ethers.getSigners();
  const { mintPool, token } = await deployMintPool();

  const BonzaiServiceTime = await ethers.getContractFactory("BonzaiServiceTime");
  const serviceTime = await BonzaiServiceTime.deploy(
    await token.getAddress(),
    await mintPool.getAddress(),
  );

  // Wire up MintPool authorization
  await mintPool.setServiceTimeContract(await serviceTime.getAddress());

  return { serviceTime, mintPool, token, owner, provider, consumer, treasury };
}

module.exports = {
  deployUnlock,
  deployMockERC20,
  deployMintPool,
  deployContent,
  deploySplitter,
  deployCompanions,
  deployHook,
  deployCompanionTokenFactory,
  deployFineTuneTokenFactory,
  deployProviderRegistry,
  deploySkillRegistry,
  deploySkillOwnership,
  deployServiceTime,
};
