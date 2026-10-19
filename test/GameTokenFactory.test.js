const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GameTokenFactory", function () {
  async function fixture() {
    const [owner, other] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory("MockBonzaiContent");
    const nft = await NFT.deploy();
    await nft.mintTo(owner.address);
    const CollectionFactory = await ethers.getContractFactory("MockCollectiblesFactory");
    const collectionFactory = await CollectionFactory.deploy();
    await collectionFactory.setCollection(owner.address, await nft.getAddress());
    const Registry = await ethers.getContractFactory("BonzaiGameRegistry");
    const registry = await Registry.deploy(await collectionFactory.getAddress());
    const Factory = await ethers.getContractFactory("GameTokenFactory");
    const factory = await Factory.deploy(
      await collectionFactory.getAddress(),
      await registry.getAddress(),
    );
    const pools=await (await ethers.getContractFactory('MockPoolManager')).deploy();
    const positions=await (await ethers.getContractFactory('MockPositionManager')).deploy();
    const permits=await (await ethers.getContractFactory('MockPermit2')).deploy();
    const rewards=await (await ethers.getContractFactory('MockVaultRewards')).deploy();
    await positions.setPermit2(await permits.getAddress());
    await factory.configureLiquidity(await pools.getAddress(),await positions.getAddress(),await permits.getAddress(),other.address,await rewards.getAddress());
    return { owner, other, nft, factory, collectionFactory, registry, positions };

  }

  it("issues one fixed-supply token to the game collectible owner", async function () {
    const { owner, nft, factory, registry } = await fixture();
    await registry.register(await nft.getAddress(), 1, ethers.id("manifest"), "ipfs://game");
    await expect(factory.issue(await nft.getAddress(), 1, "Temple Run", "TEMPLE", "ipfs://game",{value:ethers.parseEther("0.01")}))
      .to.emit(factory, "GameTokenIssued");
    const key = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [await nft.getAddress(), 1]),
    );
    const tokenAddress = await factory.tokenForCollectible(key);
    const token = await ethers.getContractAt("GameToken", tokenAddress);
    expect(await token.balanceOf(owner.address)).to.equal(ethers.parseEther("40000000"));
    expect(await token.collectibleTokenId()).to.equal(1);
    expect(await factory.getAllTokens()).to.deep.equal([tokenAddress]);
    expect(await factory.totalTokensIssued()).to.equal(1);
  });

  it("rejects non-owners and duplicate issuance", async function () {
    const { other, nft, factory, registry } = await fixture();
    await expect(
      factory.connect(other).issue(await nft.getAddress(), 1, "Temple Run", "TEMPLE", "ipfs://game",{value:ethers.parseEther("0.01")}),
    ).to.be.revertedWith("Not BonzAI collection");
    await registry.register(await nft.getAddress(), 1, ethers.id("manifest"), "ipfs://game");
    await factory.issue(await nft.getAddress(), 1, "Temple Run", "TEMPLE", "ipfs://game",{value:ethers.parseEther("0.01")});
    await expect(
      factory.issue(await nft.getAddress(), 1, "Temple Run", "TEMPLE", "ipfs://game",{value:ethers.parseEther("0.01")}),
    ).to.be.revertedWith("Token already issued");
  });

  it("rejects a generic 3D collectible until it is registered as a game", async function () {
    const { nft, factory } = await fixture();
    await expect(
      factory.issue(await nft.getAddress(), 1, "Temple Run", "TEMPLE", "ipfs://game",{value:ethers.parseEther("0.01")}),
    ).to.be.revertedWith("Not registered game");
  });

  it("binds the issued token to the registered game metadata", async function () {
    const { nft, factory, registry } = await fixture();
    await registry.register(await nft.getAddress(), 1, ethers.id("manifest"), "ipfs://game");
    await expect(
      factory.issue(await nft.getAddress(), 1, "Temple Run", "TEMPLE", "ipfs://other"),
    ).to.be.revertedWith("Metadata mismatch");
  });

  it("rejects NFTs outside the configured BonzAI collection factory", async function () {
    const { owner, nft, factory, collectionFactory } = await fixture();
    await collectionFactory.setCollection(owner.address, ethers.ZeroAddress);
    await expect(
      factory.issue(await nft.getAddress(), 1, "Temple Run", "TEMPLE", "ipfs://game",{value:ethers.parseEther("0.01")}),
    ).to.be.revertedWith("Not BonzAI collection");
  });
});
