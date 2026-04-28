// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IBonzaiMintPool {
    function isEpochFinalized(uint256 epochId) external view returns (bool);
    function currentEpoch() external view returns (uint256);
    function withdrawProviderShare(
        uint256 epochId,
        uint8 poolIndex,
        address provider,
        uint256 providerTime,
        uint256 totalTime
    ) external returns (uint256 amount);
}

interface IProviderRegistry {
    function recordEarnings(address provider, uint256 amount) external;
}

/**
 * @title BonzaiServiceTime
 * @notice Free P2P inference accounting via direct provider self-reporting.
 *
 * Design (post-H2 redesign — no EIP-712 sessions):
 *   - Inference is FREE to consumers. No per-request payment, no signatures.
 *   - The provider measures the actual elapsed wall-clock time between
 *     receiving a request and delivering the response, then records that
 *     elapsed time on-chain via `recordServiceTime(pipelineId, seconds)`.
 *   - Provider rewards = (provider_seconds / total_seconds) × pool_provider_side
 *     for the epoch the recording lands in.
 *   - Consumers do NOT touch the chain. Mobile-app users consume inference
 *     freely without any Web3 wallet — the provider trusts the request, the
 *     measurement, and self-reports honestly. Pool dilution + the provider
 *     LVL gate are the only sybil deterrents.
 *
 * Sybil resistance (LVL gate, provider only):
 *   - The reporting provider must hold >= 1000 BONZAI on Arbitrum at the
 *     moment of `recordServiceTime` (and at claim time).
 *   - balanceOf is read locally from the Arbitrum BONZAI contract.
 *
 * Per-call safety:
 *   - `MAX_RECORD_DURATION` (24h) caps a single record. Honest providers
 *     accumulate multiple records over an epoch.
 *
 * Pipeline -> pool mapping:
 *   0  LLM            -> 0 text       1..4 IMAGE_*       -> 2 image
 *   5..8 AUDIO/MUSIC  -> 1 audio      9 VIDEO_FAST       -> 3 video
 *   10 VISION         -> 2 image      11 PIPELINE_SHARD  -> 0 text
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

    /// @notice Provider sybil threshold: must hold >= this BONZAI to record.
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
    bool public claimsPaused;

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
    event ProviderRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);

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

    /**
     * @notice Record `secondsServed` of inference time for `pipelineId`,
     *         credited to the caller in the current epoch.
     * @dev Provider-only. Provider must hold >= LVL1_THRESHOLD BONZAI.
     *      `secondsServed` must be in [1, MAX_RECORD_DURATION].
     *      Consumers don't sign anything — providers self-report and earn
     *      against pool dilution. No per-request signatures.
     */
    function recordServiceTime(uint8 pipelineId, uint256 secondsServed)
        external
        nonReentrant
        whenNotPaused
    {
        if (bonzaiToken.balanceOf(msg.sender) < LVL1_THRESHOLD) revert ProviderBelowLvl1();
        if (secondsServed == 0 || secondsServed > MAX_RECORD_DURATION) revert InvalidDuration();

        uint8 poolIndex = _pipelineToPool(pipelineId);
        uint256 epochId = mintPool.currentEpoch();

        providerServiceTime[epochId][poolIndex][msg.sender] += secondsServed;
        totalServiceTime[epochId][poolIndex] += secondsServed;

        emit ServiceTimeRecorded(msg.sender, poolIndex, epochId, secondsServed, pipelineId);
    }

    /**
     * @notice Batch variant — multiple records in a single tx.
     */
    struct ServiceRecord {
        uint8 pipelineId;
        uint256 secondsServed;
    }

    function recordServiceTimeBatch(ServiceRecord[] calldata records)
        external
        nonReentrant
        whenNotPaused
    {
        if (bonzaiToken.balanceOf(msg.sender) < LVL1_THRESHOLD) revert ProviderBelowLvl1();
        require(records.length > 0, "Empty batch");

        uint256 epochId = mintPool.currentEpoch();
        for (uint256 i = 0; i < records.length; ) {
            uint256 secondsServed = records[i].secondsServed;
            if (secondsServed == 0 || secondsServed > MAX_RECORD_DURATION) revert InvalidDuration();

            uint8 poolIndex = _pipelineToPool(records[i].pipelineId);
            providerServiceTime[epochId][poolIndex][msg.sender] += secondsServed;
            totalServiceTime[epochId][poolIndex] += secondsServed;

            emit ServiceTimeRecorded(msg.sender, poolIndex, epochId, secondsServed, records[i].pipelineId);
            unchecked { ++i; }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROVIDER CLAIM
    // ═══════════════════════════════════════════════════════════════════════════

    function claimProviderRewards(uint256 epochId, uint8 poolIndex)
        external
        nonReentrant
        whenNotPaused
    {
        if (claimsPaused) revert ClaimsPaused();
        if (poolIndex >= NUM_POOLS) revert InvalidPipeline();
        if (!mintPool.isEpochFinalized(epochId)) revert EpochNotFinalized();
        if (providerClaimed[epochId][poolIndex][msg.sender]) revert AlreadyClaimed();
        if (bonzaiToken.balanceOf(msg.sender) < LVL1_THRESHOLD) revert ProviderBelowLvl1();

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

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════════

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setClaimsPaused(bool paused_) external onlyOwner {
        claimsPaused = paused_;
        emit ClaimsPausedSet(paused_);
    }

    function setProviderRegistry(address registry) external onlyOwner {
        address old = address(providerRegistry);
        providerRegistry = IProviderRegistry(registry);
        emit ProviderRegistryUpdated(old, registry);
    }
}
