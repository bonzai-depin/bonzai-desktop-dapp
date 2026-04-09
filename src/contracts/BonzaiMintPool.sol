// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IBonzaiUnlock {
    function hasUnlocked(address user) external view returns (bool);
}

/**
 * @title BonzaiMintPool
 * @notice Epoch-based revenue pools for BONZAI LVL holders.
 *         6 pools (indexed 0-5), one per content type:
 *           0=text, 1=audio, 2=image, 3=video, 4=3D, 5=training
 *
 * Time-based epochs:
 *   Epochs advance automatically based on block.timestamp. The current epoch
 *   is always computed as (block.timestamp - genesisTime) / epochDuration.
 *   No manual finalizeEpoch() call is needed — epoch boundaries are implicit.
 *
 * Distribution model:
 *   1. Deposits accumulate during each epoch (1 week) from BonzaiContent
 *      mint fees and BonzaiRoyaltySplitter secondary sales.
 *   2. During the active epoch, BONZAI holders register their balance
 *      on-chain by calling registerForEpoch(). Registration locks the
 *      caller's BONZAI balance at that moment — one registration per
 *      wallet per epoch. Registrant must hold at least poolThresholds[0]
 *      (the lowest LVL threshold) to prevent dilution from sub-threshold
 *      registrations.
 *   3. When the epoch ends (time-based), it becomes claimable immediately.
 *   4. Registered holders claim proportional share from past pools.
 *      Share = poolDeposits * registeredBalance / totalRegistered.
 *   5. Claims are valid during epoch N+1 only (1-epoch window).
 *      Starting from epoch N+2, unclaimed funds can be swept to treasury.
 *
 * Anti-gaming:
 *   - Registration requires minimum balance (poolThresholds[0]) to prevent
 *     sub-threshold wallets from diluting the totalRegistered denominator.
 *   - At claim time, balanceOf(msg.sender) >= registeredBalance is enforced,
 *     preventing register-then-sell attacks.
 *   - Split-wallet registration inflates totalRegistered proportionally,
 *     making it self-penalizing and insolvency-proof.
 *
 * Pool thresholds match the LVL system:
 *   [1K, 5K, 10K, 25K, 33K, 50K] BONZAI tokens.
 */
