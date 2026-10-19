// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IBonzaiUnlock {
    function hasUnlocked(address user) external view returns (bool);
}

interface IBonzaiStakePositions {
    function bonzaiToken() external view returns (address);
    function positions(address user) external view returns (
        uint256 amount,
        uint256 lockedUntil,
        uint256 updatedAt,
        uint32 contributionScore
    );
}
interface IServiceTimeTotals {
    function totalServiceTime(uint256 epoch, uint8 pool) external view returns (uint256);
}

interface IMintBasketRewards {
    function stakingVault() external view returns (address);
    function depositNative() external payable;
}

/**
 * @title BonzaiMintPool
 * @notice Epoch-based revenue pools for BONZAI LVL holders + P2P providers.
 *
 *   6 pools (0..5): text, audio, image, video, 3D, training.
 *   Each incoming deposit is split into:
 *     - holder side    ((10000 - providerShareBps) / 10000)
 *     - provider side  (providerShareBps / 10000, default 5000 = 50%)
 *
 * Balance verification:
 *   The configured chain's staking vault holds the BONZAI position. Holder
 *   registration requires its non-transferable lock to cover the entire next
 *   epoch (the minimum anti-reuse lock), so one balance cannot register in many wallets.
 *   Earned claims remain available indefinitely after that lock expires.
 *
 * Holder path:
 *   - User calls registerForEpoch() during the current epoch; their BONZAI
 *     locked stake is snapshotted. Flexible stake does not qualify.
 *   - After the epoch closes, user calls confirmClaim(), then after 256 blocks
 *     calls claimEpoch(poolIndex) to pull their weighted share of the holder
 *     side of that pool. The stake lock, rather than the block gap alone,
 *     prevents borrowed/recycled balances from earning holder rewards.
 *
 * Provider path:
 *   - BonzaiServiceTime is the only contract authorized to pull from the
 *     provider side via withdrawProviderShare().
 *   - Weights are (providerSeconds / totalSeconds) for (epoch, poolIndex).
 */
