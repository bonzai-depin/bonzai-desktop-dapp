// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title BonzaiUnlock
 * @notice Simple and secure contract for unlocking all BonzAI levels with a single 1 ETH payment.
 * @dev Deployed on Arbitrum. Proceeds are split 50/50 between foundation and liquidity wallets.
 *
 * Security Features:
 * - ReentrancyGuard: Prevents reentrancy attacks on unlock and withdraw functions
 * - Ownable2Step: Two-step ownership transfer to prevent accidental transfers
 * - Pausable: Emergency pause capability
 * - Pull-over-push: Users must call unlock, proceeds are distributed via withdraw
 * - No external calls during state changes: State is updated before any transfers
 * - Explicit checks: All inputs validated, no implicit conversions
 */
contract BonzaiUnlock is Ownable2Step, ReentrancyGuard, Pausable {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Fixed unlock price: 1 ETH
    uint256 public constant UNLOCK_PRICE = 1 ether;

    /// @notice Basis points for percentage calculations (100% = 10000)
    uint256 private constant BASIS_POINTS = 10000;

    /// @notice Foundation share in basis points (50% = 5000)
    uint256 private constant FOUNDATION_SHARE_BPS = 5000;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE VARIABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Foundation wallet address (receives 50% of proceeds)
    address public foundationWallet;

    /// @notice Liquidity management wallet address (receives 50% of proceeds)
    address public liquidityWallet;

    /// @notice Mapping of user address => unlocked status
    mapping(address => bool) public hasUnlocked;

    /// @notice Total number of users who have unlocked
    uint256 public totalUnlocks;

    /// @notice Total ETH collected
    uint256 public totalCollected;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a user unlocks all levels
    event Unlocked(address indexed user, uint256 amount, uint256 timestamp);

    /// @notice Emitted when proceeds are withdrawn
    event ProceedsWithdrawn(
        address indexed foundationWallet,
        uint256 foundationAmount,
        address indexed liquidityWallet,
        uint256 liquidityAmount
    );

    /// @notice Emitted when foundation wallet is updated
    event FoundationWalletUpdated(address indexed oldWallet, address indexed newWallet);

    /// @notice Emitted when liquidity wallet is updated
    event LiquidityWalletUpdated(address indexed oldWallet, address indexed newWallet);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when user has already unlocked
    error AlreadyUnlocked();

    /// @notice Thrown when incorrect ETH amount is sent
    error IncorrectPayment(uint256 sent, uint256 required);

    /// @notice Thrown when a zero address is provided
    error ZeroAddress();

    /// @notice Thrown when there are no proceeds to withdraw
    error NoProceeds();

    /// @notice Thrown when ETH transfer fails
    error TransferFailed();

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Initialize the contract with wallet addresses
     * @param _foundationWallet Address to receive 50% of proceeds
     * @param _liquidityWallet Address to receive 50% of proceeds
     */
    constructor(
        address _foundationWallet,
        address _liquidityWallet
    ) Ownable(msg.sender) {
        if (_foundationWallet == address(0)) revert ZeroAddress();
        if (_liquidityWallet == address(0)) revert ZeroAddress();

        foundationWallet = _foundationWallet;
        liquidityWallet = _liquidityWallet;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // USER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Unlock all levels by paying 1 ETH
     * @dev Nonreentrant, checks-effects-interactions pattern
     */
    function unlock() external payable nonReentrant whenNotPaused {
        // Checks
        if (hasUnlocked[msg.sender]) revert AlreadyUnlocked();
        if (msg.value != UNLOCK_PRICE) revert IncorrectPayment(msg.value, UNLOCK_PRICE);

        // Effects - update state BEFORE any external interactions
        hasUnlocked[msg.sender] = true;

        // Use unchecked for gas optimization - overflow impossible with realistic values
        unchecked {
            totalUnlocks += 1;
            totalCollected += msg.value;
        }

        // Interactions - emit event (no external calls here)
        emit Unlocked(msg.sender, msg.value, block.timestamp);
    }

    /**
     * @notice Check if an address has unlocked all levels
     * @param user Address to check
     * @return True if user has unlocked
     */
    function isUnlocked(address user) external view returns (bool) {
        return hasUnlocked[user];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Withdraw accumulated proceeds to foundation and liquidity wallets
     * @dev Nonreentrant, only owner can call. Splits 50/50.
     */
    function withdrawProceeds() external nonReentrant onlyOwner {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoProceeds();

        // Calculate split - using unchecked as division cannot overflow
        uint256 foundationAmount;
        uint256 liquidityAmount;
        unchecked {
            foundationAmount = (balance * FOUNDATION_SHARE_BPS) / BASIS_POINTS;
            liquidityAmount = balance - foundationAmount; // Remainder to avoid rounding issues
        }

        // Cache addresses to prevent TOCTOU issues and save gas
        address foundation = foundationWallet;
        address liquidity = liquidityWallet;

        // Transfer to foundation wallet
        (bool successFoundation, ) = foundation.call{value: foundationAmount}("");
        if (!successFoundation) revert TransferFailed();

        // Transfer to liquidity wallet
        (bool successLiquidity, ) = liquidity.call{value: liquidityAmount}("");
        if (!successLiquidity) revert TransferFailed();

        emit ProceedsWithdrawn(foundation, foundationAmount, liquidity, liquidityAmount);
    }

    /**
     * @notice Update the foundation wallet address
     * @param _newWallet New foundation wallet address
     */
    function setFoundationWallet(address _newWallet) external onlyOwner {
        if (_newWallet == address(0)) revert ZeroAddress();

        address oldWallet = foundationWallet;
        foundationWallet = _newWallet;

        emit FoundationWalletUpdated(oldWallet, _newWallet);
    }

    /**
     * @notice Update the liquidity management wallet address
     * @param _newWallet New liquidity wallet address
     */
    function setLiquidityWallet(address _newWallet) external onlyOwner {
        if (_newWallet == address(0)) revert ZeroAddress();

        address oldWallet = liquidityWallet;
        liquidityWallet = _newWallet;

        emit LiquidityWalletUpdated(oldWallet, _newWallet);
    }

    /**
     * @notice Pause the contract (emergency stop)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get contract balance
     * @return Current ETH balance held by contract
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Get unlock statistics
     * @return _totalUnlocks Total number of users who unlocked
     * @return _totalCollected Total ETH collected
     * @return _currentBalance Current contract balance
     */
    function getStats() external view returns (
        uint256 _totalUnlocks,
        uint256 _totalCollected,
        uint256 _currentBalance
    ) {
        return (totalUnlocks, totalCollected, address(this).balance);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RECEIVE FUNCTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Reject direct ETH transfers - must use unlock()
     * @dev Prevents accidental ETH sends without unlocking
     */
    receive() external payable {
        revert("Use unlock() function");
    }

    /**
     * @notice Reject calls to non-existent functions
     */
    fallback() external payable {
        revert("Function does not exist");
    }
}
