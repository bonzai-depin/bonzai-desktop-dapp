// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IJobRevenueRouter {
    struct RouteRecipient { address wallet; uint16 baseBps; uint16 contributionScore; string role; }
    function depositRevenue(bytes32 assetId) external payable;
    function depositTokenRevenue(bytes32 assetId, address token, uint256 amount) external;
    function getRoute(bytes32 assetId) external view returns (
        address publisher, string memory metadataURI, bool active, uint256 createdAt,
        uint256 totalReceived, RouteRecipient[] memory recipients
    );
}

interface IJobSocialTokenFactory {
    function getToken(uint256 agentId) external view returns (address);
    function companionContract() external view returns (address);
}
interface IJobSmartAgents {
    function ownerOf(uint256 agentId) external view returns (address);
    function getAgentWallet(uint256 agentId) external view returns (address);
}
interface IJobBasketRewards {
    function registerSocialToken(uint256 agentId) external returns (address);
    function depositToken(address token, uint256 amount) external;
    function socialTokenFactory() external view returns (address);
    function rewardCurrencyEnabled(address currency) external view returns (bool);
}

/// @notice Smart-agent social-token escrow with bounded response windows and pull payments.
/// Legacy native funding is disabled once the smart-agent economy is configured.
/// @dev The owner at funding is the agreed, immutable arbitrator for that job.
/// Workers accept the published deadlines/arbitrator by calling acceptJob.
/// Dispute expiry follows the state before dispute: submitted work pays the
/// worker; otherwise the employer receives a refund. No judgment of evidence is
/// performed onchain. Parties can instead agree a gross worker/refund split.
contract BonzaiJobEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint16 public constant BPS = 10_000;
    uint16 public constant platformBps = 250;
    uint16 public constant contributionBps = 250;
    uint256 public constant ACCEPT_WINDOW = 7 days;
    uint256 public constant DELIVERY_WINDOW = 30 days;
    uint256 public constant REVIEW_WINDOW = 7 days;
    uint256 public constant DISPUTE_WINDOW = 14 days;
    uint256 public constant ROUTING_RETRY_WINDOW = 30 days;
    uint256 public constant ROUTING_GAS_LIMIT = 3_000_000;
    uint256 public constant BASKET_GAS_LIMIT = 500_000;
    uint256 public constant MAX_ROUTE_RECIPIENTS = 64;
    address public immutable treasury;
    IJobRevenueRouter public immutable revenueRouter;
    IJobSocialTokenFactory public socialTokenFactory;
    IJobSmartAgents public smartAgents;
    IJobBasketRewards public basketRewards;
    uint16 public constant holderPlatformShareBps = 5000;

    // Existing terminal status values are preserved for indexers.
    enum Status { None, Funded, Accepted, Submitted, Completed, Cancelled, Disputed }
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
    struct Terms {
        address arbitrator;
        uint64 acceptBy;
        uint64 deliverBy;
        uint64 reviewBy;
        uint64 resolveBy;
        Status disputedFrom;
    }
    struct SettlementProposal { address proposer; uint16 workerBps; }
    struct FallbackRecipient { address wallet; uint16 baseBps; }

    mapping(bytes32 => Job) public jobs;
    mapping(bytes32 => Terms) public jobTerms;
    mapping(bytes32 => SettlementProposal) public settlementProposals;
    mapping(address => uint256) public withdrawable;
    mapping(bytes32 => uint256) public pendingContributions;
    mapping(bytes32 => uint256) public contributionFallbackAt;
    mapping(bytes32 => FallbackRecipient[]) private fallbackRecipients;
    uint256 public totalEscrowed;
    uint256 public totalWithdrawable;
    uint256 public totalPendingContributions;
    mapping(bytes32 => address) public jobCurrency;
    mapping(address => mapping(address => uint256)) public tokenWithdrawable;
    mapping(address => uint256) public tokenEscrowed;
    mapping(address => uint256) public tokenTotalWithdrawable;
    mapping(address => uint256) public tokenPendingContributions;
    mapping(address => uint256) public pendingBasketFees;

    event SmartAgentEconomyConfigured(address indexed factory, address indexed agents, address indexed rewards);
    event JobCurrencySelected(bytes32 indexed jobId, address indexed currency);
    event TokenPaymentWithdrawn(address indexed currency, address indexed payee, address indexed recipient, uint256 amount);
    event BasketFeesRouted(address indexed currency, uint256 amount);
    event BasketFeeRoutingFailed(address indexed currency, uint256 amount);

    event JobFunded(bytes32 indexed jobId, address indexed employer, address indexed worker, uint256 amount, uint256 companionTokenId);
    event JobTermsPublished(bytes32 indexed jobId, address indexed arbitrator, uint256 acceptBy);
    event JobAccepted(bytes32 indexed jobId);
    event DeliveryDeadlineSet(bytes32 indexed jobId, uint256 deliverBy);
    event WorkSubmitted(bytes32 indexed jobId, bytes32 indexed evidenceHash);
    event ReviewDeadlineSet(bytes32 indexed jobId, uint256 reviewBy);
    event JobCompleted(bytes32 indexed jobId, uint256 workerAmount, uint256 contributionAmount, uint256 platformAmount);
    event JobCancelled(bytes32 indexed jobId);
    event JobDisputed(bytes32 indexed jobId, address indexed party, bytes32 reasonHash, uint256 resolveBy);
    event SettlementProposed(bytes32 indexed jobId, address indexed proposer, uint16 workerBps);
    event JobSettled(bytes32 indexed jobId, uint16 workerBps, uint256 employerRefund);
    event PaymentWithdrawn(address indexed payee, address indexed recipient, uint256 amount);
    event ContributionQueued(bytes32 indexed jobId, bytes32 indexed routeAssetId, uint256 amount, uint256 fallbackAt);
    event ContributionRouted(bytes32 indexed jobId, uint256 amount);
    event ContributionRoutingFailed(bytes32 indexed jobId);
    event ContributionFallbackPaid(bytes32 indexed jobId, uint256 amount);

    constructor(address _treasury, address _revenueRouter) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        require(_revenueRouter == address(0) || _revenueRouter.code.length > 0, "Invalid router");
        treasury = _treasury;
        revenueRouter = IJobRevenueRouter(_revenueRouter);
    }

    function fundJob(bytes32 jobId, address worker, uint256 companionTokenId, bytes32 termsHash, bytes32 routeAssetId, address expectedArbitrator) external payable nonReentrant {
        require(address(socialTokenFactory) == address(0), "Use smart-agent token funding");
        _fundJob(jobId, worker, companionTokenId, msg.value, termsHash, routeAssetId, expectedArbitrator);
        totalEscrowed += msg.value;
    }

    /// @notice One-time wiring; job currencies and counterparties cannot be replaced later.
    function configureSmartAgentEconomy(address factory, address rewards) external onlyOwner {
        require(address(socialTokenFactory) == address(0), "Economy already configured");
        require(factory.code.length > 0 && rewards.code.length > 0, "Invalid economy contracts");
        address agents = IJobSocialTokenFactory(factory).companionContract();
        require(agents.code.length > 0, "Invalid smart agents");
        require(IJobBasketRewards(rewards).socialTokenFactory() == factory, "Reward factory mismatch");
        socialTokenFactory = IJobSocialTokenFactory(factory);
        smartAgents = IJobSmartAgents(agents);
        basketRewards = IJobBasketRewards(rewards);
        emit SmartAgentEconomyConfigured(factory, agents, rewards);
    }

    function fundTokenJob(bytes32 jobId, address worker, uint256 companionTokenId, uint256 amount, bytes32 termsHash, bytes32 routeAssetId, address expectedArbitrator) external nonReentrant {
        require(address(socialTokenFactory) != address(0), "Smart-agent economy unavailable");
        require(socialTokenFactory.companionContract() == address(smartAgents), "Smart-agent registry changed");
        address currency = socialTokenFactory.getToken(companionTokenId);
        require(currency != address(0) && currency.code.length > 0, "Smart-agent token not issued");
        require(worker == smartAgents.ownerOf(companionTokenId) || worker == smartAgents.getAgentWallet(companionTokenId), "Worker does not control smart agent");
        require(basketRewards.registerSocialToken(companionTokenId) == currency, "Reward currency mismatch");
        require(basketRewards.rewardCurrencyEnabled(currency), "Smart-agent currency unavailable");
        _fundJob(jobId, worker, companionTokenId, amount, termsHash, routeAssetId, expectedArbitrator);
        jobCurrency[jobId] = currency;
        tokenEscrowed[currency] += amount;
        uint256 beforeBalance = IERC20(currency).balanceOf(address(this));
        IERC20(currency).safeTransferFrom(msg.sender, address(this), amount);
        require(IERC20(currency).balanceOf(address(this)) - beforeBalance == amount, "Unsupported transfer fee");
        emit JobCurrencySelected(jobId, currency);
    }

    function _fundJob(bytes32 jobId, address worker, uint256 companionTokenId, uint256 amount, bytes32 termsHash, bytes32 routeAssetId, address expectedArbitrator) private {
        require(jobs[jobId].status == Status.None, "Job exists");
        require(jobId != bytes32(0) && worker != address(0) && amount > 0 && termsHash != bytes32(0), "Invalid job");
        address arbitrator = owner();
        require(arbitrator == expectedArbitrator, "Arbitrator changed");
        require(arbitrator != address(0) && arbitrator != msg.sender && arbitrator != worker, "Independent arbitrator required");
        if (routeAssetId != bytes32(0)) _snapshotRoute(jobId, routeAssetId);
        jobs[jobId] = Job(msg.sender, worker, companionTokenId, amount, termsHash, routeAssetId, bytes32(0), Status.Funded);
        jobTerms[jobId].arbitrator = arbitrator;
        jobTerms[jobId].acceptBy = uint64(block.timestamp + ACCEPT_WINDOW);
        emit JobFunded(jobId, msg.sender, worker, amount, companionTokenId);
        emit JobTermsPublished(jobId, arbitrator, block.timestamp + ACCEPT_WINDOW);
    }

    function acceptJob(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.worker && job.status == Status.Funded, "Cannot accept");
        require(block.timestamp <= jobTerms[jobId].acceptBy, "Acceptance expired");
        job.status = Status.Accepted;
        jobTerms[jobId].deliverBy = uint64(block.timestamp + DELIVERY_WINDOW);
        emit JobAccepted(jobId);
        emit DeliveryDeadlineSet(jobId, block.timestamp + DELIVERY_WINDOW);
    }

    function submitWork(bytes32 jobId, bytes32 evidenceHash) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.worker && job.status == Status.Accepted, "Cannot submit");
        require(block.timestamp <= jobTerms[jobId].deliverBy, "Delivery expired");
        require(evidenceHash != bytes32(0), "Evidence required");
        job.evidenceHash = evidenceHash;
        job.status = Status.Submitted;
        jobTerms[jobId].reviewBy = uint64(block.timestamp + REVIEW_WINDOW);
        delete settlementProposals[jobId];
        emit WorkSubmitted(jobId, evidenceHash);
        emit ReviewDeadlineSet(jobId, block.timestamp + REVIEW_WINDOW);
    }

    function approveWork(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(msg.sender == job.employer && job.status == Status.Submitted, "Cannot approve");
        _settle(jobId, BPS);
    }

    function cancelJob(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(msg.sender == job.employer && job.status == Status.Funded, "Cannot cancel");
        _settle(jobId, 0);
    }

    /// @notice Anyone can finalize expired jobs; credits always belong to the parties.
    function expireJob(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        Terms storage terms = jobTerms[jobId];
        uint16 workerShare;
        if (job.status == Status.Funded) require(block.timestamp > terms.acceptBy, "Not expired");
        else if (job.status == Status.Accepted) require(block.timestamp > terms.deliverBy, "Not expired");
        else if (job.status == Status.Submitted) {
            require(block.timestamp > terms.reviewBy, "Not expired");
            workerShare = BPS;
        } else if (job.status == Status.Disputed) {
            require(block.timestamp > terms.resolveBy, "Not expired");
            workerShare = terms.disputedFrom == Status.Submitted ? BPS : 0;
        } else revert("Cannot expire");
        _settle(jobId, workerShare);
    }

    function raiseDispute(bytes32 jobId, bytes32 reasonHash) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.employer || msg.sender == job.worker, "Not a party");
        require(reasonHash != bytes32(0), "Reason required");
        Terms storage terms = jobTerms[jobId];
        require((job.status == Status.Accepted && block.timestamp <= terms.deliverBy)
            || (job.status == Status.Submitted && block.timestamp <= terms.reviewBy), "Cannot dispute");
        terms.disputedFrom = job.status;
        terms.resolveBy = uint64(block.timestamp + DISPUTE_WINDOW);
        job.status = Status.Disputed;
        delete settlementProposals[jobId];
        emit JobDisputed(jobId, msg.sender, reasonHash, terms.resolveBy);
    }

    /// @param workerShareBps Gross portion awarded to the worker, before escrow fees.
    function resolveDispute(bytes32 jobId, uint16 workerShareBps) external nonReentrant {
        require(jobs[jobId].status == Status.Disputed && msg.sender == jobTerms[jobId].arbitrator, "Not job arbitrator");
        require(block.timestamp <= jobTerms[jobId].resolveBy, "Resolution expired");
        _settle(jobId, workerShareBps);
    }

    function proposeSettlement(bytes32 jobId, uint16 workerShareBps) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.employer || msg.sender == job.worker, "Not a party");
        require(_unresolved(job.status) && workerShareBps <= BPS, "Invalid settlement");
        settlementProposals[jobId] = SettlementProposal(msg.sender, workerShareBps);
        emit SettlementProposed(jobId, msg.sender, workerShareBps);
    }

    function acceptSettlement(bytes32 jobId, uint16 expectedWorkerBps) external nonReentrant {
        Job storage job = jobs[jobId];
        SettlementProposal memory proposal = settlementProposals[jobId];
        require(msg.sender == job.employer || msg.sender == job.worker, "Not a party");
        require(proposal.proposer != address(0) && proposal.proposer != msg.sender && proposal.workerBps == expectedWorkerBps, "No matching proposal");
        require(_unresolved(job.status), "Job settled");
        _settle(jobId, proposal.workerBps);
    }

    /// @notice Recipient contracts may withdraw to an alternative payable wallet.
    function withdrawPayments(address payable recipient) external nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        uint256 amount = withdrawable[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        withdrawable[msg.sender] = 0;
        totalWithdrawable -= amount;
        (bool paid,) = recipient.call{value: amount}("");
        require(paid, "Payment failed");
        emit PaymentWithdrawn(msg.sender, recipient, amount);
    }

    function withdrawTokenPayments(address currency, address recipient) external nonReentrant {
        require(currency != address(0) && recipient != address(0), "Invalid recipient or currency");
        uint256 amount = tokenWithdrawable[currency][msg.sender];
        require(amount > 0, "Nothing to withdraw");
        tokenWithdrawable[currency][msg.sender] = 0;
        tokenTotalWithdrawable[currency] -= amount;
        IERC20(currency).safeTransfer(recipient, amount);
        emit TokenPaymentWithdrawn(currency, msg.sender, recipient, amount);
    }

    /// @notice Fee delivery cannot block settlement, refunds or worker withdrawals.
    function routeBasketFees(address currency) external nonReentrant {
        uint256 amount = pendingBasketFees[currency];
        require(amount > 0, "No basket fees");
        require(_tryBasketFees(currency, amount), "Basket routing unavailable");
    }

    function _tryBasketFees(address currency, uint256 amount) private returns (bool routed) {
        require(gasleft() >= BASKET_GAS_LIMIT * 64 / 63 + 100_000, "Insufficient basket routing gas");
        pendingBasketFees[currency] -= amount;
        IERC20(currency).forceApprove(address(basketRewards), amount);
        try basketRewards.depositToken{gas: BASKET_GAS_LIMIT}(currency, amount) {
            routed = true;
            emit BasketFeesRouted(currency, amount);
        } catch {
            pendingBasketFees[currency] += amount;
            emit BasketFeeRoutingFailed(currency, amount);
        }
        IERC20(currency).forceApprove(address(basketRewards), 0);
    }

    /// @notice Routing cannot block job settlement or any party's withdrawal.
    function routeContribution(bytes32 jobId) external nonReentrant returns (bool) {
        uint256 amount = pendingContributions[jobId];
        require(amount > 0, "No pending contribution");
        return _tryRoute(jobId, amount);
    }

    function _tryRoute(bytes32 jobId, uint256 amount) private returns (bool) {
        // EIP-150 can silently forward less than the requested gas. A caller
        // must not manufacture a routing failure by starving a healthy router.
        // The margin covers value-call overhead and the state writes below.
        require(gasleft() >= ROUTING_GAS_LIMIT * 64 / 63 + 100_000, "Insufficient routing gas");
        pendingContributions[jobId] = 0;
        address currency = jobCurrency[jobId];
        if (currency != address(0)) {
            tokenPendingContributions[currency] -= amount;
            IERC20(currency).forceApprove(address(revenueRouter), amount);
            try revenueRouter.depositTokenRevenue{gas: ROUTING_GAS_LIMIT}(jobs[jobId].routeAssetId, currency, amount) {
                IERC20(currency).forceApprove(address(revenueRouter), 0);
                emit ContributionRouted(jobId, amount);
                return true;
            } catch {
                IERC20(currency).forceApprove(address(revenueRouter), 0);
                pendingContributions[jobId] = amount;
                tokenPendingContributions[currency] += amount;
                emit ContributionRoutingFailed(jobId);
                return false;
            }
        }
        totalPendingContributions -= amount;
        // Bound a broken router's gas use, leaving room for recovery bookkeeping.
        try revenueRouter.depositRevenue{value: amount, gas: ROUTING_GAS_LIMIT}(jobs[jobId].routeAssetId) {
            emit ContributionRouted(jobId, amount);
            return true;
        } catch {
            pendingContributions[jobId] = amount;
            totalPendingContributions += amount;
            emit ContributionRoutingFailed(jobId);
            return false;
        }
    }

    /// @notice After the retry period, base contributors receive the entire
    /// royalty pool directly. Optional router staking bonuses/fees are bypassed;
    /// neither job party nor the arbitrator can redirect contributor royalties.
    function distributeContributionFallback(bytes32 jobId) external nonReentrant {
        uint256 amount = pendingContributions[jobId];
        require(amount > 0, "No pending contribution");
        require(block.timestamp >= contributionFallbackAt[jobId], "Routing retry window");
        // Preserve the registered route whenever it is usable, even after the
        // retry period; callers cannot choose to bypass it while it works.
        if (_tryRoute(jobId, amount)) return;
        pendingContributions[jobId] = 0;
        address currency = jobCurrency[jobId];
        if (currency == address(0)) totalPendingContributions -= amount;
        else tokenPendingContributions[currency] -= amount;
        FallbackRecipient[] storage recipients = fallbackRecipients[jobId];
        uint256 lastPositive;
        for (uint256 i; i < recipients.length; ++i) if (recipients[i].baseBps > 0) lastPositive = i;
        uint256 allocated;
        for (uint256 i; i < recipients.length; ++i) {
            uint256 share = i == lastPositive ? amount - allocated : amount * recipients[i].baseBps / BPS;
            allocated += share;
            _credit(currency, recipients[i].wallet, share);
        }
        emit ContributionFallbackPaid(jobId, amount);
    }

    function getFallbackRecipients(bytes32 jobId) external view returns (FallbackRecipient[] memory) { return fallbackRecipients[jobId]; }

    function _snapshotRoute(bytes32 jobId, bytes32 routeAssetId) private {
        require(address(revenueRouter) != address(0), "Router unavailable");
        (address publisher,, bool active,,, IJobRevenueRouter.RouteRecipient[] memory recipients) = revenueRouter.getRoute(routeAssetId);
        require(publisher != address(0) && active && recipients.length > 0 && recipients.length <= MAX_ROUTE_RECIPIENTS, "Invalid route");
        uint256 totalBps;
        for (uint256 i; i < recipients.length; ++i) {
            require(recipients[i].wallet != address(0), "Invalid route recipient");
            totalBps += recipients[i].baseBps;
            fallbackRecipients[jobId].push(FallbackRecipient(recipients[i].wallet, recipients[i].baseBps));
        }
        require(totalBps == BPS, "Invalid route shares");
    }

    function _settle(bytes32 jobId, uint16 workerShareBps) private {
        require(workerShareBps <= BPS, "Invalid worker share");
        Job storage job = jobs[jobId];
        uint256 grossWorker = job.amount * workerShareBps / BPS;
        uint256 refund = job.amount - grossWorker;
        uint256 platformAmount = grossWorker * platformBps / BPS;
        uint256 contributionAmount = job.routeAssetId != bytes32(0) ? grossWorker * contributionBps / BPS : 0;
        uint256 workerAmount = grossWorker - platformAmount - contributionAmount;
        job.status = workerShareBps == 0 ? Status.Cancelled : Status.Completed;
        delete settlementProposals[jobId];
        address currency = jobCurrency[jobId];
        if (currency == address(0)) totalEscrowed -= job.amount;
        else tokenEscrowed[currency] -= job.amount;
        _credit(currency, job.employer, refund);
        _credit(currency, job.worker, workerAmount);
        uint256 holderAmount = currency == address(0) ? 0 : platformAmount * holderPlatformShareBps / BPS;
        _credit(currency, treasury, platformAmount - holderAmount);
        if (holderAmount > 0) pendingBasketFees[currency] += holderAmount;
        if (contributionAmount > 0) {
            pendingContributions[jobId] = contributionAmount;
            contributionFallbackAt[jobId] = block.timestamp + ROUTING_RETRY_WINDOW;
            if (currency == address(0)) totalPendingContributions += contributionAmount;
            else tokenPendingContributions[currency] += contributionAmount;
            emit ContributionQueued(jobId, job.routeAssetId, contributionAmount, contributionFallbackAt[jobId]);
        }
        if (workerShareBps == 0) emit JobCancelled(jobId);
        else emit JobCompleted(jobId, workerAmount, contributionAmount, platformAmount);
        emit JobSettled(jobId, workerShareBps, refund);
        if (holderAmount > 0) _tryBasketFees(currency, holderAmount);
    }

    function _credit(address currency, address recipient, uint256 amount) private {
        if (currency == address(0)) {
            withdrawable[recipient] += amount;
            totalWithdrawable += amount;
        } else {
            tokenWithdrawable[currency][recipient] += amount;
            tokenTotalWithdrawable[currency] += amount;
        }
    }

    function _unresolved(Status status) private pure returns (bool) {
        return status == Status.Funded || status == Status.Accepted || status == Status.Submitted || status == Status.Disputed;
    }
}
