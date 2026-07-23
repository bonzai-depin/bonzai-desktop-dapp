const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySkillRegistry } = require("./helpers/deploy");

describe("BonzaiSkillRegistry", function () {
  const NAME = "Portfolio Council";
  const VERSION = "1.0.0";
  const CATEGORY = "finance";
  const CID = "bafybeigenuineproductioncid";

  const skillIdFor = (author) =>
    ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "string", "address"],
        [NAME, VERSION, author],
      ),
    );

  async function register(registry, author, tokenGated = true) {
    await registry.connect(author).registerSkill(NAME, VERSION, CATEGORY, CID, tokenGated);
    return skillIdFor(author.address);
  }

  it("registers a companion-token-gated skill without price or fee state", async function () {
    const { registry, author1 } = await loadFixture(deploySkillRegistry);
    const skillId = await register(registry, author1);
    const skill = await registry.getSkill(skillId);

    expect(skill.author).to.equal(author1.address);
    expect(skill.tokenGated).to.equal(true);
    expect(skill.totalExecutions).to.equal(0);
  });

  it("rejects duplicate and invalid registrations", async function () {
    const { registry, author1 } = await loadFixture(deploySkillRegistry);
    await register(registry, author1);
    await expect(register(registry, author1)).to.be.revertedWithCustomError(registry, "SkillAlreadyExists");
    await expect(
      registry.connect(author1).registerSkill("Bad", VERSION, "unknown", CID, true),
    ).to.be.revertedWithCustomError(registry, "InvalidCategory");
  });

  it("allows public skills without a token", async function () {
    const { registry, mockOwnership, author1, buyer1 } = await loadFixture(deploySkillRegistry);
    const skillId = await register(registry, author1, false);
    await mockOwnership.setTokenAccess(false);

    expect(await registry.userHasAccess(buyer1.address, skillId)).to.equal(true);
    await expect(registry.connect(buyer1).recordExecution(skillId))
      .to.emit(registry, "SkillExecuted")
      .withArgs(skillId, buyer1.address, 1);
  });

  it("requires a registered owner token for gated skill execution", async function () {
    const { registry, mockOwnership, author1, buyer1 } = await loadFixture(deploySkillRegistry);
    const skillId = await register(registry, author1);
    await mockOwnership.setTokenAccess(false);

    expect(await registry.userHasAccess(buyer1.address, skillId)).to.equal(false);
    await expect(registry.connect(buyer1).recordExecution(skillId))
      .to.be.revertedWithCustomError(registry, "CompanionTokenRequired");

    await mockOwnership.setTokenAccess(true);
    expect(await registry.userHasAccess(buyer1.address, skillId)).to.equal(true);
    await expect(registry.connect(buyer1).recordExecution(skillId)).to.emit(registry, "SkillExecuted");
  });

  it("fails closed while ownership wiring is absent", async function () {
    const Registry = await ethers.getContractFactory("BonzaiSkillRegistry");
    const registry = await Registry.deploy(ethers.ZeroAddress);
    const [, author, user] = await ethers.getSigners();
    const skillId = await register(registry, author);

    expect(await registry.userHasAccess(user.address, skillId)).to.equal(false);
    await expect(registry.connect(user).recordExecution(skillId))
      .to.be.revertedWithCustomError(registry, "CompanionTokenRequired");
  });

  it("lets authors update metadata and access policy", async function () {
    const { registry, author1, author2 } = await loadFixture(deploySkillRegistry);
    const skillId = await register(registry, author1);

    await expect(registry.connect(author2).updateSkill(skillId, "bafynew", false))
      .to.be.revertedWithCustomError(registry, "NotAuthor");
    await registry.connect(author1).updateSkill(skillId, "bafynew", false);

    const skill = await registry.getSkill(skillId);
    expect(skill.ipfsHash).to.equal("bafynew");
    expect(skill.tokenGated).to.equal(false);
  });

  it("honors author and administrative deactivation", async function () {
    const { registry, author1 } = await loadFixture(deploySkillRegistry);
    const skillId = await register(registry, author1);
    await registry.connect(author1).deactivateSkill(skillId);
    expect(await registry.userHasAccess(author1.address, skillId)).to.equal(false);
    await registry.connect(author1).reactivateSkill(skillId);

    await registry.adminDeactivateSkill(skillId);
    await expect(registry.connect(author1).reactivateSkill(skillId))
      .to.be.revertedWithCustomError(registry, "AdminDeactivated");
  });

  it("rejects native payments because inference and skill execution are free", async function () {
    const { registry, buyer1 } = await loadFixture(deploySkillRegistry);
    await expect(
      buyer1.sendTransaction({ to: await registry.getAddress(), value: 1n }),
    ).to.be.revertedWithCustomError(registry, "DirectPaymentsDisabled");
  });
});
