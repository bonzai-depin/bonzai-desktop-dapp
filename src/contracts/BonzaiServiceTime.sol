// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IBonzaiMintPool {
    function isEpochFinalized(uint256 epochId) external view returns (bool);
    function currentEpoch() external view returns (uint256);
    function stakingVault() external view returns (address);
    function withdrawProviderShare(
        uint256 epochId,
        uint8 poolIndex,
        address provider,
        uint256 providerTime,
        uint256 totalTime
    ) external returns (uint256 amount);
}

interface IBonzaiProviderStake {
    function positions(address user) external view returns (
        uint256 amount,
        uint256 lockedUntil,
        uint256 updatedAt,
        uint32 contributionScore
    );
}

interface IProviderRegistry {
    function recordEarnings(address provider, uint256 amount) external;
}

/**
 * @title BonzaiServiceTime
 * @notice Free inference with independently attested provider accounting.
 * @dev Provider self-reports cannot authorize rewards. An explicitly configured
 * trusted attestor must validate completed work and submit unique receipts.
 * Claims start paused; enabling payouts requires an operational attestor.
 * Consumers do not need a wallet. Attestation is a protocol trust boundary,
 * not a cryptographic proof that inference occurred.
 */
contract BonzaiServiceTime is Ownable, ReentrancyGuard, Pausable {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIG
    // ═══════════════════════════════════════════════════════════════════════════

    IERC20 public immutable bonzaiToken;
    IBonzaiMintPool public immutable mintPool;

    /// @notice Optional ProviderRegistry — when set, claimProviderRewards
    ///         calls recordEarnings so per-provider stats stay live.
    IProviderRegistry public providerRegistry;

    /// @notice Provider sybil threshold: must stake >= this BONZAI to record.
    uint256 public constant LVL1_THRESHOLD = 1000 * 1e18;

    /// @notice Cap on a single recordServiceTime call. Honest providers
    ///         accumulate many records; this just bounds per-call abuse.
    uint256 public constant MAX_RECORD_DURATION = 24 hours;

    uint8 public constant NUM_POOLS = 6;
    uint8 public constant POOL_TEXT = 0;
    uint8 public constant POOL_AUDIO = 1;
    uint8 public constant POOL_IMAGE = 2;
    uint8 public constant POOL_VIDEO = 3;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev epochId => poolIndex => provider => seconds served
    mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public providerServiceTime;

    /// @dev epochId => poolIndex => total seconds served across all providers
    mapping(uint256 => mapping(uint8 => uint256)) public totalServiceTime;

    /// @dev epochId => poolIndex => provider => claimed
    mapping(uint256 => mapping(uint8 => mapping(address => bool))) public providerClaimed;

    /// @notice Independent pause for provider reward claims. Lets admins
    ///         halt payouts during incident response without blocking new
    ///         service-time recording.
    bool public claimsPaused = true;
    address public serviceTimeAttestor;
    mapping(bytes32 => bool) public usedReceipts;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS / ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    event ServiceTimeRecorded(
        address indexed provider,
        uint8 indexed poolIndex,
        uint256 indexed epochId,
        uint256 secondsServed,
        uint8 pipelineId
    );
    event ProviderRewardsClaimed(
        address indexed provider,
        uint256 indexed epochId,
        uint8 indexed poolIndex,
        uint256 providerTime,
        uint256 totalTime,
        uint256 paidAmount
    );
    event RecordEarningsFailed(address indexed provider, uint256 amount, bytes reason);
    event ClaimsPausedSet(bool paused);
    event ServiceTimeAttestorUpdated(address indexed attestor);
    event ServiceReceiptRecorded(bytes32 indexed receiptHash, address indexed provider, uint256 indexed epochId);
    event ProviderRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);

    error UnverifiedServiceTime();
    error UnauthorizedAttestor();
    error InvalidReceipt();
    error ProviderBelowLvl1();
    error InvalidPipeline();
    error InvalidDuration();
    error AlreadyClaimed();
    error NoServiceTime();
    error EpochNotFinalized();
    error ClaimsPaused();

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    constructor(
        address _bonzaiToken,
        address _mintPool
    ) Ownable(msg.sender) {
        require(_bonzaiToken != address(0), "Invalid token");
        require(_mintPool != address(0), "Invalid mint pool");
        bonzaiToken = IERC20(_bonzaiToken);
        mintPool = IBonzaiMintPool(_mintPool);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROVIDER RECORD (the only entry point for accruing time)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Legacy unsigned reporting is deliberately disabled.
    function recordServiceTime(uint8, uint256) external pure { revert UnverifiedServiceTime(); }
    struct ServiceRecord { uint8 pipelineId; uint256 secondsServed; }
    function recordServiceTimeBatch(ServiceRecord[] calldata) external pure { revert UnverifiedServiceTime(); }

    function recordVerifiedServiceTime(
        address provider, uint8 pipelineId, uint256 secondsServed, uint256 epochId, bytes32 receiptHash
    ) external nonReentrant whenNotPaused {
        if (msg.sender != serviceTimeAttestor || serviceTimeAttestor == address(0)) revert UnauthorizedAttestor();
        if (provider == address(0) || receiptHash == bytes32(0) || usedReceipts[receiptHash]) revert InvalidReceipt();
        require(epochId == mintPool.currentEpoch() && !mintPool.isEpochFinalized(epochId), "Invalid receipt epoch");
        if (_providerStake(provider) < LVL1_THRESHOLD) revert ProviderBelowLvl1();
        if (secondsServed == 0 || secondsServed > MAX_RECORD_DURATION) revert InvalidDuration();
        uint8 poolIndex = _pipelineToPool(pipelineId);
        usedReceipts[receiptHash] = true;
        providerServiceTime[epochId][poolIndex][provider] += secondsServed;
        totalServiceTime[epochId][poolIndex] += secondsServed;
        emit ServiceTimeRecorded(provider, poolIndex, epochId, secondsServed, pipelineId);
        emit ServiceReceiptRecorded(receiptHash, provider, epochId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROVIDER CLAIM
    // ═══════════════════════════════════════════════════════════════════════════

    function claimProviderRewards(uint256 epochId, uint8 poolIndex)
        external
        nonReentrant
    {
        if (claimsPaused) revert ClaimsPaused();
        if (poolIndex >= NUM_POOLS) revert InvalidPipeline();
        if (!mintPool.isEpochFinalized(epochId)) revert EpochNotFinalized();
        if (providerClaimed[epochId][poolIndex][msg.sender]) revert AlreadyClaimed();

        uint256 providerTime = providerServiceTime[epochId][poolIndex][msg.sender];
        uint256 totalTime = totalServiceTime[epochId][poolIndex];
        if (providerTime == 0 || totalTime == 0) revert NoServiceTime();

        providerClaimed[epochId][poolIndex][msg.sender] = true;

        // MintPool returns the exact paid amount — no need for delta reads.
        uint256 paidAmount = mintPool.withdrawProviderShare(
            epochId, poolIndex, msg.sender, providerTime, totalTime
        );

        if (address(providerRegistry) != address(0) && paidAmount > 0) {
            try providerRegistry.recordEarnings(msg.sender, paidAmount) {
                // OK
            } catch (bytes memory reason) {
                emit RecordEarningsFailed(msg.sender, paidAmount, reason);
            }
        }

        emit ProviderRewardsClaimed(msg.sender, epochId, poolIndex, providerTime, totalTime, paidAmount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════════════════════

    function previewProviderRewards(
        uint256 epochId,
        uint8 poolIndex,
        address provider,
        uint256 poolProviderBalance
    ) external view returns (uint256) {
        if (poolIndex >= NUM_POOLS) return 0;
        uint256 providerTime = providerServiceTime[epochId][poolIndex][provider];
        uint256 totalTime = totalServiceTime[epochId][poolIndex];
        if (providerTime == 0 || totalTime == 0) return 0;
        return (poolProviderBalance * providerTime) / totalTime;
    }

    function pipelineToPool(uint8 pipelineId) external pure returns (uint8) {
        return _pipelineToPool(pipelineId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════════════════════

    function _pipelineToPool(uint8 pipelineId) internal pure returns (uint8) {
        if (pipelineId == 0) return POOL_TEXT;                       // LLM
        if (pipelineId >= 1 && pipelineId <= 4) return POOL_IMAGE;   // IMAGE_*
        if (pipelineId >= 5 && pipelineId <= 8) return POOL_AUDIO;   // AUDIO_* + MUSIC
        if (pipelineId == 9) return POOL_VIDEO;                      // VIDEO_FAST
        if (pipelineId == 10) return POOL_IMAGE;                     // VISION
        if (pipelineId == 11) return POOL_TEXT;                      // PIPELINE_SHARD
        revert InvalidPipeline();
    }

    function _providerStake(address provider) internal view returns (uint256) {
        address vault = mintPool.stakingVault();
        if (vault == address(0)) return 0;
        (uint256 amount,,,) = IBonzaiProviderStake(vault).positions(provider);
        return amount;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════════

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setClaimsPaused(bool paused_) external onlyOwner {
        require(paused_ || serviceTimeAttestor != address(0), "Attestor required");
        claimsPaused = paused_;
        emit ClaimsPausedSet(paused_);
    }

    function setServiceTimeAttestor(address attestor) external onlyOwner {
        serviceTimeAttestor = attestor;
        if (attestor == address(0)) { claimsPaused = true; emit ClaimsPausedSet(true); }
        emit ServiceTimeAttestorUpdated(attestor);
    }

    function setProviderRegistry(address registry) external onlyOwner {
        address old = address(providerRegistry);
        providerRegistry = IProviderRegistry(registry);
        emit ProviderRegistryUpdated(old, registry);
    }
}
