// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IReceiver} from "./cre/IReceiver.sol";

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
 *
 * Multi-chain balance verification (Chainlink CRE):
 *   1. User calls registerForEpoch() — emits RegistrationRequested event.
 *   2. A Chainlink CRE workflow (log-triggered) detects the event, fetches
 *      BONZAI balanceOf() on Ethereum and Arbitrum via RPC, and pushes the
 *      cross-chain total to this contract via the Chainlink Forwarder.
 *   3. onReport() receives the verified balance, adds the on-chain Base
 *      balance, and completes registration.
 *   4. Same flow for confirmClaim(): user requests, CRE verifies, callback
 *      confirms.
 *
 * Anti-gaming:
 *   - Oracle-verified multi-chain balance prevents inflated registrations.
 *   - Base balance verified on-chain via bonzaiToken.balanceOf().
 *   - 256-block gap between confirmClaim callback and claimEpoch prevents
 *     flash loan bypass.
 *   - Split-wallet registration is self-penalizing and insolvency-proof.
 *
 * Pool thresholds match the LVL system:
 *   [1K, 5K, 10K, 25K, 33K, 50K] BONZAI tokens.
 */
contract BonzaiMintPool is Ownable, ReentrancyGuard, Pausable, ERC165, IReceiver {
    /// @notice BONZAI ERC-20 token (on Base)
    IERC20 public bonzaiToken;

    /// @notice Treasury address for swept/surplus funds
    address public treasury;

    /// @notice BonzaiUnlock contract — unlocked users bypass pool thresholds
    IBonzaiUnlock public unlockContract;

    /// @notice Number of content-type pools
    uint256 public constant NUM_POOLS = 6;

    /// @notice Minimum block gap between confirmClaim and claimEpoch (flash loan protection)
    uint256 public constant MIN_CLAIM_BLOCK_GAP = 256;

    /// @notice LVL thresholds per pool (in token units with 18 decimals)
    uint256[6] public poolThresholds;

    /// @notice Snapshotted thresholds per epoch (frozen at first registration)
    mapping(uint256 => uint256[6]) public epochThresholds;
    mapping(uint256 => bool) public epochThresholdSnapshotted;

    // ═══════════════════════════════════════════════════════════════════════════
    // TIME-BASED EPOCH CONFIG
    // ═══════════════════════════════════════════════════════════════════════════

    uint256 public immutable genesisTime;
    uint256 public immutable epochDuration;

    // ═══════════════════════════════════════════════════════════════════════════
    // EPOCH STATE
    // ═══════════════════════════════════════════════════════════════════════════

    struct EpochData {
        uint256[6] poolDeposits;
        uint256 totalRegistered;
    }

    mapping(uint256 => EpochData) public epochs;
    mapping(uint256 => mapping(address => uint256)) public registeredBalances;
    mapping(uint256 => mapping(address => mapping(uint8 => bool))) public hasClaimed;
    mapping(uint256 => uint256[6]) public epochClaimedPerPool;
    mapping(uint256 => bool) public epochSwept;
    mapping(uint256 => mapping(address => uint256)) public claimConfirmedBlock;

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAINLINK CRE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Chainlink Forwarder address — only this address can call onReport
    address public forwarder;

    /// @notice Request types for pending CRE callbacks
    enum RequestType { NONE, REGISTER, CONFIRM_CLAIM }

    /// @notice Pending oracle request per user per epoch
    struct PendingRequest {
        RequestType requestType;
        uint256 epochId;
    }

    /// @notice Active pending request per user (only one at a time)
    mapping(address => PendingRequest) public pendingRequests;

    // ═══════════════════════════════════════════════════════════════════════════
    // LIFETIME STATS
    // ═══════════════════════════════════════════════════════════════════════════

    uint256[6] public totalDeposited;
    uint256 public totalClaimed;
    uint256 public totalSwept;

    // ═══════════════════════════════════════════════════════════════════════════
    // AUTHORIZED DEPOSITORS
    // ═══════════════════════════════════════════════════════════════════════════

    address public contentContract;
    address public royaltySplitter;
    address public feeHook;
    mapping(address => bool) public authorizedMinters;
    address public collectiblesFactory;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event PoolDeposit(uint8 indexed poolIndex, uint256 amount, address indexed depositor, uint256 indexed epochId);
    event EpochClaimed(uint256 indexed epochId, uint8 indexed poolIndex, address indexed claimer, uint256 amount);
    event Registered(uint256 indexed epochId, address indexed wallet, uint256 balance);
    event RegistrationRequested(uint256 indexed epochId, address indexed wallet);
    event ConfirmClaimRequested(uint256 indexed epochId, address indexed wallet);
    event ClaimConfirmed(uint256 indexed epochId, address indexed wallet, uint256 balance, uint256 blockNumber);
    event ContentContractUpdated(address indexed oldContract, address indexed newContract);
    event RoyaltySplitterUpdated(address indexed oldSplitter, address indexed newSplitter);
    event FeeHookUpdated(address indexed oldHook, address indexed newHook);
    event AuthorizedMinterUpdated(address indexed minter, bool authorized);
    event CollectiblesFactoryUpdated(address indexed oldFactory, address indexed newFactory);
    event PoolThresholdUpdated(uint8 indexed poolIndex, uint256 oldThreshold, uint256 newThreshold);
    event UnclaimedSwept(uint256 indexed epochId, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event EpochThresholdsSnapshotted(uint256 indexed epochId);
    event UnclaimedRecirculated(uint256 indexed fromEpoch, uint256 indexed toEpoch, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @param _bonzaiToken BONZAI ERC-20 token address (on Base)
     * @param _thresholds Array of 6 thresholds in full token units
     * @param _epochDuration Duration of each epoch in seconds
     * @param _treasury Treasury address for swept/surplus funds
     * @param _forwarder Chainlink CRE Forwarder address on Base
     */
    constructor(
        address _bonzaiToken,
        uint256[6] memory _thresholds,
        uint256 _epochDuration,
        address _treasury,
        address _forwarder
    ) Ownable(msg.sender) {
        require(_bonzaiToken != address(0), "Invalid token address");
        require(_epochDuration > 0, "Invalid epoch duration");
        require(_treasury != address(0), "Invalid treasury address");
        require(_forwarder != address(0), "Invalid forwarder address");

        bonzaiToken = IERC20(_bonzaiToken);
        epochDuration = _epochDuration;
        treasury = _treasury;
        forwarder = _forwarder;

        uint256 dayOfWeek = (block.timestamp / 1 days + 4) % 7;
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
    // REGISTRATION (user request → CRE workflow → onReport callback)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Request registration for the current epoch.
     *         Emits RegistrationRequested which triggers the CRE workflow.
     *         The workflow fetches cross-chain balances and calls onReport().
     */
    function registerForEpoch() external {
        uint256 epochId = currentEpoch();
        require(registeredBalances[epochId][msg.sender] == 0, "Already registered");
        require(pendingRequests[msg.sender].requestType == RequestType.NONE, "Request pending");

        pendingRequests[msg.sender] = PendingRequest({
            requestType: RequestType.REGISTER,
            epochId: epochId
        });

        emit RegistrationRequested(epochId, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DEPOSIT
    // ═══════════════════════════════════════════════════════════════════════════

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
    // CLAIM CONFIRMATION (user request → CRE workflow → onReport callback)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Request balance confirmation before claiming.
     *         Emits ConfirmClaimRequested which triggers the CRE workflow.
     */
    function confirmClaim(uint256 epochId) external {
        require(isEpochFinalized(epochId), "Epoch not ended yet");
        uint256 current = currentEpoch();
        require(current == epochId + 1, "Claim window closed");
        require(registeredBalances[epochId][msg.sender] > 0, "Not registered for this epoch");
        require(pendingRequests[msg.sender].requestType == RequestType.NONE, "Request pending");

        pendingRequests[msg.sender] = PendingRequest({
            requestType: RequestType.CONFIRM_CLAIM,
            epochId: epochId
        });

        emit ConfirmClaimRequested(epochId, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAINLINK CRE CALLBACK (called by Forwarder)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Receives verified cross-chain balance from the CRE workflow.
     * @param metadata CRE metadata (workflowId, workflowName, workflowOwner)
     * @param report ABI-encoded (address user, uint256 crossChainBalance)
     */
    function onReport(
        bytes calldata metadata,
        bytes calldata report
    ) external override {
        require(msg.sender == forwarder, "Only forwarder");

        (address user, uint256 crossChainBalance) = abi.decode(report, (address, uint256));

        PendingRequest memory req = pendingRequests[user];
        require(req.requestType != RequestType.NONE, "No pending request");

        // Clear pending request
        delete pendingRequests[user];

        // Add verifiable Base balance on-chain
        uint256 baseBalance = bonzaiToken.balanceOf(user);
        uint256 totalBalance = crossChainBalance + baseBalance;

        if (req.requestType == RequestType.REGISTER) {
            _completeRegistration(user, req.epochId, totalBalance);
        } else {
            _completeConfirmClaim(user, req.epochId, totalBalance);
        }
    }

    function _completeRegistration(address user, uint256 epochId, uint256 balance) internal {
        // Guard: epoch may have changed between request and callback
        if (epochId != currentEpoch()) return;
        if (registeredBalances[epochId][user] > 0) return;
        if (balance == 0) return;

        // Snapshot thresholds on first registration
        if (!epochThresholdSnapshotted[epochId]) {
            for (uint8 i = 0; i < NUM_POOLS;) {
                epochThresholds[epochId][i] = poolThresholds[i];
                unchecked { i++; }
            }
            epochThresholdSnapshotted[epochId] = true;
            emit EpochThresholdsSnapshotted(epochId);
        }

        // Unlocked users bypass threshold
        bool isUnlocked = false;
        if (address(unlockContract) != address(0)) {
            try unlockContract.hasUnlocked(user) returns (bool result) {
                isUnlocked = result;
            } catch {}
        }
        if (!isUnlocked && balance < epochThresholds[epochId][0]) return;

        registeredBalances[epochId][user] = balance;
        epochs[epochId].totalRegistered += balance;

        emit Registered(epochId, user, balance);
    }

    function _completeConfirmClaim(address user, uint256 epochId, uint256 currentBalance) internal {
        if (currentEpoch() != epochId + 1) return;

        uint256 registeredBal = registeredBalances[epochId][user];
        if (registeredBal == 0) return;
        if (currentBalance < registeredBal) return;

        claimConfirmedBlock[epochId][user] = block.number;
        emit ClaimConfirmed(epochId, user, registeredBal, block.number);
    }

    /// @inheritdoc ERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || super.supportsInterface(interfaceId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CLAIM
    // ═══════════════════════════════════════════════════════════════════════════

    function claimEpoch(
        uint256 epochId,
        uint8 poolIndex
    ) external nonReentrant whenNotPaused {
        require(poolIndex < NUM_POOLS, "Invalid pool index");
        require(isEpochFinalized(epochId), "Epoch not ended yet");
        require(!hasClaimed[epochId][msg.sender][poolIndex], "Already claimed");

        uint256 current = currentEpoch();
        require(current == epochId + 1, "Claim window closed");

        uint256 confirmedBlock = claimConfirmedBlock[epochId][msg.sender];
        require(confirmedBlock > 0, "Must call confirmClaim first");
        require(block.number >= confirmedBlock + MIN_CLAIM_BLOCK_GAP, "Must wait 256 blocks after confirmClaim");

        uint256 balance = registeredBalances[epochId][msg.sender];
        require(balance > 0, "Not registered for this epoch");

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

    function claimEpochBatch(
        uint256 epochId,
        uint8[] calldata poolIndices
    ) external nonReentrant whenNotPaused {
        require(isEpochFinalized(epochId), "Epoch not ended yet");

        uint256 current = currentEpoch();
        require(current == epochId + 1, "Claim window closed");

        uint256 confirmedBlock = claimConfirmedBlock[epochId][msg.sender];
        require(confirmedBlock > 0, "Must call confirmClaim first");
        require(block.number >= confirmedBlock + MIN_CLAIM_BLOCK_GAP, "Must wait 256 blocks after confirmClaim");

        uint256 balance = registeredBalances[epochId][msg.sender];
        require(balance > 0, "Not registered for this epoch");

        EpochData storage epoch = epochs[epochId];
        require(epoch.totalRegistered > 0, "No registrations");

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

    function getEpochDeposits(uint256 epochId) external view returns (uint256[6] memory) {
        return epochs[epochId].poolDeposits;
    }

    function getEpochInfo(uint256 epochId) external view returns (
        uint256 startTime, uint256 endTime, uint256 totalRegistered, bool finalized
    ) {
        return (epochStartTime(epochId), epochEndTime(epochId), epochs[epochId].totalRegistered, isEpochFinalized(epochId));
    }

    function getAllTotalDeposited() external view returns (uint256[6] memory) { return totalDeposited; }
    function getAllPoolThresholds() external view returns (uint256[6] memory) { return poolThresholds; }

    function qualifiesForPool(address user, uint8 poolIndex) external view returns (bool) {
        if (poolIndex >= NUM_POOLS) return false;
        uint256 epochId = currentEpoch();
        uint256 regBalance = registeredBalances[epochId][user];
        if (regBalance > 0) return regBalance >= poolThresholds[poolIndex];
        return false;
    }

    function previewClaim(uint256 epochId, uint8 poolIndex, address user) external view returns (uint256) {
        if (poolIndex >= NUM_POOLS) return 0;
        if (!isEpochFinalized(epochId)) return 0;
        EpochData storage epoch = epochs[epochId];
        uint256 balance = registeredBalances[epochId][user];
        if (balance == 0) return 0;

        uint256 threshold = epochThresholdSnapshotted[epochId]
            ? epochThresholds[epochId][poolIndex] : poolThresholds[poolIndex];
        bool isUnlocked = false;
        if (address(unlockContract) != address(0)) {
            try unlockContract.hasUnlocked(user) returns (bool result) { isUnlocked = result; } catch {}
        }
        if (!isUnlocked && balance < threshold) return 0;
        if (epoch.totalRegistered == 0) return 0;
        return (epoch.poolDeposits[poolIndex] * balance) / epoch.totalRegistered;
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

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function setForwarder(address _forwarder) external onlyOwner {
        require(_forwarder != address(0), "Invalid address");
        forwarder = _forwarder;
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
        unlockContract = IBonzaiUnlock(_unlock);
    }

    function setAuthorizedMinter(address minter, bool authorized) external {
        require(msg.sender == owner() || msg.sender == collectiblesFactory, "Unauthorized");
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

    function sweepUnclaimed(uint256 epochId) external onlyOwner {
        require(isEpochFinalized(epochId), "Epoch not ended");
        require(currentEpoch() >= epochId + 2, "Claim window still open");
        require(!epochSwept[epochId], "Already swept");
        epochSwept[epochId] = true;
        uint256 sweepAmount = 0;
        EpochData storage epoch = epochs[epochId];
        for (uint8 i = 0; i < NUM_POOLS; ) {
            sweepAmount += epoch.poolDeposits[i] - epochClaimedPerPool[epochId][i];
            unchecked { i++; }
        }
        if (sweepAmount > 0) {
            totalSwept += sweepAmount;
            (bool ok, ) = treasury.call{value: sweepAmount}("");
            require(ok, "Sweep transfer failed");
            emit UnclaimedSwept(epochId, sweepAmount);
        }
    }

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
                totalRecirculated += unclaimed;
            }
            unchecked { ++i; }
        }
        if (totalRecirculated > 0) {
            emit UnclaimedRecirculated(epochId, current, totalRecirculated);
        }
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function recoverERC20(address token, uint256 amount) external onlyOwner {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", treasury, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
    }

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

    receive() external payable {}
}
