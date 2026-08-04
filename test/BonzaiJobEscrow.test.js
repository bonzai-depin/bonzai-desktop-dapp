const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

const MIN_SUBMISSION_PERIOD = HOUR;
const MAX_SUBMISSION_PERIOD = 30 * DAY;
const MIN_REVIEW_PERIOD = DAY;
const MAX_REVIEW_PERIOD = 14 * DAY;
const MIN_RESOLUTION_PERIOD = DAY;
const MAX_RESOLUTION_PERIOD = 30 * DAY;

const Status = {
  None: 0,
  Funded: 1,
  Accepted: 2,
  Submitted: 3,
  Completed: 4,
  Cancelled: 5,
  Disputed: 6,
  Resolved: 7,
  Refunded: 8,
};

describe("BonzAI smart-agent job escrow", function () {
  async function fixture() {
    const [owner, employer, worker, treasury, other] = await ethers.getSigners();
    const Router = await ethers.getContractFactory("MockRevenueRouter");
    const router = await Router.deploy();
    const Escrow = await ethers.getContractFactory("BonzaiJobEscrow");
    const escrow = await Escrow.deploy(treasury.address, await router.getAddress());
    const Rejector = await ethers.getContractFactory("ETHRejector");
    const rejector = await Rejector.deploy();
    return { owner, employer, worker, treasury, other, router, escrow, rejector };
  }

  async function fundJob(escrow, employer, worker, jobId, overrides = {}) {
    const routeId = overrides.routeId ?? ethers.ZeroHash;
    const terms = overrides.terms ?? ethers.id("signed-job-terms");
    const value = overrides.value ?? ethers.parseEther("1");
    const submissionPeriod = overrides.submissionPeriod ?? MIN_SUBMISSION_PERIOD;
    const reviewPeriod = overrides.reviewPeriod ?? MIN_REVIEW_PERIOD;
    const resolutionPeriod = overrides.resolutionPeriod ?? MIN_RESOLUTION_PERIOD;
    await escrow.connect(employer).fundJob(
      jobId,
      worker.address ?? worker,
      1,
      terms,
      routeId,
      submissionPeriod,
      reviewPeriod,
      resolutionPeriod,
      { value },
    );
    return { submissionPeriod, reviewPeriod, resolutionPeriod, value };
  }

  it("funds, accepts, evidences, and releases companion work with contribution routing", async function () {
    const { employer, worker, treasury, router, escrow } = await fixture();
    const jobId = ethers.id("invoice-reconciliation-june");
    const routeId = ethers.id("companion-work-contribution-route");
    const terms = ethers.id("signed-job-terms");
    const evidence = ethers.id("reconciled-ledger-and-audit-log");
    await escrow.connect(employer).fundJob(jobId, worker.address, 42, terms, routeId, MIN_SUBMISSION_PERIOD, MIN_REVIEW_PERIOD, MIN_RESOLUTION_PERIOD, { value: ethers.parseEther("1") });
    await escrow.connect(worker).acceptJob(jobId);
    await escrow.connect(worker).submitWork(jobId, evidence);
    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    await escrow.connect(employer).approveWork(jobId);
    expect((await escrow.jobs(jobId)).status).to.equal(Status.Completed);
    expect(await router.received(routeId)).to.equal(ethers.parseEther("0.025"));
    expect((await ethers.provider.getBalance(treasury.address)) - treasuryBefore).to.equal(ethers.parseEther("0.025"));
  });

  it("allows an employer to cancel only before acceptance", async function () {
    const { employer, worker, escrow } = await fixture();
    const jobId = ethers.id("cancelled-job");
    await escrow.connect(employer).fundJob(jobId, worker.address, 1, ethers.id("terms"), ethers.ZeroHash, MIN_SUBMISSION_PERIOD, MIN_REVIEW_PERIOD, MIN_RESOLUTION_PERIOD, { value: ethers.parseEther("0.1") });
    await escrow.connect(employer).cancelJob(jobId);
    expect((await escrow.jobs(jobId)).status).to.equal(Status.Cancelled);
  });

  describe("withdrawal event emission (B10)", function () {
    it("emits Withdrawal with the exact amount on a successful withdraw", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("withdrawal-event");
      const { value } = await fundJob(escrow, employer, worker, jobId);
      await escrow.connect(worker).acceptJob(jobId);
      await escrow.connect(worker).submitWork(jobId, ethers.id("evidence"));
      await escrow.connect(employer).approveWork(jobId);

      const workerAmount = await escrow.pendingWithdrawals(worker.address);
      expect(workerAmount).to.be.above(0);
      await expect(escrow.connect(worker).withdraw())
        .to.emit(escrow, "Withdrawal")
        .withArgs(worker.address, workerAmount);
      expect(await escrow.pendingWithdrawals(worker.address)).to.equal(0);
    });

    it("does not emit Withdrawal when there is nothing to withdraw", async function () {
      const { other, escrow } = await fixture();
      await expect(escrow.connect(other).withdraw()).to.be.revertedWith("Nothing to withdraw");
    });
  });

  describe("period bounds (R1 / AC1)", function () {
    const cases = [
      { name: "submission", field: "submissionPeriod", min: MIN_SUBMISSION_PERIOD, max: MAX_SUBMISSION_PERIOD },
      { name: "review", field: "reviewPeriod", min: MIN_REVIEW_PERIOD, max: MAX_REVIEW_PERIOD },
      { name: "resolution", field: "resolutionPeriod", min: MIN_RESOLUTION_PERIOD, max: MAX_RESOLUTION_PERIOD },
    ];

    for (const c of cases) {
      it(`rejects ${c.name} period below the minimum`, async function () {
        const { employer, worker, escrow } = await fixture();
        const jobId = ethers.id(`below-min-${c.name}`);
        await expect(fundJob(escrow, employer, worker, jobId, { [c.field]: c.min - 1 })).to.be.reverted;
      });

      it(`rejects ${c.name} period above the maximum`, async function () {
        const { employer, worker, escrow } = await fixture();
        const jobId = ethers.id(`above-max-${c.name}`);
        await expect(fundJob(escrow, employer, worker, jobId, { [c.field]: c.max + 1 })).to.be.reverted;
      });

      it(`accepts ${c.name} period at exact bounds`, async function () {
        const { employer, worker, escrow } = await fixture();
        const jobIdMin = ethers.id(`exact-min-${c.name}`);
        await expect(fundJob(escrow, employer, worker, jobIdMin, { [c.field]: c.min })).to.not.be.reverted;
        const jobIdMax = ethers.id(`exact-max-${c.name}`);
        await expect(fundJob(escrow, employer, worker, jobIdMax, { [c.field]: c.max })).to.not.be.reverted;
      });
    }

    it("commits periods immutably with no setter exposed", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("immutable-periods");
      await fundJob(escrow, employer, worker, jobId, {
        submissionPeriod: 2 * HOUR,
        reviewPeriod: 2 * DAY,
        resolutionPeriod: 5 * DAY,
      });
      const job = await escrow.jobs(jobId);
      expect(job.submissionPeriod).to.equal(2 * HOUR);
      expect(job.reviewPeriod).to.equal(2 * DAY);
      expect(job.resolutionPeriod).to.equal(5 * DAY);
      // No setter exists for job periods once funded.
      expect(escrow.setSubmissionPeriod).to.be.undefined;
      expect(escrow.setReviewPeriod).to.be.undefined;
      expect(escrow.setResolutionPeriod).to.be.undefined;
    });
  });

  describe("deadline commitment (R2 / AC2)", function () {
    it("commits submissionDeadline at acceptance from the controlled block timestamp", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("accept-deadline");
      const { submissionPeriod } = await fundJob(escrow, employer, worker, jobId, { submissionPeriod: 3 * HOUR });
      const tx = await escrow.connect(worker).acceptJob(jobId);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const job = await escrow.jobs(jobId);
      expect(job.submissionDeadline).to.equal(BigInt(block.timestamp) + BigInt(submissionPeriod));
    });

    it("commits reviewDeadline once at submission and does not move on later calls", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("submit-deadline");
      const { reviewPeriod } = await fundJob(escrow, employer, worker, jobId, { reviewPeriod: 2 * DAY });
      await escrow.connect(worker).acceptJob(jobId);
      const tx = await escrow.connect(worker).submitWork(jobId, ethers.id("evidence"));
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const job = await escrow.jobs(jobId);
      expect(job.reviewDeadline).to.equal(BigInt(block.timestamp) + BigInt(reviewPeriod));
    });

    it("commits resolutionDeadline once at dispute and does not move on later calls", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("dispute-deadline");
      const { resolutionPeriod } = await fundJob(escrow, employer, worker, jobId, { resolutionPeriod: 3 * DAY });
      await escrow.connect(worker).acceptJob(jobId);
      await escrow.connect(worker).submitWork(jobId, ethers.id("evidence"));
      const tx = await escrow.connect(employer).disputeJob(jobId);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const job = await escrow.jobs(jobId);
      expect(job.resolutionDeadline).to.equal(BigInt(block.timestamp) + BigInt(resolutionPeriod));
    });
  });

  describe("submission deadline gating (R3 / AC3)", function () {
    it("allows submission strictly before the deadline", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("submit-before");
      await fundJob(escrow, employer, worker, jobId, { submissionPeriod: 2 * HOUR });
      await escrow.connect(worker).acceptJob(jobId);
      await time.increase(HOUR);
      await expect(escrow.connect(worker).submitWork(jobId, ethers.id("evidence"))).to.not.be.reverted;
    });

    it("allows submission exactly at the deadline", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("submit-at");
      await fundJob(escrow, employer, worker, jobId, { submissionPeriod: 2 * HOUR });
      await escrow.connect(worker).acceptJob(jobId);
      const job = await escrow.jobs(jobId);
      // Hardhat mines the next tx's block at least 1s after the last mined timestamp,
      // so seed to deadline - 1 for the submitWork tx to land exactly on the deadline.
      await time.increaseTo(job.submissionDeadline - 1n);
      await expect(escrow.connect(worker).submitWork(jobId, ethers.id("evidence"))).to.not.be.reverted;
    });

    it("rejects submission after the deadline", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("submit-after");
      await fundJob(escrow, employer, worker, jobId, { submissionPeriod: 2 * HOUR });
      await escrow.connect(worker).acceptJob(jobId);
      const job = await escrow.jobs(jobId);
      await time.increaseTo(job.submissionDeadline + 1n);
      await expect(escrow.connect(worker).submitWork(jobId, ethers.id("evidence"))).to.be.revertedWith("Submission deadline passed");
    });
  });

  describe("dispute gating (R3 / AC3)", function () {
    async function acceptedAndSubmitted(escrow, employer, worker, jobId, overrides = {}) {
      await fundJob(escrow, employer, worker, jobId, overrides);
      await escrow.connect(worker).acceptJob(jobId);
      await escrow.connect(worker).submitWork(jobId, ethers.id("evidence"));
    }

    it("allows dispute strictly before the review deadline", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("dispute-before");
      await acceptedAndSubmitted(escrow, employer, worker, jobId, { reviewPeriod: 2 * DAY });
      await time.increase(DAY);
      await expect(escrow.connect(employer).disputeJob(jobId)).to.not.be.reverted;
    });

    it("allows dispute exactly at the review deadline", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("dispute-at");
      await acceptedAndSubmitted(escrow, employer, worker, jobId, { reviewPeriod: 2 * DAY });
      const job = await escrow.jobs(jobId);
      await time.increaseTo(job.reviewDeadline - 1n);
      await expect(escrow.connect(employer).disputeJob(jobId)).to.not.be.reverted;
    });

    it("rejects dispute after the review deadline", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("dispute-after");
      await acceptedAndSubmitted(escrow, employer, worker, jobId, { reviewPeriod: 2 * DAY });
      const job = await escrow.jobs(jobId);
      await time.increaseTo(job.reviewDeadline + 1n);
      await expect(escrow.connect(employer).disputeJob(jobId)).to.be.revertedWith("Review deadline passed");
    });

    it("blocks approval while disputed", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("dispute-blocks-approval");
      await acceptedAndSubmitted(escrow, employer, worker, jobId);
      await escrow.connect(employer).disputeJob(jobId);
      await expect(escrow.connect(employer).approveWork(jobId)).to.be.revertedWith("Cannot approve");
    });

    it("only the employer can dispute", async function () {
      const { employer, worker, other, escrow } = await fixture();
      const jobId = ethers.id("dispute-only-employer");
      await acceptedAndSubmitted(escrow, employer, worker, jobId);
      await expect(escrow.connect(other).disputeJob(jobId)).to.be.revertedWith("Cannot dispute");
    });
  });

  describe("resolver allocation (R3 / AC3)", function () {
    async function disputedJob(escrow, employer, worker, jobId, overrides = {}) {
      const funded = await fundJob(escrow, employer, worker, jobId, overrides);
      await escrow.connect(worker).acceptJob(jobId);
      await escrow.connect(worker).submitWork(jobId, ethers.id("evidence"));
      await escrow.connect(employer).disputeJob(jobId);
      return funded;
    }

    it("lets the owner resolve within bounds, emits JobResolved, and credits withdrawable balances", async function () {
      const { owner, employer, worker, escrow } = await fixture();
      const jobId = ethers.id("resolve-owner");
      const { value } = await disputedJob(escrow, employer, worker, jobId);
      const employerAmount = value / 4n;
      const workerAmount = value - employerAmount;
      await expect(escrow.connect(owner).resolveDispute(jobId, employerAmount, workerAmount))
        .to.emit(escrow, "JobResolved")
        .withArgs(jobId, employerAmount, workerAmount);
      expect((await escrow.jobs(jobId)).status).to.equal(Status.Resolved);
      expect(await escrow.pendingWithdrawals(employer.address)).to.equal(employerAmount);
      expect(await escrow.pendingWithdrawals(worker.address)).to.equal(workerAmount);
      await expect(escrow.connect(employer).withdraw()).to.changeEtherBalance(employer, employerAmount);
      await expect(escrow.connect(worker).withdraw()).to.changeEtherBalance(worker, workerAmount);
    });

    it("lets an authorized resolver resolve", async function () {
      const { owner, employer, worker, other, escrow } = await fixture();
      const jobId = ethers.id("resolve-authorized");
      const { value } = await disputedJob(escrow, employer, worker, jobId);
      await escrow.connect(owner).setResolver(other.address);
      await expect(escrow.connect(other).resolveDispute(jobId, value, 0n)).to.not.be.reverted;
    });

    it("rejects resolution from an unauthorized account", async function () {
      const { employer, worker, other, escrow } = await fixture();
      const jobId = ethers.id("resolve-unauthorized");
      const { value } = await disputedJob(escrow, employer, worker, jobId);
      await expect(escrow.connect(other).resolveDispute(jobId, value, 0n)).to.be.revertedWith("Not authorized resolver");
    });

    it("rejects an allocation that exceeds the escrowed amount", async function () {
      const { owner, employer, worker, escrow } = await fixture();
      const jobId = ethers.id("resolve-over-cap");
      const { value } = await disputedJob(escrow, employer, worker, jobId);
      await expect(escrow.connect(owner).resolveDispute(jobId, value, 1n)).to.be.revertedWith("Allocation must equal escrow");
    });

    it("rejects a partial allocation that would strand the remainder in escrow", async function () {
      const { owner, employer, worker, escrow } = await fixture();
      const jobId = ethers.id("resolve-under-cap");
      const { value } = await disputedJob(escrow, employer, worker, jobId);
      const employerAmount = value / 4n;
      const workerAmount = value / 4n; // deliberately less than the remaining escrow
      await expect(escrow.connect(owner).resolveDispute(jobId, employerAmount, workerAmount)).to.be.revertedWith("Allocation must equal escrow");
    });

    it("allows resolution exactly at the resolution deadline", async function () {
      const { owner, employer, worker, escrow } = await fixture();
      const jobId = ethers.id("resolve-at-deadline");
      const { value } = await disputedJob(escrow, employer, worker, jobId, { resolutionPeriod: 2 * DAY });
      const job = await escrow.jobs(jobId);
      await time.increaseTo(job.resolutionDeadline - 1n);
      await expect(escrow.connect(owner).resolveDispute(jobId, value, 0n)).to.not.be.reverted;
    });

    it("rejects resolution after the resolution deadline", async function () {
      const { owner, employer, worker, escrow } = await fixture();
      const jobId = ethers.id("resolve-after-deadline");
      const { value } = await disputedJob(escrow, employer, worker, jobId, { resolutionPeriod: 2 * DAY });
      const job = await escrow.jobs(jobId);
      await time.increaseTo(job.resolutionDeadline + 1n);
      await expect(escrow.connect(owner).resolveDispute(jobId, value, 0n)).to.be.revertedWith("Resolution deadline passed");
    });

    it("denies repeat resolution after settlement", async function () {
      const { owner, employer, worker, escrow } = await fixture();
      const jobId = ethers.id("resolve-repeat");
      const { value } = await disputedJob(escrow, employer, worker, jobId);
      await escrow.connect(owner).resolveDispute(jobId, value, 0n);
      await expect(escrow.connect(owner).resolveDispute(jobId, 0n, 0n)).to.be.revertedWith("Not disputed");
    });
  });

  describe("terminal timeout settlements (R4 / AC4)", function () {
    it("refunds the employer after a missed submission deadline", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("timeout-refund");
      const { value } = await fundJob(escrow, employer, worker, jobId, { submissionPeriod: 2 * HOUR });
      await escrow.connect(worker).acceptJob(jobId);
      const job = await escrow.jobs(jobId);
      await time.increaseTo(job.submissionDeadline + 1n);
      await expect(escrow.refundOnMissedSubmission(jobId))
        .to.emit(escrow, "JobRefunded")
        .withArgs(jobId, value);
      const updated = await escrow.jobs(jobId);
      expect(updated.status).to.equal(Status.Refunded);
      expect(updated.amount).to.equal(0);
      expect(await escrow.pendingWithdrawals(employer.address)).to.equal(value);
      await expect(escrow.connect(employer).withdraw()).to.changeEtherBalance(employer, value);
    });

    it("reverts refund attempts before the submission deadline", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("timeout-refund-early");
      await fundJob(escrow, employer, worker, jobId, { submissionPeriod: 2 * HOUR });
      await escrow.connect(worker).acceptJob(jobId);
      await expect(escrow.refundOnMissedSubmission(jobId)).to.be.revertedWith("Submission deadline not passed");
    });

    it("pays worker/platform/contribution normally after an undisputed review deadline", async function () {
      const { employer, worker, treasury, router, escrow } = await fixture();
      const jobId = ethers.id("timeout-settle-review");
      const routeId = ethers.id("route");
      const { value } = await fundJob(escrow, employer, worker, jobId, { reviewPeriod: 2 * DAY, routeId });
      await escrow.connect(worker).acceptJob(jobId);
      await escrow.connect(worker).submitWork(jobId, ethers.id("evidence"));
      const job = await escrow.jobs(jobId);
      await time.increaseTo(job.reviewDeadline + 1n);
      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await expect(escrow.settleAfterReviewDeadline(jobId)).to.emit(escrow, "JobCompleted");
      const platformAmount = (value * 250n) / 10000n;
      const contributionAmount = (value * 250n) / 10000n;
      const workerAmount = value - platformAmount - contributionAmount;
      expect(await router.received(routeId)).to.equal(contributionAmount);
      expect((await ethers.provider.getBalance(treasury.address)) - treasuryBefore).to.equal(platformAmount);
      expect(await escrow.pendingWithdrawals(worker.address)).to.equal(workerAmount);
      await expect(escrow.connect(worker).withdraw()).to.changeEtherBalance(worker, workerAmount);
      expect((await escrow.jobs(jobId)).status).to.equal(Status.Completed);
    });

    it("reverts undisputed settlement before the review deadline", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("timeout-settle-review-early");
      await fundJob(escrow, employer, worker, jobId, { reviewPeriod: 2 * DAY });
      await escrow.connect(worker).acceptJob(jobId);
      await escrow.connect(worker).submitWork(jobId, ethers.id("evidence"));
      await expect(escrow.settleAfterReviewDeadline(jobId)).to.be.revertedWith("Review deadline not passed");
    });

    it("splits escrow 50/50 (odd wei to worker) after an unresolved dispute deadline", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("timeout-settle-dispute");
      const value = ethers.parseEther("1") + 1n; // force an odd wei amount
      await fundJob(escrow, employer, worker, jobId, { resolutionPeriod: 2 * DAY, value });
      await escrow.connect(worker).acceptJob(jobId);
      await escrow.connect(worker).submitWork(jobId, ethers.id("evidence"));
      await escrow.connect(employer).disputeJob(jobId);
      const job = await escrow.jobs(jobId);
      await time.increaseTo(job.resolutionDeadline + 1n);
      const employerAmount = value / 2n;
      const workerAmount = value - employerAmount;
      await expect(escrow.settleAfterResolutionDeadline(jobId))
        .to.emit(escrow, "JobResolved")
        .withArgs(jobId, employerAmount, workerAmount);
      expect(await escrow.pendingWithdrawals(employer.address)).to.equal(employerAmount);
      expect(await escrow.pendingWithdrawals(worker.address)).to.equal(workerAmount);
      await expect(escrow.connect(employer).withdraw()).to.changeEtherBalance(employer, employerAmount);
      await expect(escrow.connect(worker).withdraw()).to.changeEtherBalance(worker, workerAmount);
      expect(workerAmount - employerAmount).to.equal(1n);
      expect((await escrow.jobs(jobId)).status).to.equal(Status.Resolved);
    });

    it("reverts dispute-timeout settlement before the resolution deadline", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("timeout-settle-dispute-early");
      await fundJob(escrow, employer, worker, jobId, { resolutionPeriod: 2 * DAY });
      await escrow.connect(worker).acceptJob(jobId);
      await escrow.connect(worker).submitWork(jobId, ethers.id("evidence"));
      await escrow.connect(employer).disputeJob(jobId);
      await expect(escrow.settleAfterResolutionDeadline(jobId)).to.be.revertedWith("Resolution deadline not passed");
    });

    it("settles and credits a pending withdrawal instead of reverting when the worker rejects ETH", async function () {
      const { employer, escrow, rejector } = await fixture();
      const jobId = ethers.id("timeout-transfer-failure");
      const rejectorAddress = await rejector.getAddress();
      const { value } = await fundJob(escrow, employer, { address: rejectorAddress }, jobId, { reviewPeriod: 2 * DAY });

      // worker is the ETHRejector contract; it cannot sign, so accept/submit are impersonated.
      await ethers.provider.send("hardhat_impersonateAccount", [rejectorAddress]);
      await ethers.provider.send("hardhat_setBalance", [rejectorAddress, "0x56BC75E2D63100000"]);
      const rejectorSigner = await ethers.getSigner(rejectorAddress);
      await escrow.connect(rejectorSigner).acceptJob(jobId);
      await escrow.connect(rejectorSigner).submitWork(jobId, ethers.id("evidence"));
      const job = await escrow.jobs(jobId);
      await time.increaseTo(job.reviewDeadline + 1n);

      // A reverting beneficiary must not block settlement: the call succeeds and the
      // worker's share is credited to pendingWithdrawals instead of being pushed.
      await expect(escrow.settleAfterReviewDeadline(jobId)).to.emit(escrow, "JobCompleted");
      const settled = await escrow.jobs(jobId);
      expect(settled.status).to.equal(Status.Completed);
      expect(settled.amount).to.equal(0);

      const platformAmount = (value * 250n) / 10000n;
      const workerAmount = value - platformAmount;
      expect(await escrow.pendingWithdrawals(rejectorAddress)).to.equal(workerAmount);

      // The rejecting worker still can't pull its own funds out, but that no longer
      // strands anyone else's money or blocks the job from reaching a terminal state.
      await expect(escrow.connect(rejectorSigner).withdraw()).to.be.revertedWith("Withdrawal failed");

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [rejectorAddress]);
    });

    it("denies repeat settlement after a normal approval", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("timeout-repeat-after-approve");
      await fundJob(escrow, employer, worker, jobId, { reviewPeriod: 2 * DAY });
      await escrow.connect(worker).acceptJob(jobId);
      await escrow.connect(worker).submitWork(jobId, ethers.id("evidence"));
      await escrow.connect(employer).approveWork(jobId);
      const job = await escrow.jobs(jobId);
      await time.increaseTo(job.reviewDeadline + 1n);
      await expect(escrow.settleAfterReviewDeadline(jobId)).to.be.revertedWith("Cannot settle");
    });

    it("denies late refund after the job was already refunded", async function () {
      const { employer, worker, escrow } = await fixture();
      const jobId = ethers.id("timeout-repeat-refund");
      await fundJob(escrow, employer, worker, jobId, { submissionPeriod: 2 * HOUR });
      await escrow.connect(worker).acceptJob(jobId);
      const job = await escrow.jobs(jobId);
      await time.increaseTo(job.submissionDeadline + 1n);
      await escrow.refundOnMissedSubmission(jobId);
      await expect(escrow.refundOnMissedSubmission(jobId)).to.be.revertedWith("Cannot refund");
    });
  });
});
