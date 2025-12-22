// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ISwapRouter
 * @notice Minimal interface for Uniswap V3 SwapRouter
 */
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/**
 * @title IWETH
 * @notice Minimal interface for WETH
 */
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 wad) external;
    function approve(address guy, uint256 wad) external returns (bool);
    function transfer(address dst, uint256 wad) external returns (bool);
}

/**
 * @title BonzaiLevelRegistry
 * @notice Allows users to unlock levels by paying ETH (alternative to holding BONZAI)
 * 
 * Features:
 * - Sequential unlocking: Must unlock LVL1 before LVL2, LVL2 before LVL3, etc.
 * - Buyback mechanism: Configurable % of ETH is swapped for BONZAI via Uniswap V3
 * - Purchased BONZAI is sent to treasury
 * 
 * @dev Deployed on Arbitrum One
 * @dev Pool: https://arbiscan.io/address/0xa77d77c9773c35e910acc2e30cefe52b54a58414
 */
contract BonzaiLevelRegistry is Ownable, ReentrancyGuard {
    
    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════
    
    // Arbitrum addresses
    address public constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address public constant BONZAI = 0x0a84edf70f30325151631ce7a61307d1f4d619a3;
    address public constant UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    
    // Pool fee tier (0.3% = 3000, 1% = 10000) - adjust based on actual pool
    uint24 public constant POOL_FEE = 3000;
    
    // Basis points denominator (10000 = 100%)
    uint256 public constant BASIS_POINTS = 10000;
    
    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════
    
    // Price per level (default 0.1 ETH)
    uint256 public levelPrice = 0.1 ether;
    
    // Bulk price for all 6 levels (default 0.4 ETH = ~33% discount)
    uint256 public bulkPrice = 0.4 ether;
    
    // Treasury receives ETH (after buyback) and bought BONZAI
    address public treasury;
    
    // Buyback percentage in basis points (2000 = 20%)
    uint256 public buybackPercentage = 2000;
    
    // Minimum BONZAI to receive from swap (slippage protection)
    // Set to 0 for no minimum (not recommended for production)
    uint256 public minBonzaiOut = 0;
    
    // Enable/disable buyback (for emergency)
    bool public buybackEnabled = true;
    
    // user => level => unlocked
    mapping(address => mapping(uint8 => bool)) public unlockedLevels;
    
    // Stats
    uint256 public totalEthCollected;
    uint256 public totalBonzaiBought;
    
    // ═══════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════
    
    event LevelUnlocked(address indexed user, uint8 level, uint256 paid);
    event AllLevelsUnlocked(address indexed user, uint256 paid);
    event BuybackExecuted(uint256 ethSpent, uint256 bonzaiReceived);
    event BuybackFailed(uint256 ethAmount, string reason);
    event ConfigUpdated(string param, uint256 oldValue, uint256 newValue);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    
    // ═══════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════
    
    error InvalidLevel();
    error AlreadyUnlocked();
    error InsufficientPayment();
    error PreviousLevelRequired(uint8 requiredLevel);
    error TransferFailed();
    error InvalidTreasury();
    error NothingToUnlock();
    error InvalidBatchSize();
    
    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════
    
    constructor(address _treasury) Ownable(msg.sender) {
        if (_treasury == address(0)) revert InvalidTreasury();
        treasury = _treasury;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // USER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Unlock a single level by paying ETH
     * @param level The level to unlock (1-6)
     * @dev Levels must be unlocked sequentially (1 → 2 → 3 → 4 → 5 → 6)
     */
    function unlockLevel(uint8 level) external payable nonReentrant {
        if (level < 1 || level > 6) revert InvalidLevel();
        if (unlockedLevels[msg.sender][level]) revert AlreadyUnlocked();
        if (msg.value < levelPrice) revert InsufficientPayment();
        
        // Check sequential unlock requirement
        if (level > 1 && !unlockedLevels[msg.sender][level - 1]) {
            revert PreviousLevelRequired(level - 1);
        }
        
        unlockedLevels[msg.sender][level] = true;
        
        _processPayment(msg.value);
        
        emit LevelUnlocked(msg.sender, level, msg.value);
    }
    
    /**
     * @notice Unlock multiple sequential levels at once
     * @param fromLevel Starting level (must be next unlockable)
     * @param toLevel Ending level (inclusive)
     * @dev Example: If you have LVL1, call unlockLevelRange(2, 4) to unlock 2, 3, 4
     */
    function unlockLevelRange(uint8 fromLevel, uint8 toLevel) external payable nonReentrant {
        if (fromLevel < 1 || toLevel > 6 || fromLevel > toLevel) revert InvalidLevel();
        
        // Verify starting point
        if (fromLevel > 1 && !unlockedLevels[msg.sender][fromLevel - 1]) {
            revert PreviousLevelRequired(fromLevel - 1);
        }
        
        // Count how many levels to unlock
        uint256 count = 0;
        for (uint8 lvl = fromLevel; lvl <= toLevel; lvl++) {
            if (!unlockedLevels[msg.sender][lvl]) {
                count++;
            }
        }
        
        if (count == 0) revert NothingToUnlock();
        
        uint256 totalCost = count * levelPrice;
        if (msg.value < totalCost) revert InsufficientPayment();
        
        // Unlock all levels in range
        for (uint8 lvl = fromLevel; lvl <= toLevel; lvl++) {
            if (!unlockedLevels[msg.sender][lvl]) {
                unlockedLevels[msg.sender][lvl] = true;
                emit LevelUnlocked(msg.sender, lvl, levelPrice);
            }
        }
        
        _processPayment(msg.value);
    }
    
    /**
     * @notice Unlock ALL 6 levels at discounted bulk price
     * @dev Unlocks all levels regardless of current state
     */
    function unlockAllLevels() external payable nonReentrant {
        if (msg.value < bulkPrice) revert InsufficientPayment();
        
        for (uint8 lvl = 1; lvl <= 6; lvl++) {
            unlockedLevels[msg.sender][lvl] = true;
        }
        
        _processPayment(msg.value);
        
        emit AllLevelsUnlocked(msg.sender, msg.value);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // INTERNAL: PAYMENT PROCESSING WITH BUYBACK
    // ═══════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Process ETH payment: buyback BONZAI + send remainder to treasury
     * @param amount Total ETH received
     */
    function _processPayment(uint256 amount) internal {
        totalEthCollected += amount;
        
        uint256 buybackAmount = 0;
        uint256 treasuryAmount = amount;
        
        if (buybackEnabled && buybackPercentage > 0) {
            buybackAmount = (amount * buybackPercentage) / BASIS_POINTS;
            treasuryAmount = amount - buybackAmount;
            
            // Execute buyback
            if (buybackAmount > 0) {
                _executeBuyback(buybackAmount);
            }
        }
        
        // Send remaining ETH to treasury
        if (treasuryAmount > 0) {
            (bool sent, ) = treasury.call{value: treasuryAmount}("");
            if (!sent) revert TransferFailed();
        }
    }
    
    /**
     * @notice Swap ETH for BONZAI via Uniswap V3 and send to treasury
     * @param ethAmount Amount of ETH to swap
     */
    function _executeBuyback(uint256 ethAmount) internal {
        try this._swapEthForBonzai{value: ethAmount}(ethAmount) returns (uint256 bonzaiReceived) {
            totalBonzaiBought += bonzaiReceived;
            emit BuybackExecuted(ethAmount, bonzaiReceived);
        } catch Error(string memory reason) {
            // Buyback failed - send ETH to treasury instead
            emit BuybackFailed(ethAmount, reason);
            (bool sent, ) = treasury.call{value: ethAmount}("");
            if (!sent) revert TransferFailed();
        } catch {
            // Buyback failed - send ETH to treasury instead
            emit BuybackFailed(ethAmount, "Unknown error");
            (bool sent, ) = treasury.call{value: ethAmount}("");
            if (!sent) revert TransferFailed();
        }
    }
    
    /**
     * @notice External function to execute swap (called via try/catch for error handling)
     * @dev This is external so it can be called with try/catch
     */
    function _swapEthForBonzai(uint256 ethAmount) external payable returns (uint256) {
        require(msg.sender == address(this), "Only self");
        
        ISwapRouter router = ISwapRouter(UNISWAP_V3_ROUTER);
        
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: WETH,
            tokenOut: BONZAI,
            fee: POOL_FEE,
            recipient: treasury, // BONZAI goes directly to treasury
            deadline: block.timestamp + 300, // 5 minute deadline
            amountIn: ethAmount,
            amountOutMinimum: minBonzaiOut,
            sqrtPriceLimitX96: 0 // No price limit
        });
        
        // Execute swap (router wraps ETH to WETH internally)
        uint256 amountOut = router.exactInputSingle{value: ethAmount}(params);
        
        return amountOut;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Check if user has unlocked a specific level via ETH payment
     */
    function hasUnlockedLevel(address user, uint8 level) external view returns (bool) {
        return unlockedLevels[user][level];
    }
    
    /**
     * @notice Get all unlocked levels for a user
     * @return Array of 6 booleans [LVL1, LVL2, LVL3, LVL4, LVL5, LVL6]
     */
    function getUserUnlockedLevels(address user) external view returns (bool[6] memory) {
        bool[6] memory result;
        for (uint8 i = 0; i < 6; i++) {
            result[i] = unlockedLevels[user][i + 1];
        }
        return result;
    }
    
    /**
     * @notice Get highest unlocked level for a user
     * @return 0 if none unlocked, 1-6 otherwise
     */
    function getHighestUnlockedLevel(address user) external view returns (uint8) {
        for (uint8 lvl = 6; lvl >= 1; lvl--) {
            if (unlockedLevels[user][lvl]) return lvl;
        }
        return 0;
    }
    
    /**
     * @notice Get the next level user can unlock
     * @return 0 if all unlocked, 1-6 otherwise
     */
    function getNextUnlockableLevel(address user) external view returns (uint8) {
        for (uint8 lvl = 1; lvl <= 6; lvl++) {
            if (!unlockedLevels[user][lvl]) return lvl;
        }
        return 0; // All unlocked
    }
    
    /**
     * @notice Calculate cost to unlock from current level to target level
     * @param user User address
     * @param targetLevel Target level (1-6)
     * @return cost Total ETH cost
     * @return levelsToUnlock Number of levels that will be unlocked
     */
    function calculateCostToLevel(address user, uint8 targetLevel) 
        external 
        view 
        returns (uint256 cost, uint8 levelsToUnlock) 
    {
        if (targetLevel < 1 || targetLevel > 6) return (0, 0);
        
        uint8 count = 0;
        for (uint8 lvl = 1; lvl <= targetLevel; lvl++) {
            if (!unlockedLevels[user][lvl]) {
                count++;
            }
        }
        
        return (uint256(count) * levelPrice, count);
    }
    
    /**
     * @notice Check if user can unlock a specific level
     * @return canUnlock True if level can be unlocked
     * @return reason Reason if cannot unlock
     */
    function canUnlockLevel(address user, uint8 level) 
        external 
        view 
        returns (bool canUnlock, string memory reason) 
    {
        if (level < 1 || level > 6) {
            return (false, "Invalid level");
        }
        if (unlockedLevels[user][level]) {
            return (false, "Already unlocked");
        }
        if (level > 1 && !unlockedLevels[user][level - 1]) {
            return (false, "Previous level required");
        }
        return (true, "");
    }
    
    /**
     * @notice Get buyback configuration
     */
    function getBuybackConfig() external view returns (
        bool enabled,
        uint256 percentage,
        uint256 minOut,
        uint256 totalBought
    ) {
        return (buybackEnabled, buybackPercentage, minBonzaiOut, totalBonzaiBought);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════
    
    function setLevelPrice(uint256 newPrice) external onlyOwner {
        emit ConfigUpdated("levelPrice", levelPrice, newPrice);
        levelPrice = newPrice;
    }
    
    function setBulkPrice(uint256 newPrice) external onlyOwner {
        emit ConfigUpdated("bulkPrice", bulkPrice, newPrice);
        bulkPrice = newPrice;
    }
    
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidTreasury();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }
    
    /**
     * @notice Set buyback percentage (in basis points)
     * @param newPercentage 0-10000 (0% - 100%)
     */
    function setBuybackPercentage(uint256 newPercentage) external onlyOwner {
        require(newPercentage <= BASIS_POINTS, "Max 100%");
        emit ConfigUpdated("buybackPercentage", buybackPercentage, newPercentage);
        buybackPercentage = newPercentage;
    }
    
    /**
     * @notice Set minimum BONZAI to receive from swap (slippage protection)
     */
    function setMinBonzaiOut(uint256 newMinOut) external onlyOwner {
        emit ConfigUpdated("minBonzaiOut", minBonzaiOut, newMinOut);
        minBonzaiOut = newMinOut;
    }
    
    /**
     * @notice Enable or disable buyback
     */
    function setBuybackEnabled(bool enabled) external onlyOwner {
        buybackEnabled = enabled;
    }
    
    /**
     * @notice Grant level access for free (airdrops, partnerships)
     * @dev Still requires sequential order
     */
    function grantLevel(address user, uint8 level) external onlyOwner {
        if (level < 1 || level > 6) revert InvalidLevel();
        
        // Grant all previous levels too (to maintain sequential requirement)
        for (uint8 lvl = 1; lvl <= level; lvl++) {
            if (!unlockedLevels[user][lvl]) {
                unlockedLevels[user][lvl] = true;
                emit LevelUnlocked(user, lvl, 0);
            }
        }
    }
    
    /**
     * @notice Grant all levels for free
     */
    function grantAllLevels(address user) external onlyOwner {
        for (uint8 lvl = 1; lvl <= 6; lvl++) {
            unlockedLevels[user][lvl] = true;
        }
        emit AllLevelsUnlocked(user, 0);
    }
    
    /**
     * @notice Batch grant levels to multiple users
     * @dev Grants up to specified level (inclusive of all previous)
     */
    function batchGrantLevel(address[] calldata users, uint8 upToLevel) external onlyOwner {
        if (upToLevel < 1 || upToLevel > 6) revert InvalidLevel();
        
        for (uint256 i = 0; i < users.length; i++) {
            for (uint8 lvl = 1; lvl <= upToLevel; lvl++) {
                if (!unlockedLevels[users[i]][lvl]) {
                    unlockedLevels[users[i]][lvl] = true;
                    emit LevelUnlocked(users[i], lvl, 0);
                }
            }
        }
    }
    
    /**
     * @notice Emergency withdraw (in case of stuck funds)
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool sent, ) = treasury.call{value: balance}("");
            if (!sent) revert TransferFailed();
        }
        
        // Also withdraw any stuck BONZAI
        uint256 bonzaiBalance = IERC20(BONZAI).balanceOf(address(this));
        if (bonzaiBalance > 0) {
            IERC20(BONZAI).transfer(treasury, bonzaiBalance);
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // RECEIVE
    // ═══════════════════════════════════════════════════════════════════════
    
    receive() external payable {}
}