contract BonzaiMintPool is Ownable, ReentrancyGuard, Pausable {
    IERC20 public bonzaiToken;
    address public treasury;
    IBonzaiUnlock public unlockContract;
    IBonzaiStakePositions public stakingVault;
    bool public stakingVaultFrozen;
    IMintBasketRewards public basketRewards;
    uint256 public pendingBasketRewards;
    uint256 public totalBasketForwarded;
    uint256 public constant BASKET_ROUTING_GAS_LIMIT = 500_000;
    event BasketRewardsConfigured(address indexed rewards);
    event BasketRewardsForwarded(uint256 amount);
    event BasketRewardForwardingFailed(uint256 amount);

    /// @notice BonzaiServiceTime contract — exclusive withdrawer for provider side.
    address public serviceTimeContract;
    // A contract wallet that rejects native currency can select another receiver.
    mapping(address => address payable) public rewardRecipient;
    event RewardRecipientSet(address indexed wallet, address indexed recipient);
    function setRewardRecipient(address payable recipient) external {
        require(recipient != address(0), "Invalid recipient");
        rewardRecipient[msg.sender] = recipient;
        emit RewardRecipientSet(msg.sender, recipient);
    }
    function _recipient(address wallet) private view returns (address payable) {
        return rewardRecipient[wallet] == address(0) ? payable(wallet) : rewardRecipient[wallet];
    }

    uint256 public constant NUM_POOLS = 6;
    uint256 public constant MIN_CLAIM_BLOCK_GAP = 256;
    uint16 public constant MAX_BPS = 10000;

    /// @notice Holder + provider share split. Sum MUST equal MAX_BPS.
    ///         Use setShares(holderBps, providerBps) to update — atomic, validated.
    uint16 public holderShareBps = 5000;
    uint16 public providerShareBps = 5000;
    /// @notice Lower bound for either share (prevents accidental 0/100 admin slip).
    uint16 public constant MIN_SIDE_BPS = 1000;

    uint256[6] public poolThresholds;
    mapping(uint256 => uint256[6]) public epochThresholds;
    mapping(uint256 => bool) public epochThresholdSnapshotted;

    uint256 public immutable genesisTime;
    uint256 public immutable epochDuration;

    struct EpochData {
        uint256[6] holderDeposits;
        uint256[6] providerDeposits;
        uint256 totalRegistered;
    }

    mapping(uint256 => EpochData) public epochs;
    mapping(uint256 => mapping(address => uint256)) public registeredBalances;
    mapping(uint256 => mapping(address => mapping(uint8 => bool))) public hasClaimed;
    mapping(uint256 => uint256[6]) public epochClaimedPerPool;
    mapping(uint256 => uint256[6]) public epochProviderWithdrawn;
    mapping(uint256 => bool) public epochSwept;
    mapping(uint256 => mapping(address => uint256)) public claimConfirmedBlock;

    /// @notice Per-(epoch, user) registration timestamp. Used by the
    ///         time-weighted reward formula: a user who registers earlier
    ///         in an epoch earns more than one who registers near the
    ///         epoch end. Weight = balance × (epoch_end - registration_ts).
    mapping(uint256 => mapping(address => uint256)) public registeredAt;

    /// @notice Per-(epoch) total time-weighted balance, used as the divisor
    ///         in the holder reward formula. Updated on every register.
    mapping(uint256 => uint256) public totalWeightedRegistered;

    /// @notice Per-(epoch, content-type, wallet) mint counter. Recorded by
    ///         BonzaiCollectibles on every mint via `recordMint()`. Holders
    ///         can only claim a pool's rewards for an epoch in which they
    ///         minted at least one collectible of that type. Wash-claim
    ///         deterrent — pure BONZAI-holding without any actual product
    ///         engagement no longer earns.
    mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public epochMints;

    uint256[6] public totalDeposited;        // holder side cumulative
    uint256[6] public totalProviderDeposited; // provider side cumulative
    uint256 public totalClaimed;
    uint256 public totalProviderWithdrawn;
    uint256 public totalSwept;

    address public contentContract;
    address public royaltySplitter;
    address public feeHook;
    /// @notice BonzaiCompanions singleton — privileged depositor (50% mint fee
    ///         routes to the 6 buckets via depositForPool).
    address public companionContract;
    mapping(address => bool) public authorizedMinters;
    address public collectiblesFactory;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event PoolDeposit(
        uint8 indexed poolIndex,
        uint256 holderAmount,
        uint256 providerAmount,
        address indexed depositor,
        uint256 indexed epochId
    );
    event EpochClaimed(uint256 indexed epochId, uint8 indexed poolIndex, address indexed claimer, uint256 amount);
    event ProviderShareWithdrawn(
        uint256 indexed epochId,
        uint8 indexed poolIndex,
        address indexed provider,
        uint256 amount,
        uint256 providerTime,
        uint256 totalTime
    );
    event Registered(uint256 indexed epochId, address indexed wallet, uint256 balance);
    event ClaimConfirmed(uint256 indexed epochId, address indexed wallet, uint256 balance, uint256 blockNumber);
    event ContentContractUpdated(address indexed oldContract, address indexed newContract);
    event RoyaltySplitterUpdated(address indexed oldSplitter, address indexed newSplitter);
    event FeeHookUpdated(address indexed oldHook, address indexed newHook);
    event ServiceTimeContractUpdated(address indexed oldContract, address indexed newContract);
    event AuthorizedMinterUpdated(address indexed minter, bool authorized);
    event CollectiblesFactoryUpdated(address indexed oldFactory, address indexed newFactory);
    event PoolThresholdUpdated(uint8 indexed poolIndex, uint256 oldThreshold, uint256 newThreshold);
    event SharesUpdated(uint16 oldHolderBps, uint16 oldProviderBps, uint16 newHolderBps, uint16 newProviderBps);
    event UnlockContractUpdated(address indexed oldUnlock, address indexed newUnlock);
    event StakingVaultUpdated(address indexed oldVault, address indexed newVault);
    event CompanionContractUpdated(address indexed oldCompanion, address indexed newCompanion);
    event UnclaimedSwept(uint256 indexed epochId, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event EpochThresholdsSnapshotted(uint256 indexed epochId);
    event UnclaimedRecirculated(uint256 indexed fromEpoch, uint256 indexed toEpoch, uint256 amount);
    event MintRecorded(uint256 indexed epochId, uint8 indexed poolIndex, address indexed wallet);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    constructor(
        address _bonzaiToken,
        uint256[6] memory _thresholds,
        uint256 _epochDuration,
        address _treasury
    ) Ownable(msg.sender) {
        require(_bonzaiToken != address(0), "Invalid token address");
        require(_epochDuration > 0, "Invalid epoch duration");
        require(_treasury != address(0), "Invalid treasury address");

        bonzaiToken = IERC20(_bonzaiToken);
        epochDuration = _epochDuration;
        treasury = _treasury;

        uint256 dayOfWeek = (block.timestamp / 1 days + 4) % 7;
        uint256 todayStart = (block.timestamp / 1 days) * 1 days;
        uint256 daysUntilMonday = (8 - dayOfWeek) % 7;
        if (daysUntilMonday == 0) daysUntilMonday = 7;
        genesisTime = todayStart + daysUntilMonday * 1 days;

        for (uint8 i = 0; i < 6; i++) {
            require(_thresholds[i] > 0, "Threshold cannot be zero");
            if (i > 0) require(_thresholds[i] >= _thresholds[i - 1], "Thresholds must be ascending");
            poolThresholds[i] = _thresholds[i] * 1e18;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EPOCH COMPUTATION
    // ═══════════════════════════════════════════════════════════════════════════

    function currentEpoch() public view returns (uint256) {
        if (block.timestamp < genesisTime) return 0;
        return (block.timestamp - genesisTime) / epochDuration;
    }

    function hasStarted() public view returns (bool) {
        return block.timestamp >= genesisTime;
    }

    function epochStartTime(uint256 epochId) public view returns (uint256) {
        return genesisTime + (epochId * epochDuration);
    }

    function epochEndTime(uint256 epochId) public view returns (uint256) {
        return genesisTime + ((epochId + 1) * epochDuration);
    }

    function isEpochFinalized(uint256 epochId) public view returns (bool) {
        return block.timestamp >= epochEndTime(epochId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HOLDER REGISTRATION (locked stake on the configured chain)
    // ═══════════════════════════════════════════════════════════════════════════

    function registerForEpoch() external whenNotPaused {
        uint256 epochId = currentEpoch();
        require(registeredBalances[epochId][msg.sender] == 0, "Already registered");

        uint256 balance = _eligibleStake(msg.sender);

        if (!epochThresholdSnapshotted[epochId]) {
            for (uint8 i = 0; i < NUM_POOLS; ) {
                epochThresholds[epochId][i] = poolThresholds[i];
                unchecked { i++; }
            }
            epochThresholdSnapshotted[epochId] = true;
            emit EpochThresholdsSnapshotted(epochId);
        }

        require(balance >= epochThresholds[epochId][0], "Below LVL1 threshold");
        (, uint256 lockedUntil,,) = stakingVault.positions(msg.sender);
        require(lockedUntil >= epochEndTime(epochId + 1), "Lock must cover claim window");
        // Continuity relies on one non-transferable vault throughout every
        // registered epoch; governance cannot swap in a different balance source.
        stakingVaultFrozen = true;

        registeredBalances[epochId][msg.sender] = balance;
        registeredAt[epochId][msg.sender] = block.timestamp;

        // Time-weighted accounting: weight = balance × seconds-remaining-in-epoch.
        // Earlier registrations earn more — incentivises long-term commitment.
        uint256 weight = _weightedBalance(epochId, balance, block.timestamp);
        epochs[epochId].totalRegistered += balance; // legacy raw balance (kept for views)
        totalWeightedRegistered[epochId] += weight;

        emit Registered(epochId, msg.sender, balance);
    }

    /// @dev weight = balance × (epoch_end - registration_ts).
    ///      Min 0 if registered exactly at epoch end. Capped to epochDuration
    ///      seconds (registering before epoch end can't gain extra weight).
    function _weightedBalance(uint256 epochId, uint256 balance, uint256 registrationTs)
        internal
        view
        returns (uint256)
    {
        uint256 epochEnd = epochEndTime(epochId);
        if (registrationTs >= epochEnd) return 0;
        uint256 secondsRemaining = epochEnd - registrationTs;
        if (secondsRemaining > epochDuration) secondsRemaining = epochDuration;
        return balance * secondsRemaining;
    }

    function confirmClaim(uint256 epochId) external {
        require(isEpochFinalized(epochId), "Epoch not ended yet");
        uint256 registeredBal = registeredBalances[epochId][msg.sender];
        require(registeredBal > 0, "Not registered for this epoch");


        claimConfirmedBlock[epochId][msg.sender] = block.number;
        emit ClaimConfirmed(epochId, msg.sender, registeredBal, block.number);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DEPOSIT (split holder / provider)
    // ═══════════════════════════════════════════════════════════════════════════

    function depositForPool(uint8 poolIndex) external payable nonReentrant {
        require(
            msg.sender == contentContract ||
            msg.sender == royaltySplitter ||
            msg.sender == feeHook ||
            msg.sender == companionContract ||
            authorizedMinters[msg.sender],
            "Unauthorized depositor"
        );
        require(poolIndex < NUM_POOLS, "Invalid pool index");
        require(msg.value > 0, "Zero deposit");

        uint256 epochId = currentEpoch();
        uint256 providerAmount = (msg.value * providerShareBps) / MAX_BPS;
        uint256 holderAmount = msg.value - providerAmount;

        // Previously accrued holder claims remain in their original epochs.
        // New holder fees support every LVL, independently of content type.
        if (address(basketRewards) == address(0)) epochs[epochId].holderDeposits[poolIndex] += holderAmount;
        else pendingBasketRewards += holderAmount;
        epochs[epochId].providerDeposits[poolIndex] += providerAmount;
        totalDeposited[poolIndex] += holderAmount;
        totalProviderDeposited[poolIndex] += providerAmount;

        emit PoolDeposit(poolIndex, holderAmount, providerAmount, msg.sender, epochId);
        if (address(basketRewards) != address(0) && holderAmount > 0) _tryForwardBasket(holderAmount);
    }

    /// @notice Record that a wallet minted a collectible of the given type in
    ///         the current epoch. Called by BonzaiCollectibles on every mint
    ///         (and by any other authorized minter). Used to gate
    ///         claimEpoch — only wallets that participated in the epoch's
    ///         content type can claim that pool's rewards.
    function recordMint(address wallet, uint8 poolIndex) external {
        // Only authorizedMinters (collectible CLONES — added by the factory
        // when each user creates their collection) can record mints. Owner
        // CANNOT bypass to avoid arbitrary "activity" pre-poisoning.
        require(authorizedMinters[msg.sender], "Unauthorized recorder");
        require(poolIndex < NUM_POOLS, "Invalid pool index");
        if (wallet == address(0)) return;
        uint256 epochId = currentEpoch();
        unchecked { epochMints[epochId][poolIndex][wallet] += 1; }
        emit MintRecorded(epochId, poolIndex, wallet);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HOLDER CLAIM
    // ═══════════════════════════════════════════════════════════════════════════

    function claimEpoch(uint256 epochId, uint8 poolIndex) external nonReentrant {
        require(poolIndex < NUM_POOLS, "Invalid pool index");
        require(isEpochFinalized(epochId), "Epoch not ended yet");
        require(!hasClaimed[epochId][msg.sender][poolIndex], "Already claimed");

        uint256 confirmedBlock = claimConfirmedBlock[epochId][msg.sender];
        require(confirmedBlock > 0, "Must call confirmClaim first");
        require(block.number >= confirmedBlock + MIN_CLAIM_BLOCK_GAP, "Must wait 256 blocks after confirmClaim");

        uint256 balance = registeredBalances[epochId][msg.sender];
        require(balance > 0, "Not registered for this epoch");

        uint256 threshold = epochThresholdSnapshotted[epochId]
            ? epochThresholds[epochId][poolIndex]
            : poolThresholds[poolIndex];
        require(balance >= threshold, "Below pool threshold");

        // Activity gate: must have minted at least one collectible of this
        // content type during the claim epoch.
        require(epochMints[epochId][poolIndex][msg.sender] > 0, "No mints in this category for epoch");

        EpochData storage epoch = epochs[epochId];
        uint256 totalWeight = totalWeightedRegistered[epochId];
        require(totalWeight > 0, "No weighted registrations");
        uint256 epochDeposits = epoch.holderDeposits[poolIndex];
        require(epochDeposits > 0, "No deposits in this pool");

        // Time-weighted share: earlier registration = larger share
        uint256 userWeight = _weightedBalance(epochId, balance, registeredAt[epochId][msg.sender]);
        uint256 amount = (epochDeposits * userWeight) / totalWeight;
        require(amount > 0, "Claim amount too small");

        hasClaimed[epochId][msg.sender][poolIndex] = true;
        epochClaimedPerPool[epochId][poolIndex] += amount;
        totalClaimed += amount;

        (bool ok, ) = _recipient(msg.sender).call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit EpochClaimed(epochId, poolIndex, msg.sender, amount);
    }

    function claimEpochBatch(
        uint256 epochId,
        uint8[] calldata poolIndices
    ) external nonReentrant {
        require(isEpochFinalized(epochId), "Epoch not ended yet");

        uint256 confirmedBlock = claimConfirmedBlock[epochId][msg.sender];
        require(confirmedBlock > 0, "Must call confirmClaim first");
        require(block.number >= confirmedBlock + MIN_CLAIM_BLOCK_GAP, "Must wait 256 blocks after confirmClaim");

        uint256 balance = registeredBalances[epochId][msg.sender];
        require(balance > 0, "Not registered for this epoch");

        EpochData storage epoch = epochs[epochId];
        uint256 totalWeight = totalWeightedRegistered[epochId];
        require(totalWeight > 0, "No weighted registrations");

        uint256 userWeight = _weightedBalance(epochId, balance, registeredAt[epochId][msg.sender]);

        uint256 totalAmount = 0;

        for (uint256 i = 0; i < poolIndices.length; ) {
            uint8 poolIndex = poolIndices[i];
            require(poolIndex < NUM_POOLS, "Invalid pool index");

            uint256 threshold = epochThresholdSnapshotted[epochId]
                ? epochThresholds[epochId][poolIndex]
                : poolThresholds[poolIndex];
            bool meetsThreshold = balance >= threshold;

            bool hasMintedInCategory = epochMints[epochId][poolIndex][msg.sender] > 0;

            if (
                !hasClaimed[epochId][msg.sender][poolIndex] &&
                meetsThreshold &&
                hasMintedInCategory &&
                epoch.holderDeposits[poolIndex] > 0
            ) {
                uint256 amount = (epoch.holderDeposits[poolIndex] * userWeight) / totalWeight;
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

        (bool ok, ) = _recipient(msg.sender).call{value: totalAmount}("");
        require(ok, "ETH transfer failed");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROVIDER WITHDRAWAL (BonzaiServiceTime only)
    // ═══════════════════════════════════════════════════════════════════════════

    event EmptyAllocationRolled(uint256 indexed fromEpoch,uint256 indexed toEpoch,uint8 indexed pool,bool providerSide,uint256 amount);

    /// @notice Only allocations provably earned by nobody may be reused. Never sweeps an earned claim.
    function rollEmptyAllocation(uint256 epochId,uint8 poolIndex,bool providerSide) external nonReentrant {
        require(poolIndex<NUM_POOLS && isEpochFinalized(epochId),"Invalid closed pool");
        uint256 amount;
        uint256 destination=currentEpoch();
        if(providerSide){
            require(serviceTimeContract.code.length>0,"Accounting not configured");
            require(IServiceTimeTotals(serviceTimeContract).totalServiceTime(epochId,poolIndex)==0,"Providers earned rewards");
            amount=epochs[epochId].providerDeposits[poolIndex];
            epochs[epochId].providerDeposits[poolIndex]=0;
            epochs[destination].providerDeposits[poolIndex]+=amount;
        }else{
            require(totalWeightedRegistered[epochId]==0,"Holders earned rewards");
            amount=epochs[epochId].holderDeposits[poolIndex];
            epochs[epochId].holderDeposits[poolIndex]=0;
            if(address(basketRewards)==address(0)) epochs[destination].holderDeposits[poolIndex]+=amount;
            else {pendingBasketRewards+=amount;_tryForwardBasket(amount);}
        }
        require(amount>0,"No unearned allocation");
        // Cumulative liabilities are unchanged: this is a move, never a second deposit.
        emit EmptyAllocationRolled(epochId,destination,poolIndex,providerSide,amount);
    }

    function withdrawProviderShare(
        uint256 epochId,
        uint8 poolIndex,
        address provider,
        uint256 providerTime,
        uint256 totalTime
    ) external nonReentrant returns (uint256 amount) {
        require(msg.sender == serviceTimeContract, "Only ServiceTime");
        require(poolIndex < NUM_POOLS, "Invalid pool index");
        require(isEpochFinalized(epochId), "Epoch not finalized");
        require(!epochSwept[epochId], "Epoch already settled");
        require(provider != address(0), "Invalid provider");
        require(providerTime > 0 && totalTime > 0, "No service time");
        require(providerTime <= totalTime, "Invalid weights");

        uint256 pool = epochs[epochId].providerDeposits[poolIndex];
        require(pool > 0, "No provider deposits in pool");

        amount = (pool * providerTime) / totalTime;
        require(amount > 0, "Claim amount too small");
        require(epochProviderWithdrawn[epochId][poolIndex] + amount <= pool, "Provider pool exhausted");

        // Keep cumulative payouts within the original provider allocation.
        epochProviderWithdrawn[epochId][poolIndex] += amount;
        totalProviderWithdrawn += amount;

        (bool ok, ) = _recipient(provider).call{value: amount}("");
        require(ok, "ETH transfer failed");

        emit ProviderShareWithdrawn(epochId, poolIndex, provider, amount, providerTime, totalTime);
        return amount;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════════════════════

    function getEpochHolderDeposits(uint256 epochId) external view returns (uint256[6] memory) {
        return epochs[epochId].holderDeposits;
    }

    function getEpochProviderDeposits(uint256 epochId) external view returns (uint256[6] memory) {
        return epochs[epochId].providerDeposits;
    }

    function getEpochInfo(uint256 epochId) external view returns (
        uint256 startTime, uint256 endTime, uint256 totalRegistered, bool finalized
    ) {
        return (
            epochStartTime(epochId),
            epochEndTime(epochId),
            epochs[epochId].totalRegistered,
            isEpochFinalized(epochId)
        );
    }

    function getAllTotalDeposited() external view returns (uint256[6] memory) { return totalDeposited; }
    function getAllTotalProviderDeposited() external view returns (uint256[6] memory) { return totalProviderDeposited; }
    function getAllPoolThresholds() external view returns (uint256[6] memory) { return poolThresholds; }

    function qualifiesForPool(address user, uint8 poolIndex) external view returns (bool) {
        if (poolIndex >= NUM_POOLS) return false;
        uint256 epochId = currentEpoch();
        uint256 regBalance = registeredBalances[epochId][user];
        if (regBalance > 0) return regBalance >= epochThresholds[epochId][poolIndex];
        return false;
    }

    function previewHolderClaim(uint256 epochId, uint8 poolIndex, address user) external view returns (uint256) {
        if (poolIndex >= NUM_POOLS) return 0;
        if (!isEpochFinalized(epochId)) return 0;
        if (epochSwept[epochId] || hasClaimed[epochId][user][poolIndex]) return 0;
        EpochData storage epoch = epochs[epochId];
        uint256 balance = registeredBalances[epochId][user];
        if (balance == 0) return 0;

        uint256 threshold = epochThresholdSnapshotted[epochId]
            ? epochThresholds[epochId][poolIndex]
            : poolThresholds[poolIndex];
        if (balance < threshold) return 0;
        if (epochMints[epochId][poolIndex][user] == 0) return 0;

        uint256 totalWeight = totalWeightedRegistered[epochId];
        if (totalWeight == 0) return 0;

        uint256 userWeight = _weightedBalance(epochId, balance, registeredAt[epochId][user]);
        return (epoch.holderDeposits[poolIndex] * userWeight) / totalWeight;
    }

    /// @notice Eligibility report for the UI — returns the gating reasons
    ///         a user does NOT pass for claiming a given pool.
    /// @return isRegisteredFlag whether the user registered for the epoch
    /// @return mintedInCategory whether they minted at least 1 in the category
    /// @return aboveThreshold whether their registered balance >= pool threshold (or unlocked)
    /// @return registrationTs when they registered (0 if not)
    /// @return userWeight their time-weighted contribution
    /// @return totalWeight the epoch's total weighted balance
    function getEligibility(uint256 epochId, uint8 poolIndex, address user)
        external
        view
        returns (
            bool isRegisteredFlag,
            bool mintedInCategory,
            bool aboveThreshold,
            uint256 registrationTs,
            uint256 userWeight,
            uint256 totalWeight
        )
    {
        if (poolIndex >= NUM_POOLS) return (false, false, false, 0, 0, totalWeightedRegistered[epochId]);
        uint256 balance = registeredBalances[epochId][user];
        isRegisteredFlag = balance > 0;
        mintedInCategory = epochMints[epochId][poolIndex][user] > 0;

        uint256 threshold = epochThresholdSnapshotted[epochId]
            ? epochThresholds[epochId][poolIndex]
            : poolThresholds[poolIndex];
        aboveThreshold = balance >= threshold;
        registrationTs = registeredAt[epochId][user];
        userWeight = isRegisteredFlag
            ? _weightedBalance(epochId, balance, registrationTs)
            : 0;
        totalWeight = totalWeightedRegistered[epochId];
    }

    /// @notice Returns the number of collectibles `user` minted of `poolIndex`
    ///         category during `epochId`. Used by the UI to show why a user
    ///         is or isn't eligible to claim a particular pool.
    function getEpochMints(uint256 epochId, uint8 poolIndex, address user) external view returns (uint256) {
        return epochMints[epochId][poolIndex][user];
    }

    function hasClaimedEpoch(uint256 epochId, address user, uint8 poolIndex) external view returns (bool) {
        return hasClaimed[epochId][user][poolIndex];
    }

    function isRegistered(uint256 epochId, address user) external view returns (bool) {
        return registeredBalances[epochId][user] > 0;
    }

    function getEpochClaimedPerPool(uint256 epochId) external view returns (uint256[6] memory) {
        return epochClaimedPerPool[epochId];
    }

    function getEpochProviderWithdrawnPerPool(uint256 epochId) external view returns (uint256[6] memory) {
        return epochProviderWithdrawn[epochId];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════════

    function setServiceTimeContract(address _svc) external onlyOwner {
        require(_svc.code.length > 0 && (serviceTimeContract == address(0) || serviceTimeContract == _svc), "ServiceTime is immutable");
        address old = serviceTimeContract;
        serviceTimeContract = _svc;
        emit ServiceTimeContractUpdated(old, _svc);
    }

    function setBasketRewards(address rewards) external onlyOwner {
        require(address(basketRewards) == address(0) && rewards.code.length > 0, "Invalid basket");
        require(IMintBasketRewards(rewards).stakingVault() == address(stakingVault), "Basket vault mismatch");
        basketRewards = IMintBasketRewards(rewards);
        stakingVaultFrozen = true;
        emit BasketRewardsConfigured(rewards);
    }

    /// @notice Deliver new holder fees without coupling mint availability to rewards.
    /// Provider revenue and historical registered-holder claims remain untouched.
    function forwardBasketRewards() external nonReentrant {
        uint256 amount = pendingBasketRewards;
        require(amount > 0, "No basket rewards");
        require(_tryForwardBasket(amount), "Basket routing unavailable");
    }

    function _tryForwardBasket(uint256 amount) private returns (bool forwarded) {
        // Mint callers historically catch pool failures. Optional reward delivery
        // must never revert the mandatory holder/provider accounting and let an
        // upstream caller redirect their fee to treasury. Retain the fee instead.
        if (gasleft() < BASKET_ROUTING_GAS_LIMIT * 64 / 63 + 100_000) {
            emit BasketRewardForwardingFailed(amount);
            return false;
        }
        pendingBasketRewards -= amount;
        totalBasketForwarded += amount;
        try basketRewards.depositNative{value: amount, gas: BASKET_ROUTING_GAS_LIMIT}() {
            forwarded = true;
            emit BasketRewardsForwarded(amount);
        } catch {
            pendingBasketRewards += amount;
            totalBasketForwarded -= amount;
            emit BasketRewardForwardingFailed(amount);
        }
    }

    /**
     * @notice Atomically set holder + provider shares. Sums must equal MAX_BPS
     *         and each must be >= MIN_SIDE_BPS so admins can't accidentally
     *         zero out one side.
     */
    function setShares(uint16 _holderBps, uint16 _providerBps) external onlyOwner {
        require(_holderBps + _providerBps == MAX_BPS, "Must sum to 100%");
        require(_holderBps >= MIN_SIDE_BPS && _providerBps >= MIN_SIDE_BPS, "Each side >= 10%");
        uint16 oldHolder = holderShareBps;
        uint16 oldProvider = providerShareBps;
        holderShareBps = _holderBps;
        providerShareBps = _providerBps;
        emit SharesUpdated(oldHolder, oldProvider, _holderBps, _providerBps);
    }

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

    function setUnlockContract(address _unlock) external onlyOwner {
        address old = address(unlockContract);
        unlockContract = IBonzaiUnlock(_unlock);
        emit UnlockContractUpdated(old, _unlock);
    }

    function setStakingVault(address _vault) external onlyOwner {
        require(_vault.code.length > 0, "Invalid staking vault");
        address old = address(stakingVault);
        require(!stakingVaultFrozen || _vault == old, "Staking vault is frozen");
        require(IBonzaiStakePositions(_vault).bonzaiToken() == address(bonzaiToken), "Wrong staking token");
        stakingVault = IBonzaiStakePositions(_vault);
        emit StakingVaultUpdated(old, _vault);
    }

    function setCompanionContract(address _companion) external onlyOwner {
        require(_companion != address(0), "Invalid address");
        address old = companionContract;
        companionContract = _companion;
        emit CompanionContractUpdated(old, _companion);
    }

    /// @notice Authorize a clone as minter. Restricted to the collectibles
    ///         factory only — the owner CANNOT authorize arbitrary
    ///         contracts, preventing activity-gate griefing.
    function setAuthorizedMinter(address minter, bool authorized) external {
        require(msg.sender == collectiblesFactory, "Only collectiblesFactory");
        require(minter != address(0), "Invalid address");
        authorizedMinters[minter] = authorized;
        emit AuthorizedMinterUpdated(minter, authorized);
    }

    function setCollectiblesFactory(address _factory) external onlyOwner {
        address old = collectiblesFactory;
        collectiblesFactory = _factory;
        emit CollectiblesFactoryUpdated(old, _factory);
    }

    function setPoolThreshold(uint8 poolIndex, uint256 threshold) external onlyOwner {
        require(poolIndex < NUM_POOLS, "Invalid pool index");
        require(threshold > 0, "Threshold cannot be zero");
        uint256 newThreshold = threshold * 1e18;
        if (poolIndex > 0) require(newThreshold >= poolThresholds[poolIndex - 1], "Must be >= previous pool threshold");
        if (poolIndex < NUM_POOLS - 1) require(newThreshold <= poolThresholds[poolIndex + 1], "Must be <= next pool threshold");
        uint256 old = poolThresholds[poolIndex];
        poolThresholds[poolIndex] = newThreshold;
        emit PoolThresholdUpdated(poolIndex, old, newThreshold);
    }

    // Accrued entitlements have no expiry and cannot be confiscated or reused.
    function sweepUnclaimed(uint256) external pure { revert("Earned rewards never expire"); }
    function recirculateUnclaimed(uint256) external pure { revert("Earned rewards never expire"); }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function recoverERC20(address token, uint256 amount) external onlyOwner {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", treasury, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
    }

    function withdrawETH() external onlyOwner nonReentrant {
        uint256 totalHolder = 0;
        uint256 totalProvider = 0;
        for (uint8 i = 0; i < NUM_POOLS; ) {
            totalHolder += totalDeposited[i];
            totalProvider += totalProviderDeposited[i];
            unchecked { i++; }
        }
        uint256 accountable = (totalHolder + totalProvider) - totalClaimed - totalProviderWithdrawn - totalSwept - totalBasketForwarded;
        uint256 balance = address(this).balance;
        require(balance > accountable, "No surplus ETH to withdraw");
        uint256 surplus = balance - accountable;
        (bool sent, ) = treasury.call{value: surplus}("");
        require(sent, "ETH transfer failed");
    }

    receive() external payable {}

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════════════════════

    function _isUnlocked(address user) internal view returns (bool) {
        if (address(unlockContract) == address(0)) return false;
        try unlockContract.hasUnlocked(user) returns (bool result) {
            return result;
        } catch {
            return false;
        }
    }

    function _eligibleStake(address user) internal view returns (uint256) {
        require(address(stakingVault) != address(0), "Staking vault not configured");
        (uint256 amount,,,) = stakingVault.positions(user);
        return amount;
    }
}
