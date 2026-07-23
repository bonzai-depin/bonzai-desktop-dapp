// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BonzaiStakingVault
 * @notice Utility staking for the BonzAI Proof-of-Contribution economy.
 *
 * Staking is not modeled as passive APY. It produces utility weight used by
 * publishing, curation, provider routing, fine-tune backing, companion work,
 * and downstream revenue allocation.
 */
contract BonzaiStakingVault is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    IERC20 public immutable bonzaiToken;

    uint16 public constant BPS = 10_000;
    uint32 public constant MAX_CONTRIBUTION_SCORE = 10_000;
    uint256 public constant MIN_LOCK = 0;
    uint256 public constant LOCK_30_DAYS = 30 days;
    uint256 public constant LOCK_90_DAYS = 90 days;
    uint256 public constant LOCK_180_DAYS = 180 days;
    uint256 public constant LOCK_365_DAYS = 365 days;

    uint256[6] public utilityTierThresholds;

    struct StakePosition {
        uint256 amount;
        uint256 lockedUntil;
        uint256 updatedAt;
        uint32 contributionScore;
    }

    mapping(address => StakePosition) public positions;
    mapping(address => bool) public scoreAttestors;
    uint256 public totalStaked;

    event Staked(address indexed wallet, uint256 amount, uint256 totalAmount, uint256 lockedUntil);
    event Unstaked(address indexed wallet, uint256 amount, uint256 remainingAmount);
    event LockExtended(address indexed wallet, uint256 lockedUntil);
    event ContributionScoreUpdated(address indexed wallet, uint32 oldScore, uint32 newScore);
    event UtilityTierThresholdUpdated(uint8 indexed tier, uint256 oldThreshold, uint256 newThreshold);
    event ScoreAttestorUpdated(address indexed attestor, bool authorized);

    error ZeroAmount();
    error InvalidLockDuration();
    error StakeStillLocked(uint256 lockedUntil);
    error InvalidTier(uint8 tier);
    error InvalidScore(uint32 score);
    error UnauthorizedAttestor();
    error InvalidThreshold(uint8 tier, uint256 threshold);

    constructor(address _bonzaiToken, uint256[6] memory _utilityTierThresholds) Ownable(msg.sender) {
        require(_bonzaiToken != address(0), "Invalid token");
        bonzaiToken = IERC20(_bonzaiToken);
        for (uint8 i = 0; i < 6; ) {
            if (_utilityTierThresholds[i] == 0 || (i > 0 && _utilityTierThresholds[i] <= _utilityTierThresholds[i - 1])) {
                revert InvalidThreshold(i + 1, _utilityTierThresholds[i]);
            }
            utilityTierThresholds[i] = _utilityTierThresholds[i];
            unchecked { i++; }
        }
    }

    function stake(uint256 amount, uint256 lockDuration) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        uint256 newLock = _lockEnd(lockDuration);
        StakePosition storage position = positions[msg.sender];

        bonzaiToken.safeTransferFrom(msg.sender, address(this), amount);

        position.amount += amount;
        position.updatedAt = block.timestamp;
        if (newLock > position.lockedUntil) {
            position.lockedUntil = newLock;
        }
        totalStaked += amount;

        emit Staked(msg.sender, amount, position.amount, position.lockedUntil);
    }

    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        StakePosition storage position = positions[msg.sender];
        if (block.timestamp < position.lockedUntil) revert StakeStillLocked(position.lockedUntil);
        require(position.amount >= amount, "Insufficient stake");

        position.amount -= amount;
        position.updatedAt = block.timestamp;
        totalStaked -= amount;
        bonzaiToken.safeTransfer(msg.sender, amount);

        emit Unstaked(msg.sender, amount, position.amount);
    }

    function extendLock(uint256 lockDuration) external whenNotPaused {
        StakePosition storage position = positions[msg.sender];
        require(position.amount > 0, "No stake");
        uint256 newLock = _lockEnd(lockDuration);
        require(newLock > position.lockedUntil, "Lock not extended");
        position.lockedUntil = newLock;
        position.updatedAt = block.timestamp;
        emit LockExtended(msg.sender, newLock);
    }

    function setContributionScore(address wallet, uint32 score) external {
        if (msg.sender != owner() && !scoreAttestors[msg.sender]) revert UnauthorizedAttestor();
        if (score > MAX_CONTRIBUTION_SCORE) revert InvalidScore(score);
        StakePosition storage position = positions[wallet];
        uint32 oldScore = position.contributionScore;
        position.contributionScore = score;
        position.updatedAt = block.timestamp;
        emit ContributionScoreUpdated(wallet, oldScore, score);
    }

    function setScoreAttestor(address attestor, bool authorized) external onlyOwner {
        require(attestor != address(0), "Invalid attestor");
        scoreAttestors[attestor] = authorized;
        emit ScoreAttestorUpdated(attestor, authorized);
    }

    function setUtilityTierThreshold(uint8 tier, uint256 threshold) external onlyOwner {
        if (tier < 1 || tier > 6) revert InvalidTier(tier);
        uint8 index = tier - 1;
        if (
            threshold == 0
            || (index > 0 && threshold <= utilityTierThresholds[index - 1])
            || (index < 5 && threshold >= utilityTierThresholds[index + 1])
        ) revert InvalidThreshold(tier, threshold);
        uint256 old = utilityTierThresholds[index];
        utilityTierThresholds[index] = threshold;
        emit UtilityTierThresholdUpdated(tier, old, threshold);
    }

    function utilityTier(address wallet) public view returns (uint8) {
        uint256 amount = positions[wallet].amount;
        uint8 tier = 0;
        for (uint8 i = 0; i < 6; ) {
            if (amount >= utilityTierThresholds[i]) {
                tier = i + 1;
            }
            unchecked { i++; }
        }
        return tier;
    }

    function canPublish(address wallet, uint8 requiredTier) external view returns (bool) {
        if (requiredTier == 0) return true;
        return utilityTier(wallet) >= requiredTier;
    }

    function lockMultiplierBps(address wallet) public view returns (uint16) {
        StakePosition storage position = positions[wallet];
        if (position.lockedUntil >= block.timestamp + LOCK_365_DAYS - 1 days) return 17_000;
        if (position.lockedUntil >= block.timestamp + LOCK_180_DAYS - 1 days) return 14_500;
        if (position.lockedUntil >= block.timestamp + LOCK_90_DAYS - 1 days) return 12_500;
        if (position.lockedUntil >= block.timestamp + LOCK_30_DAYS - 1 days) return 11_000;
        return 10_000;
    }

    function contributionMultiplierBps(address wallet) public view returns (uint16) {
        return uint16(BPS + positions[wallet].contributionScore);
    }

    function utilityWeight(address wallet) public view returns (uint256) {
        StakePosition storage position = positions[wallet];
        if (position.amount == 0) return 0;
        return position.amount * lockMultiplierBps(wallet) * contributionMultiplierBps(wallet) / BPS / BPS;
    }

    function positionOf(address wallet) external view returns (
        uint256 amount,
        uint256 lockedUntil,
        uint32 contributionScore,
        uint16 lockMultiplier,
        uint16 contributionMultiplier,
        uint8 tier,
        uint256 weight
    ) {
        StakePosition storage position = positions[wallet];
        return (
            position.amount,
            position.lockedUntil,
            position.contributionScore,
            lockMultiplierBps(wallet),
            contributionMultiplierBps(wallet),
            utilityTier(wallet),
            utilityWeight(wallet)
        );
    }

    function _lockEnd(uint256 lockDuration) internal view returns (uint256) {
        if (
            lockDuration != MIN_LOCK
            && lockDuration != LOCK_30_DAYS
            && lockDuration != LOCK_90_DAYS
            && lockDuration != LOCK_180_DAYS
            && lockDuration != LOCK_365_DAYS
        ) revert InvalidLockDuration();
        if (lockDuration == 0) return block.timestamp;
        return block.timestamp + lockDuration;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
