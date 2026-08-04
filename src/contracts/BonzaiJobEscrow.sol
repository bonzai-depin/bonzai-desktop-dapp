// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IJobRevenueRouter {
    function depositRevenue(bytes32 assetId) external payable;
}

contract BonzaiJobEscrow is Ownable, ReentrancyGuard {
    uint16 public constant BPS = 10_000;
    uint16 public platformBps = 250;
    uint16 public contributionBps = 250;
    address public treasury;
    IJobRevenueRouter public revenueRouter;
    address public resolver;

    uint256 public constant MIN_SUBMISSION_PERIOD = 1 hours;
    uint256 public constant MAX_SUBMISSION_PERIOD = 30 days;
    uint256 public constant MIN_REVIEW_PERIOD = 24 hours;
    uint256 public constant MAX_REVIEW_PERIOD = 14 days;
    uint256 public constant MIN_RESOLUTION_PERIOD = 24 hours;
    uint256 public constant MAX_RESOLUTION_PERIOD = 30 days;

    enum Status { None, Funded, Accepted, Submitted, Completed, Cancelled, Disputed, Resolved, Refunded }
    struct Job {
        address employer;
        address worker;
        uint256 companionTokenId;
        uint256 amount;
        bytes32 termsHash;
        bytes32 routeAssetId;
        bytes32 evidenceHash;
        Status status;
        uint64 submissionPeriod;
        uint64 reviewPeriod;
        uint64 resolutionPeriod;
        uint64 submissionDeadline;
        uint64 reviewDeadline;
        uint64 resolutionDeadline;
    }
    mapping(bytes32 => Job) public jobs;
    mapping(address => uint256) public pendingWithdrawals;

    event JobFunded(bytes32 indexed jobId, address indexed employer, address indexed worker, uint256 amount, uint256 companionTokenId);
    event JobAccepted(bytes32 indexed jobId, uint256 submissionDeadline);
    event WorkSubmitted(bytes32 indexed jobId, bytes32 indexed evidenceHash, uint256 reviewDeadline);
    event JobCompleted(bytes32 indexed jobId, uint256 workerAmount, uint256 contributionAmount, uint256 platformAmount);
    event JobCancelled(bytes32 indexed jobId);
    event JobDisputed(bytes32 indexed jobId, uint256 resolutionDeadline);
    event JobResolved(bytes32 indexed jobId, uint256 employerAmount, uint256 workerAmount);
    event JobRefunded(bytes32 indexed jobId, uint256 amount);
    event ResolverUpdated(address indexed resolver);
    event Withdrawal(address indexed account, uint256 amount);

    constructor(address _treasury, address _revenueRouter) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        revenueRouter = IJobRevenueRouter(_revenueRouter);
    }

    modifier onlyResolver() {
        require(msg.sender == owner() || msg.sender == resolver, "Not authorized resolver");
        _;
    }

    function setResolver(address _resolver) external onlyOwner {
        resolver = _resolver;
        emit ResolverUpdated(_resolver);
    }

    /// @notice Employer/worker payouts are credited here instead of pushed, so a beneficiary
    /// that reverts on receive cannot block the other party's payout or a settlement path.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool sent,) = msg.sender.call{value: amount}("");
        require(sent, "Withdrawal failed");
        emit Withdrawal(msg.sender, amount);
    }

    function fundJob(
        bytes32 jobId,
        address worker,
        uint256 companionTokenId,
        bytes32 termsHash,
        bytes32 routeAssetId,
        uint64 submissionPeriod,
        uint64 reviewPeriod,
        uint64 resolutionPeriod
    ) external payable nonReentrant {
        require(jobs[jobId].status == Status.None, "Job exists");
        require(worker != address(0) && msg.value > 0 && termsHash != bytes32(0), "Invalid job");
        require(submissionPeriod >= MIN_SUBMISSION_PERIOD && submissionPeriod <= MAX_SUBMISSION_PERIOD, "Invalid submission period");
        require(reviewPeriod >= MIN_REVIEW_PERIOD && reviewPeriod <= MAX_REVIEW_PERIOD, "Invalid review period");
        require(resolutionPeriod >= MIN_RESOLUTION_PERIOD && resolutionPeriod <= MAX_RESOLUTION_PERIOD, "Invalid resolution period");
        Job storage job = jobs[jobId];
        job.employer = msg.sender;
        job.worker = worker;
        job.companionTokenId = companionTokenId;
        job.amount = msg.value;
        job.termsHash = termsHash;
        job.routeAssetId = routeAssetId;
        job.status = Status.Funded;
        job.submissionPeriod = submissionPeriod;
        job.reviewPeriod = reviewPeriod;
        job.resolutionPeriod = resolutionPeriod;
        emit JobFunded(jobId, msg.sender, worker, msg.value, companionTokenId);
    }

    function acceptJob(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.worker && job.status == Status.Funded, "Cannot accept");
        job.status = Status.Accepted;
        job.submissionDeadline = uint64(block.timestamp) + job.submissionPeriod;
        emit JobAccepted(jobId, job.submissionDeadline);
    }

    function submitWork(bytes32 jobId, bytes32 evidenceHash) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.worker && job.status == Status.Accepted, "Cannot submit");
        require(block.timestamp <= job.submissionDeadline, "Submission deadline passed");
        require(evidenceHash != bytes32(0), "Evidence required");
        job.evidenceHash = evidenceHash;
        job.status = Status.Submitted;
        job.reviewDeadline = uint64(block.timestamp) + job.reviewPeriod;
        emit WorkSubmitted(jobId, evidenceHash, job.reviewDeadline);
    }

    function approveWork(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(msg.sender == job.employer && job.status == Status.Submitted, "Cannot approve");
        job.status = Status.Completed;
        uint256 amount = job.amount;
        job.amount = 0;
        uint256 platformAmount = amount * platformBps / BPS;
        uint256 contributionAmount = address(revenueRouter) != address(0) && job.routeAssetId != bytes32(0) ? amount * contributionBps / BPS : 0;
        uint256 workerAmount = amount - platformAmount - contributionAmount;
        (bool treasuryPaid,) = treasury.call{value: platformAmount}(""); require(treasuryPaid, "Treasury payment failed");
        if (contributionAmount > 0) revenueRouter.depositRevenue{value: contributionAmount}(job.routeAssetId);
        pendingWithdrawals[job.worker] += workerAmount;
        emit JobCompleted(jobId, workerAmount, contributionAmount, platformAmount);
    }

    function cancelJob(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId]; require(msg.sender == job.employer && job.status == Status.Funded, "Cannot cancel");
        job.status = Status.Cancelled; uint256 amount = job.amount; job.amount = 0;
        pendingWithdrawals[job.employer] += amount; emit JobCancelled(jobId);
    }

    /// @notice Employer disputes submitted work before the review deadline elapses.
    function disputeJob(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.employer && job.status == Status.Submitted, "Cannot dispute");
        require(block.timestamp <= job.reviewDeadline, "Review deadline passed");
        job.status = Status.Disputed;
        job.resolutionDeadline = uint64(block.timestamp) + job.resolutionPeriod;
        emit JobDisputed(jobId, job.resolutionDeadline);
    }

    /// @notice Owner or authorized resolver allocates escrowed funds between employer and worker while disputed.
    function resolveDispute(bytes32 jobId, uint256 employerAmount, uint256 workerAmount) external nonReentrant onlyResolver {
        Job storage job = jobs[jobId];
        require(job.status == Status.Disputed, "Not disputed");
        require(block.timestamp <= job.resolutionDeadline, "Resolution deadline passed");
        uint256 amount = job.amount;
        require(employerAmount + workerAmount == amount, "Allocation must equal escrow");
        job.status = Status.Resolved;
        job.amount = 0;
        if (employerAmount > 0) pendingWithdrawals[job.employer] += employerAmount;
        if (workerAmount > 0) pendingWithdrawals[job.worker] += workerAmount;
        emit JobResolved(jobId, employerAmount, workerAmount);
    }

    /// @notice Employer reclaims escrow after the worker misses the submission deadline.
    function refundOnMissedSubmission(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == Status.Accepted, "Cannot refund");
        require(block.timestamp > job.submissionDeadline, "Submission deadline not passed");
        job.status = Status.Refunded;
        uint256 amount = job.amount;
        job.amount = 0;
        pendingWithdrawals[job.employer] += amount;
        emit JobRefunded(jobId, amount);
    }

    /// @notice Anyone may settle an undisputed submission once the review deadline has elapsed, paying out as normal approval would.
    function settleAfterReviewDeadline(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == Status.Submitted, "Cannot settle");
        require(block.timestamp > job.reviewDeadline, "Review deadline not passed");
        job.status = Status.Completed;
        uint256 amount = job.amount;
        job.amount = 0;
        uint256 platformAmount = amount * platformBps / BPS;
        uint256 contributionAmount = address(revenueRouter) != address(0) && job.routeAssetId != bytes32(0) ? amount * contributionBps / BPS : 0;
        uint256 workerAmount = amount - platformAmount - contributionAmount;
        (bool treasuryPaid,) = treasury.call{value: platformAmount}(""); require(treasuryPaid, "Treasury payment failed");
        if (contributionAmount > 0) revenueRouter.depositRevenue{value: contributionAmount}(job.routeAssetId);
        pendingWithdrawals[job.worker] += workerAmount;
        emit JobCompleted(jobId, workerAmount, contributionAmount, platformAmount);
    }

    /// @notice Anyone may settle an unresolved dispute once the resolution deadline has elapsed with a deterministic 50/50 split (odd wei to the worker).
    function settleAfterResolutionDeadline(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == Status.Disputed, "Cannot settle");
        require(block.timestamp > job.resolutionDeadline, "Resolution deadline not passed");
        job.status = Status.Resolved;
        uint256 amount = job.amount;
        job.amount = 0;
        uint256 employerAmount = amount / 2;
        uint256 workerAmount = amount - employerAmount;
        pendingWithdrawals[job.employer] += employerAmount;
        pendingWithdrawals[job.worker] += workerAmount;
        emit JobResolved(jobId, employerAmount, workerAmount);
    }
}
