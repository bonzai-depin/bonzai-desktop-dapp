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

    enum Status { None, Funded, Accepted, Submitted, Completed, Cancelled }
    struct Job {
        address employer;
        address worker;
        uint256 companionTokenId;
        uint256 amount;
        bytes32 termsHash;
        bytes32 routeAssetId;
        bytes32 evidenceHash;
        Status status;
    }
    mapping(bytes32 => Job) public jobs;

    event JobFunded(bytes32 indexed jobId, address indexed employer, address indexed worker, uint256 amount, uint256 companionTokenId);
    event JobAccepted(bytes32 indexed jobId);
    event WorkSubmitted(bytes32 indexed jobId, bytes32 indexed evidenceHash);
    event JobCompleted(bytes32 indexed jobId, uint256 workerAmount, uint256 contributionAmount, uint256 platformAmount);
    event JobCancelled(bytes32 indexed jobId);

    constructor(address _treasury, address _revenueRouter) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        revenueRouter = IJobRevenueRouter(_revenueRouter);
    }

    function fundJob(bytes32 jobId, address worker, uint256 companionTokenId, bytes32 termsHash, bytes32 routeAssetId) external payable nonReentrant {
        require(jobs[jobId].status == Status.None, "Job exists");
        require(worker != address(0) && msg.value > 0 && termsHash != bytes32(0), "Invalid job");
        jobs[jobId] = Job(msg.sender, worker, companionTokenId, msg.value, termsHash, routeAssetId, bytes32(0), Status.Funded);
        emit JobFunded(jobId, msg.sender, worker, msg.value, companionTokenId);
    }

    function acceptJob(bytes32 jobId) external { Job storage job = jobs[jobId]; require(msg.sender == job.worker && job.status == Status.Funded, "Cannot accept"); job.status = Status.Accepted; emit JobAccepted(jobId); }
    function submitWork(bytes32 jobId, bytes32 evidenceHash) external { Job storage job = jobs[jobId]; require(msg.sender == job.worker && job.status == Status.Accepted, "Cannot submit"); require(evidenceHash != bytes32(0), "Evidence required"); job.evidenceHash = evidenceHash; job.status = Status.Submitted; emit WorkSubmitted(jobId, evidenceHash); }

    function approveWork(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(msg.sender == job.employer && job.status == Status.Submitted, "Cannot approve");
        job.status = Status.Completed;
        uint256 platformAmount = job.amount * platformBps / BPS;
        uint256 contributionAmount = address(revenueRouter) != address(0) && job.routeAssetId != bytes32(0) ? job.amount * contributionBps / BPS : 0;
        uint256 workerAmount = job.amount - platformAmount - contributionAmount;
        (bool treasuryPaid,) = treasury.call{value: platformAmount}(""); require(treasuryPaid, "Treasury payment failed");
        if (contributionAmount > 0) revenueRouter.depositRevenue{value: contributionAmount}(job.routeAssetId);
        (bool workerPaid,) = job.worker.call{value: workerAmount}(""); require(workerPaid, "Worker payment failed");
        emit JobCompleted(jobId, workerAmount, contributionAmount, platformAmount);
    }

    function cancelJob(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId]; require(msg.sender == job.employer && job.status == Status.Funded, "Cannot cancel");
        job.status = Status.Cancelled; uint256 amount = job.amount; job.amount = 0;
        (bool refunded,) = job.employer.call{value: amount}(""); require(refunded, "Refund failed"); emit JobCancelled(jobId);
    }
}
