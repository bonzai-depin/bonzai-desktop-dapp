const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BonzAI smart-agent job escrow", function () {
  async function fixture() {
    const [owner, employer, worker, treasury] = await ethers.getSigners();
    const Router = await ethers.getContractFactory("MockRevenueRouter");
    const router = await Router.deploy();
    const Escrow = await ethers.getContractFactory("BonzaiJobEscrow");
    const escrow = await Escrow.deploy(treasury.address, await router.getAddress());
    return { owner, employer, worker, treasury, router, escrow };
  }

  it("funds, accepts, evidences, and releases companion work with contribution routing", async function () {
    const { employer, worker, treasury, router, escrow } = await fixture();
    const jobId = ethers.id("invoice-reconciliation-june");
    const routeId = ethers.id("companion-work-contribution-route");
    const terms = ethers.id("signed-job-terms");
    const evidence = ethers.id("reconciled-ledger-and-audit-log");
    await escrow.connect(employer).fundJob(jobId, worker.address, 42, terms, routeId, { value: ethers.parseEther("1") });
    await escrow.connect(worker).acceptJob(jobId);
    await escrow.connect(worker).submitWork(jobId, evidence);
    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    await escrow.connect(employer).approveWork(jobId);
    expect((await escrow.jobs(jobId)).status).to.equal(4);
    expect(await router.received(routeId)).to.equal(ethers.parseEther("0.025"));
    expect((await ethers.provider.getBalance(treasury.address)) - treasuryBefore).to.equal(ethers.parseEther("0.025"));
  });

  it("allows an employer to cancel only before acceptance", async function () {
    const { employer, worker, escrow } = await fixture();
    const jobId = ethers.id("cancelled-job");
    await escrow.connect(employer).fundJob(jobId, worker.address, 1, ethers.id("terms"), ethers.ZeroHash, { value: ethers.parseEther("0.1") });
    await escrow.connect(employer).cancelJob(jobId);
    expect((await escrow.jobs(jobId)).status).to.equal(5);
  });
});