contract BonzaiMintPool is Ownable, ReentrancyGuard, Pausable {
    /// @notice BONZAI ERC-20 token
    IERC20 public bonzaiToken;

    /// @notice BonzaiCompanions ERC-721 contract (required for claiming)
    IERC721 public companionNFT;

    /// @notice Treasury address for swept/surplus funds
    address public treasury;

    /// @notice BonzaiUnlock contract — unlocked users bypass pool thresholds
    IBonzaiUnlock public unlockContract;

    /// @notice Number of content-type pools
    uint256 public constant NUM_POOLS = 6;

    /// @notice Minimum block gap between confirmClaim and claimEpoch (flash loan protection)
    /// On Base (~2s blocks): 256 blocks ≈ 8.5 minutes
    uint256 public constant MIN_CLAIM_BLOCK_GAP = 256;

    /// @notice LVL thresholds per pool (in token units with 18 decimals)
    uint256[6] public poolThresholds;

    /// @notice Snapshotted thresholds per epoch (frozen at first registration)
    mapping(uint256 => uint256[6]) public epochThresholds;

    /// @notice Whether an epoch's thresholds have been snapshotted
    mapping(uint256 => bool) public epochThresholdSnapshotted;

    // ═══════════════════════════════════════════════════════════════════════════
    // TIME-BASED EPOCH CONFIG
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Genesis timestamp — epoch 0 starts here
    uint256 public immutable genesisTime;

    /// @notice Duration of each epoch in seconds (1 week, immutable)
    uint256 public immutable epochDuration;

    // ═══════════════════════════════════════════════════════════════════════════
    // EPOCH STATE
    // ═══════════════════════════════════════════════════════════════════════════

    struct EpochData {
        uint256[6] poolDeposits;        // ETH deposited during this epoch per pool
        uint256 totalRegistered;         // Sum of all registered BONZAI balances
    }

    /// @notice Epoch data by index
    mapping(uint256 => EpochData) public epochs;

    /// @notice Registered BONZAI balance per wallet per epoch (locked at registration time)
    mapping(uint256 => mapping(address => uint256)) public registeredBalances;

    /// @notice Tracks claimed status: epochId => wallet => poolIndex => claimed
    mapping(uint256 => mapping(address => mapping(uint8 => bool))) public hasClaimed;

    /// @notice Tracks total ETH claimed per epoch per pool (for sweep accounting)
    mapping(uint256 => uint256[6]) public epochClaimedPerPool;

    /// @notice Whether an epoch has been swept
    mapping(uint256 => bool) public epochSwept;

    /// @notice Block number at which a user confirmed their balance for claiming.
    ///         Must be set via confirmClaim() before calling claimEpoch/claimEpochBatch.
    ///         Claim must happen in a LATER block than confirmation to prevent
    ///         single-transaction flash loan bypass.
    mapping(uint256 => mapping(address => uint256)) public claimConfirmedBlock;

    // ═══════════════════════════════════════════════════════════════════════════
    // LIFETIME STATS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Lifetime deposited ETH per pool (across all epochs)
    uint256[6] public totalDeposited;

    /// @notice Total ETH claimed across all epochs
    uint256 public totalClaimed;

    /// @notice Total ETH swept from expired epochs
    uint256 public totalSwept;

    // ═══════════════════════════════════════════════════════════════════════════
    // AUTHORIZED DEPOSITORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice BonzaiContent contract (primary depositor)
    address public contentContract;

    /// @notice BonzaiRoyaltySplitter contract (secondary depositor)
    address public royaltySplitter;

    /// @notice BonzaiUniswapHook contract (tertiary depositor — hook fee share)
    address public feeHook;

    /// @notice Authorized minters (collection clones from BonzaiCollectiblesFactory)
    mapping(address => bool) public authorizedMinters;

    /// @notice Factory contract authorized to register new minters
    address public collectiblesFactory;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event PoolDeposit(uint8 indexed poolIndex, uint256 amount, address indexed depositor, uint256 indexed epochId);
    event EpochClaimed(uint256 indexed epochId, uint8 indexed poolIndex, address indexed claimer, uint256 amount);
    event Registered(uint256 indexed epochId, address indexed wallet, uint256 balance);
    event ContentContractUpdated(address indexed oldContract, address indexed newContract);
    event RoyaltySplitterUpdated(address indexed oldSplitter, address indexed newSplitter);
    event FeeHookUpdated(address indexed oldHook, address indexed newHook);
    event AuthorizedMinterUpdated(address indexed minter, bool authorized);
    event CollectiblesFactoryUpdated(address indexed oldFactory, address indexed newFactory);
    event PoolThresholdUpdated(uint8 indexed poolIndex, uint256 oldThreshold, uint256 newThreshold);
    event CompanionNFTUpdated(address indexed oldNFT, address indexed newNFT);
    event UnclaimedSwept(uint256 indexed epochId, uint256 amount);
    event ClaimConfirmed(uint256 indexed epochId, address indexed wallet, uint256 balance, uint256 blockNumber);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event EpochThresholdsSnapshotted(uint256 indexed epochId);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @param _bonzaiToken BONZAI ERC-20 token address
     * @param _thresholds Array of 6 thresholds in full token units (e.g. 1000 = 1000 * 1e18)
     * @param _epochDuration Duration of each epoch in seconds (e.g. 604800 = 7 days)
     * @param _treasury Treasury address for swept/surplus funds
     */
    constructor(
        address _bonzaiToken,
        uint256[6] memory _thresholds,
        uint256 _epochDuration,
        address _treasury
    ) Ownable(msg.sender) {
        require(_bonzaiToken != address(0), "Invalid token address");
        require(_epochDuration > 0, "Invalid epoch duration");
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;

        bonzaiToken = IERC20(_bonzaiToken);
        epochDuration = _epochDuration;

        // Align genesis to the start of next Monday 00:00 UTC.
        // Unix epoch (Jan 1 1970) was a Thursday, so Monday = day 4 of the week.
        // dayOfWeek: 0=Thu, 1=Fri, 2=Sat, 3=Sun, 4=Mon, 5=Tue, 6=Wed
        uint256 dayOfWeek = (block.timestamp / 1 days + 4) % 7; // 0=Mon … 6=Sun
        uint256 todayStart = (block.timestamp / 1 days) * 1 days;
        uint256 daysUntilMonday = dayOfWeek == 0 ? 7 : (7 - dayOfWeek);
        genesisTime = todayStart + daysUntilMonday * 1 days;

        for (uint8 i = 0; i < 6; i++) {
            require(_thresholds[i] > 0, "Threshold cannot be zero");
            if (i > 0) {
                require(_thresholds[i] >= _thresholds[i - 1], "Thresholds must be ascending");
            }
            poolThresholds[i] = _thresholds[i] * 1e18;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EPOCH COMPUTATION (time-based, no manual finalization)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Compute the current epoch index from block.timestamp.
     *         epoch = (block.timestamp - genesisTime) / epochDuration
     *         Returns 0 before genesis (epoch 0 starts at genesisTime).
     */
    function currentEpoch() public view returns (uint256) {
        if (block.timestamp < genesisTime) return 0;
        return (block.timestamp - genesisTime) / epochDuration;
    }

    /**
     * @notice Whether the pool system has started (genesis reached).
     */
    function hasStarted() public view returns (bool) {
        return block.timestamp >= genesisTime;
    }

    /**
     * @notice Get the start time of a given epoch
     */
    function epochStartTime(uint256 epochId) public view returns (uint256) {
        return genesisTime + (epochId * epochDuration);
    }

    /**
     * @notice Get the end time of a given epoch
     */
    function epochEndTime(uint256 epochId) public view returns (uint256) {
        return genesisTime + ((epochId + 1) * epochDuration);
    }

    /**
     * @notice Check if an epoch has ended (is finalized)
     */
    function isEpochFinalized(uint256 epochId) public view returns (bool) {
        return block.timestamp >= epochEndTime(epochId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Register your BONZAI balance for the current epoch.
     *         Must be called during the active epoch (before it ends).
     *         Locks your balance at registration time — one registration per wallet per epoch.
     *         Requires at least poolThresholds[0] (lowest LVL) to prevent
     *         sub-threshold dilution of the totalRegistered denominator.
     */
    function registerForEpoch() external {
        uint256 epochId = currentEpoch();
        require(registeredBalances[epochId][msg.sender] == 0, "Already registered");

        // Snapshot thresholds on first registration of this epoch
        if (!epochThresholdSnapshotted[epochId]) {
            for (uint8 i = 0; i < NUM_POOLS;) {
                epochThresholds[epochId][i] = poolThresholds[i];
                unchecked { i++; }
            }
            epochThresholdSnapshotted[epochId] = true;
            emit EpochThresholdsSnapshotted(epochId);
        }

        uint256 balance = bonzaiToken.balanceOf(msg.sender);
        require(balance > 0, "Must hold BONZAI tokens");

        // Unlocked users bypass the level threshold — they can register with any positive balance
        // Their reward share is still proportional to their actual BONZAI balance
        bool isUnlocked = false;
        if (address(unlockContract) != address(0)) {
            try unlockContract.hasUnlocked(msg.sender) returns (bool result) {
                isUnlocked = result;
            } catch {}
        }
        if (!isUnlocked) {
            require(balance >= epochThresholds[epochId][0], "Below minimum threshold");
        }

        registeredBalances[epochId][msg.sender] = balance;
        epochs[epochId].totalRegistered += balance;

        emit Registered(epochId, msg.sender, balance);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DEPOSIT (called by BonzaiContent or BonzaiRoyaltySplitter)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Deposit ETH into a specific content-type pool for the current epoch
     * @param poolIndex Pool index (0-5)
     */
    function depositForPool(uint8 poolIndex) external payable {
        require(
            msg.sender == contentContract || msg.sender == royaltySplitter || msg.sender == feeHook || authorizedMinters[msg.sender],
            "Unauthorized depositor"
        );
        require(poolIndex < NUM_POOLS, "Invalid pool index");
        require(msg.value > 0, "Zero deposit");

        uint256 epochId = currentEpoch();
        epochs[epochId].poolDeposits[poolIndex] += msg.value;
        totalDeposited[poolIndex] += msg.value;

        emit PoolDeposit(poolIndex, msg.value, msg.sender, epochId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CLAIM CONFIRMATION (flash loan protection)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Confirm your balance before claiming from a past epoch.
     *         Must be called in a SEPARATE BLOCK before claimEpoch/claimEpochBatch.
     *         This two-step process prevents flash loan bypass of the balance check:
     *         a flash loan must be repaid within a single transaction and cannot
     *         span across blocks.
     *
     * @param epochId The epoch you intend to claim from
     */
    function confirmClaim(uint256 epochId) external {
        require(isEpochFinalized(epochId), "Epoch not ended yet");
        uint256 current = currentEpoch();
        require(current == epochId + 1, "Claim window closed");

        uint256 balance = registeredBalances[epochId][msg.sender];
        require(balance > 0, "Not registered for this epoch");
        require(
            bonzaiToken.balanceOf(msg.sender) >= balance,
            "Balance dropped below registered amount"
        );

        claimConfirmedBlock[epochId][msg.sender] = block.number;

        emit ClaimConfirmed(epochId, msg.sender, balance, block.number);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CLAIM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Claim proportional share from a past epoch's pool.
     *         Must have registered during the epoch AND still hold at least the
     *         registered balance at claim time. This prevents register-then-sell gaming.
     *         Claims are valid during the next epoch only (1-epoch grace period):
     *         epoch N is claimable during epoch N+1. Sweep opens at N+2.
     *         Requires prior confirmClaim() call in a separate block (flash loan protection).
     *
     * @param epochId The epoch to claim from (must have ended)
     * @param poolIndex Pool index (0-5)
     */
    function claimEpoch(
        uint256 epochId,
        uint8 poolIndex
    ) external nonReentrant whenNotPaused {
        require(poolIndex < NUM_POOLS, "Invalid pool index");
        require(isEpochFinalized(epochId), "Epoch not ended yet");
        require(!hasClaimed[epochId][msg.sender][poolIndex], "Already claimed");

        // Grace period: claims valid during epoch N+1 only
        uint256 current = currentEpoch();
        require(current == epochId + 1, "Claim window closed");

        // Flash loan protection: must have confirmed balance at least 256 blocks ago
        uint256 confirmedBlock = claimConfirmedBlock[epochId][msg.sender];
        require(confirmedBlock > 0, "Must call confirmClaim first");
        require(block.number >= confirmedBlock + MIN_CLAIM_BLOCK_GAP, "Must wait 256 blocks after confirmClaim");

        uint256 balance = registeredBalances[epochId][msg.sender];
        require(balance > 0, "Not registered for this epoch");

        // Unlocked users bypass per-pool thresholds — can claim from all pools
        bool isUnlocked = false;
        if (address(unlockContract) != address(0)) {
            try unlockContract.hasUnlocked(msg.sender) returns (bool result) {
                isUnlocked = result;
            } catch {}
        }
        if (!isUnlocked) {
            uint256 threshold = epochThresholdSnapshotted[epochId]
                ? epochThresholds[epochId][poolIndex]
                : poolThresholds[poolIndex];
            require(balance >= threshold, "Below pool threshold");
        }

        EpochData storage epoch = epochs[epochId];
        require(epoch.totalRegistered > 0, "No registrations");

        // Must still hold at least the registered balance to prevent register-then-sell
        require(bonzaiToken.balanceOf(msg.sender) >= balance, "Balance dropped below registered amount");

        uint256 epochDeposits = epoch.poolDeposits[poolIndex];
        require(epochDeposits > 0, "No deposits in this pool");

        uint256 amount = (epochDeposits * balance) / epoch.totalRegistered;
        require(amount > 0, "Claim amount too small");

        hasClaimed[epochId][msg.sender][poolIndex] = true;
        epochClaimedPerPool[epochId][poolIndex] += amount;
        totalClaimed += amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "ETH transfer failed");

        emit EpochClaimed(epochId, poolIndex, msg.sender, amount);
    }

    /**
     * @notice Batch claim from multiple pools for a past epoch.
     *         Requires prior confirmClaim() call in a separate block (flash loan protection).
     * @param epochId The epoch to claim from
     * @param poolIndices Array of pool indices to claim from
     */
    function claimEpochBatch(
        uint256 epochId,
        uint8[] calldata poolIndices
    ) external nonReentrant whenNotPaused {
        require(isEpochFinalized(epochId), "Epoch not ended yet");

        // Grace period: claims valid during epoch N+1 only
        uint256 current = currentEpoch();
        require(current == epochId + 1, "Claim window closed");

        // Flash loan protection: must have confirmed balance at least 256 blocks ago
        uint256 confirmedBlock = claimConfirmedBlock[epochId][msg.sender];
        require(confirmedBlock > 0, "Must call confirmClaim first");
        require(block.number >= confirmedBlock + MIN_CLAIM_BLOCK_GAP, "Must wait 256 blocks after confirmClaim");

        uint256 balance = registeredBalances[epochId][msg.sender];
        require(balance > 0, "Not registered for this epoch");

        EpochData storage epoch = epochs[epochId];
        require(epoch.totalRegistered > 0, "No registrations");

        // Must still hold at least the registered balance to prevent register-then-sell
        require(bonzaiToken.balanceOf(msg.sender) >= balance, "Balance dropped below registered amount");

        // Unlocked users bypass per-pool thresholds
        bool isUnlocked = false;
        if (address(unlockContract) != address(0)) {
            try unlockContract.hasUnlocked(msg.sender) returns (bool result) {
                isUnlocked = result;
            } catch {}
        }

        uint256 totalAmount = 0;

        for (uint256 i = 0; i < poolIndices.length; ) {
            uint8 poolIndex = poolIndices[i];
            require(poolIndex < NUM_POOLS, "Invalid pool index");

            // Use snapshotted thresholds — unlocked users skip threshold check
            bool meetsThreshold = isUnlocked;
            if (!isUnlocked) {
                uint256 threshold = epochThresholdSnapshotted[epochId]
                    ? epochThresholds[epochId][poolIndex]
                    : poolThresholds[poolIndex];
                meetsThreshold = balance >= threshold;
            }

            if (
                !hasClaimed[epochId][msg.sender][poolIndex] &&
                meetsThreshold &&
                epoch.poolDeposits[poolIndex] > 0
            ) {
                uint256 amount = (epoch.poolDeposits[poolIndex] * balance) / epoch.totalRegistered;
                if (amount > 0) {
                    hasClaimed[epochId][msg.sender][poolIndex] = true;
                    epochClaimedPerPool[epochId][poolIndex] += amount;
                    totalAmount += amount;
                    emit EpochClaimed(epochId, poolIndex, msg.sender, amount);
                }
            }

            unchecked { i++; }
        }

        require(totalAmount > 0, "Nothing to claim");
        totalClaimed += totalAmount;

        (bool ok, ) = msg.sender.call{value: totalAmount}("");
        require(ok, "ETH transfer failed");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get all pool deposits for a specific epoch
     */
    function getEpochDeposits(uint256 epochId) external view returns (uint256[6] memory) {
        return epochs[epochId].poolDeposits;
    }

    /**
     * @notice Get full epoch info
     */
    function getEpochInfo(uint256 epochId) external view returns (
        uint256 startTime,
        uint256 endTime,
        uint256 totalRegistered,
        bool finalized
    ) {
        return (
            epochStartTime(epochId),
            epochEndTime(epochId),
            epochs[epochId].totalRegistered,
            isEpochFinalized(epochId)
        );
    }

    /**
     * @notice Get lifetime deposited totals across all epochs
     */
    function getAllTotalDeposited() external view returns (uint256[6] memory) {
        return totalDeposited;
    }

    /**
     * @notice Get all pool thresholds
     */
    function getAllPoolThresholds() external view returns (uint256[6] memory) {
        return poolThresholds;
    }

    /**
     * @notice Check if user qualifies for a pool (based on current balance)
     * @dev For epoch claims, the registered balance is used instead
     */
    function qualifiesForPool(address user, uint8 poolIndex) external view returns (bool) {
        if (poolIndex >= NUM_POOLS) return false;
        return bonzaiToken.balanceOf(user) >= poolThresholds[poolIndex];
    }

    /**
     * @notice Preview claim amount for an epoch/pool for a registered user
     */
    function previewClaim(
        uint256 epochId,
        uint8 poolIndex,
        address user
    ) external view returns (uint256) {
        if (poolIndex >= NUM_POOLS) return 0;
        if (!isEpochFinalized(epochId)) return 0;
        EpochData storage epoch = epochs[epochId];
        uint256 balance = registeredBalances[epochId][user];
        if (balance < poolThresholds[poolIndex]) return 0;
        if (epoch.totalRegistered == 0) return 0;
        return (epoch.poolDeposits[poolIndex] * balance) / epoch.totalRegistered;
    }

    /**
     * @notice Check if a user has claimed a specific pool in a specific epoch
     */
    function hasClaimedEpoch(uint256 epochId, address user, uint8 poolIndex) external view returns (bool) {
        return hasClaimed[epochId][user][poolIndex];
    }

    /**
     * @notice Check if a user is registered for a specific epoch
     */
    function isRegistered(uint256 epochId, address user) external view returns (bool) {
        return registeredBalances[epochId][user] > 0;
    }

    /**
     * @notice Get total claimed per pool for an epoch
     */
    function getEpochClaimedPerPool(uint256 epochId) external view returns (uint256[6] memory) {
        return epochClaimedPerPool[epochId];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid address");
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }

    function setContentContract(address _contract) external onlyOwner {
        require(_contract != address(0), "Invalid address");
        address old = contentContract;
        contentContract = _contract;
        emit ContentContractUpdated(old, _contract);
    }

    function setRoyaltySplitter(address _splitter) external onlyOwner {
        require(_splitter != address(0), "Invalid address");
        address old = royaltySplitter;
        royaltySplitter = _splitter;
        emit RoyaltySplitterUpdated(old, _splitter);
    }

    function setFeeHook(address _hook) external onlyOwner {
        require(_hook != address(0), "Invalid address");
        address old = feeHook;
        feeHook = _hook;
        emit FeeHookUpdated(old, _hook);
    }

    function setCompanionNFT(address _nft) external onlyOwner {
        require(_nft != address(0), "Invalid address");
        address old = address(companionNFT);
        companionNFT = IERC721(_nft);
        emit CompanionNFTUpdated(old, _nft);
    }

    function setUnlockContract(address _unlock) external onlyOwner {
        unlockContract = IBonzaiUnlock(_unlock);
    }

    /**
     * @notice Authorize or deauthorize a minter (e.g. collection clone from factory).
     *         Can be called by the contract owner or the authorized collectibles factory.
     * @param minter The address to authorize/deauthorize
     * @param authorized Whether to authorize (true) or deauthorize (false)
     */
    function setAuthorizedMinter(address minter, bool authorized) external {
        require(msg.sender == owner() || msg.sender == collectiblesFactory, "Unauthorized");
        require(minter != address(0), "Invalid address");
        authorizedMinters[minter] = authorized;
        emit AuthorizedMinterUpdated(minter, authorized);
    }

    /**
     * @notice Set the collectibles factory address (authorized to register minters)
     * @param _factory The factory contract address
     */
    function setCollectiblesFactory(address _factory) external onlyOwner {
        address old = collectiblesFactory;
        collectiblesFactory = _factory;
        emit CollectiblesFactoryUpdated(old, _factory);
    }

    /**
     * @notice Update the BONZAI threshold for a pool.
     * @dev WARNING: Takes effect immediately, including for active claim windows.
     *      Users who registered in epoch N may be affected when claiming in epoch N+1
     *      if the threshold changes between registration and claim. To avoid disrupting
     *      active claimants, threshold changes should be announced at least 1 epoch in
     *      advance and applied only after the current claim window closes.
     * @param poolIndex Pool index (0-5)
     * @param threshold New threshold in full token units (e.g. 1000 = 1000 tokens),
     *        same format as the constructor. Stored as threshold * 1e18.
     */
    function setPoolThreshold(uint8 poolIndex, uint256 threshold) external onlyOwner {
        require(poolIndex < NUM_POOLS, "Invalid pool index");
        require(threshold > 0, "Threshold cannot be zero");

        uint256 newThreshold = threshold * 1e18;

        // Enforce ascending order relative to neighbors
        if (poolIndex > 0) {
            require(newThreshold >= poolThresholds[poolIndex - 1], "Must be >= previous pool threshold");
        }
        if (poolIndex < NUM_POOLS - 1) {
            require(newThreshold <= poolThresholds[poolIndex + 1], "Must be <= next pool threshold");
        }

        uint256 old = poolThresholds[poolIndex];
        poolThresholds[poolIndex] = newThreshold;
        emit PoolThresholdUpdated(poolIndex, old, newThreshold);
    }

    /**
     * @notice Sweep unclaimed ETH from old epochs to owner.
     *         Can only be called after the claim window has closed
     *         (currentEpoch >= epochId + 2, i.e. claim window was epoch N+1 only).
     * @param epochId Epoch to sweep
     */
    function sweepUnclaimed(uint256 epochId) external onlyOwner {
        require(isEpochFinalized(epochId), "Epoch not ended");
        require(currentEpoch() >= epochId + 2, "Claim window still open");
        require(!epochSwept[epochId], "Already swept");

        epochSwept[epochId] = true;

        uint256 sweepAmount = 0;
        EpochData storage epoch = epochs[epochId];
        for (uint8 i = 0; i < NUM_POOLS; ) {
            uint256 unclaimed = epoch.poolDeposits[i] - epochClaimedPerPool[epochId][i];
            sweepAmount += unclaimed;
            unchecked { i++; }
        }

        if (sweepAmount > 0) {
            totalSwept += sweepAmount;
            (bool ok, ) = treasury.call{value: sweepAmount}("");
            require(ok, "Sweep transfer failed");
            emit UnclaimedSwept(epochId, sweepAmount);
        }
    }

    /// @notice Recirculate unclaimed epoch funds into the current active epoch
    function recirculateUnclaimed(uint256 epochId) external onlyOwner {
        uint256 current = currentEpoch();
        require(current >= epochId + 2, "Claim window still open");
        require(!epochSwept[epochId], "Already swept/recirculated");

        epochSwept[epochId] = true;
        uint256 totalRecirculated;

        for (uint8 i = 0; i < NUM_POOLS;) {
            uint256 deposited = epochs[epochId].poolDeposits[i];
            uint256 claimed = epochClaimedPerPool[epochId][i];
            uint256 unclaimed = deposited > claimed ? deposited - claimed : 0;
            if (unclaimed > 0) {
                epochs[current].poolDeposits[i] += unclaimed;
                totalDeposited[i] += unclaimed;
                totalRecirculated += unclaimed;
            }
            unchecked { ++i; }
        }

        if (totalRecirculated > 0) {
            emit UnclaimedRecirculated(epochId, current, totalRecirculated);
        }
    }

    event UnclaimedRecirculated(uint256 indexed fromEpoch, uint256 indexed toEpoch, uint256 amount);

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Recover ERC20 tokens sent to contract by mistake
     */
    function recoverERC20(address token, uint256 amount) external onlyOwner {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", treasury, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
    }

    /**
     * @notice Withdraw ETH surplus (rounding dust, direct transfers, etc.)
     *         that is NOT accountable to any epoch's deposited-but-unclaimed funds.
     * @dev accountable = sum(totalDeposited) - totalClaimed - totalSwept
     *      withdrawable = address(this).balance - accountable
     */
    function withdrawETH() external onlyOwner {
        uint256 totalDepositedAll = 0;
        for (uint8 i = 0; i < NUM_POOLS; ) {
            totalDepositedAll += totalDeposited[i];
            unchecked { i++; }
        }

        uint256 accountable = totalDepositedAll - totalClaimed - totalSwept;
        uint256 balance = address(this).balance;
        require(balance > accountable, "No surplus ETH to withdraw");

        uint256 surplus = balance - accountable;
        (bool sent, ) = treasury.call{value: surplus}("");
        require(sent, "ETH transfer failed");
    }

    /// @notice Allow contract to receive ETH directly (for edge cases)
    receive() external payable {}
}
