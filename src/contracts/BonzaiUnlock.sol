// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BonzaiUnlock
 * @author BonzAI Team
 * @notice Secure contract for unlocking BonzAI premium features with ETH payment.
 * @dev Deployed on Base. Proceeds split 50/50 between foundation and liquidity wallets.
 *
 * Features:
 * - Pay to unlock all levels for yourself
 * - Pay to unlock for another wallet (gift purchase)
 * - Transfer your unlock rights to another wallet
 * - Admin can gift unlocks for free (promotions, partnerships)
 * - Adjustable unlock price
 * - ERC20 token recovery for accidentally sent tokens
 */
contract BonzaiUnlock is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Basis points for percentage calculations (100% = 10000)
    uint256 private constant BASIS_POINTS = 10000;

    /// @notice Foundation share in basis points (50% = 5000)
    uint256 private constant FOUNDATION_SHARE_BPS = 5000;

    /// @notice Maximum recipients per batch gift (prevents gas limit issues)
    uint256 public constant MAX_BATCH_SIZE = 100;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE VARIABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Current unlock price in wei
    uint256 public unlockPrice;

    /// @notice Foundation wallet address (receives 50% of proceeds)
    address public foundationWallet;

    /// @notice Liquidity management wallet address (receives 50% of proceeds)
    address public liquidityWallet;

    /// @notice Mapping of user address => unlocked status
    mapping(address => bool) public hasUnlocked;

    /// @notice Total number of users who have unlocked (paid)
    uint256 public totalPaidUnlocks;

    /// @notice Total number of gifted unlocks
    uint256 public totalGiftedUnlocks;

    /// @notice Total ETH collected from paid unlocks
    uint256 public totalCollected;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a user unlocks (paid)
    event Unlocked(
        address indexed user,
        address indexed paidBy,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Emitted when unlock rights are transferred
    event UnlockTransferred(
        address indexed from,
        address indexed to,
        uint256 timestamp
    );

    /// @notice Emitted when admin gifts an unlock
    event UnlockGifted(
        address indexed recipient,
        address indexed giftedBy,
        uint256 timestamp
    );

    /// @notice Emitted when an address is skipped in batch gift
    event GiftSkipped(address indexed recipient, string reason);

    /// @notice Emitted when unlock price is updated
    event UnlockPriceUpdated(
        uint256 oldPrice,
        uint256 newPrice,
        uint256 timestamp
    );

    /// @notice Emitted when proceeds are withdrawn
    event ProceedsWithdrawn(
        address indexed foundationWallet,
        uint256 foundationAmount,
        address indexed liquidityWallet,
        uint256 liquidityAmount,
        uint256 timestamp
    );

    /// @notice Emitted when ERC20 tokens are recovered
    event TokensRecovered(
        address indexed token,
        address indexed to,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Emitted when foundation wallet is updated
    event FoundationWalletUpdated(
        address indexed oldWallet,
        address indexed newWallet
    );

    /// @notice Emitted when liquidity wallet is updated
    event LiquidityWalletUpdated(
        address indexed oldWallet,
        address indexed newWallet
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when user has already unlocked
    error AlreadyUnlocked(address user);

    /// @notice Thrown when user has not unlocked (for transfer)
    error NotUnlocked(address user);

    /// @notice Thrown when incorrect ETH amount is sent
    error IncorrectPayment(uint256 sent, uint256 required);

    /// @notice Thrown when a zero address is provided
    error ZeroAddress();

    /// @notice Thrown when caller tries to transfer to themselves
    error SelfTransfer();

    /// @notice Thrown when there are no proceeds to withdraw
    error NoProceeds();

    /// @notice Thrown when ETH transfer fails
    error TransferFailed(address recipient);

    /// @notice Thrown when trying to recover ETH via token recovery
    error CannotRecoverETH();

    /// @notice Thrown when token recovery amount is zero
    error ZeroAmount();

    /// @notice Thrown when batch size exceeds maximum
    error BatchSizeTooLarge(uint256 size, uint256 max);

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Ensures the address is not zero
     * @param addr Address to validate
     */
    modifier notZeroAddress(address addr) {
        if (addr == address(0)) revert ZeroAddress();
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Initialize the contract with wallet addresses and initial price
     * @param _foundationWallet Address to receive 50% of proceeds
     * @param _liquidityWallet Address to receive 50% of proceeds
     * @param _initialPrice Initial unlock price in wei
     */
    constructor(
        address _foundationWallet,
        address _liquidityWallet,
        uint256 _initialPrice
    ) Ownable(msg.sender) {
        if (_foundationWallet == address(0)) revert ZeroAddress();
        if (_liquidityWallet == address(0)) revert ZeroAddress();

        foundationWallet = _foundationWallet;
        liquidityWallet = _liquidityWallet;
        unlockPrice = _initialPrice;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // USER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Unlock all levels for yourself by paying the unlock price
     * @dev Nonreentrant, checks-effects-interactions pattern
     */
    function unlock() external payable nonReentrant whenNotPaused {
        _processUnlock(msg.sender, msg.sender);
    }

    /**
     * @notice Unlock all levels for another wallet (gift purchase)
     * @param recipient Address to receive the unlock
     * @dev Nonreentrant, allows gifting unlocks to other users
     */
    function unlockFor(address recipient) 
        external 
        payable 
        nonReentrant 
        whenNotPaused 
        notZeroAddress(recipient) 
    {
        _processUnlock(recipient, msg.sender);
    }

    /**
     * @notice Transfer your unlock rights to another wallet
     * @param to Address to transfer unlock rights to
     * @dev Useful if user wants to migrate to a new wallet
     */
    function transferUnlock(address to) 
        external 
        nonReentrant 
        whenNotPaused 
        notZeroAddress(to) 
    {
        // Checks
        if (!hasUnlocked[msg.sender]) revert NotUnlocked(msg.sender);
        if (hasUnlocked[to]) revert AlreadyUnlocked(to);
        if (to == msg.sender) revert SelfTransfer();

        // Effects
        hasUnlocked[msg.sender] = false;
        hasUnlocked[to] = true;

        // Interactions (event only)
        emit UnlockTransferred(msg.sender, to, block.timestamp);
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
     * @notice Gift unlock to a wallet for free (admin only)
     * @param recipient Address to receive the free unlock
     * @dev For promotions, partnerships, or compensation
     */
    function giftUnlock(address recipient) 
        external 
        onlyOwner 
        nonReentrant
        notZeroAddress(recipient) 
    {
        if (hasUnlocked[recipient]) revert AlreadyUnlocked(recipient);

        hasUnlocked[recipient] = true;
        
        unchecked {
            totalGiftedUnlocks += 1;
        }

        emit UnlockGifted(recipient, msg.sender, block.timestamp);
    }

    /**
     * @notice Gift unlocks to multiple wallets (batch)
     * @param recipients Array of addresses to receive free unlocks
     * @dev Gas-efficient batch gifting for airdrops, limited to MAX_BATCH_SIZE
     * @return gifted Number of addresses actually gifted
     */
    function batchGiftUnlock(address[] calldata recipients)
        external
        onlyOwner
        nonReentrant
        returns (uint256 gifted)
    {
        uint256 length = recipients.length;

        // Prevent gas limit attacks
        if (length > MAX_BATCH_SIZE) {
            revert BatchSizeTooLarge(length, MAX_BATCH_SIZE);
        }

        for (uint256 i = 0; i < length; ) {
            address recipient = recipients[i];

            // Skip zero addresses and already unlocked users (don't revert)
            if (recipient == address(0)) {
                emit GiftSkipped(recipient, "zero address");
            } else if (hasUnlocked[recipient]) {
                emit GiftSkipped(recipient, "already unlocked");
            } else {
                hasUnlocked[recipient] = true;
                emit UnlockGifted(recipient, msg.sender, block.timestamp);

                unchecked {
                    gifted += 1;
                }
            }

            unchecked {
                i += 1;
            }
        }

        unchecked {
            totalGiftedUnlocks += gifted;
        }
    }

    /**
     * @notice Update the unlock price
     * @param _newPrice New unlock price in wei
     */
    function setUnlockPrice(uint256 _newPrice) external onlyOwner {
        uint256 oldPrice = unlockPrice;
        unlockPrice = _newPrice;

        emit UnlockPriceUpdated(oldPrice, _newPrice, block.timestamp);
    }

    /**
     * @notice Withdraw accumulated ETH proceeds to foundation and liquidity wallets
     * @dev Nonreentrant, only owner can call. Splits 50/50.
     */
    function withdrawProceeds() external nonReentrant onlyOwner {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoProceeds();

        // Calculate split using basis points
        uint256 foundationAmount;
        uint256 liquidityAmount;
        unchecked {
            foundationAmount = (balance * FOUNDATION_SHARE_BPS) / BASIS_POINTS;
            liquidityAmount = balance - foundationAmount; // Remainder avoids rounding loss
        }

        // Cache addresses (gas optimization + prevents TOCTOU)
        address foundation = foundationWallet;
        address liquidity = liquidityWallet;

        // Transfer to foundation wallet
        (bool successFoundation, ) = foundation.call{value: foundationAmount}("");
        if (!successFoundation) revert TransferFailed(foundation);

        // Transfer to liquidity wallet
        (bool successLiquidity, ) = liquidity.call{value: liquidityAmount}("");
        if (!successLiquidity) revert TransferFailed(liquidity);

        emit ProceedsWithdrawn(
            foundation,
            foundationAmount,
            liquidity,
            liquidityAmount,
            block.timestamp
        );
    }

    /**
     * @notice Recover ERC20 tokens accidentally sent to this contract
     * @param token Address of the ERC20 token to recover
     * @param to Address to send recovered tokens to
     * @param amount Amount of tokens to recover
     * @dev Cannot recover ETH - use withdrawProceeds for that
     */
    function recoverERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner nonReentrant notZeroAddress(token) notZeroAddress(to) {
        if (amount == 0) revert ZeroAmount();

        // Use SafeERC20 for safe transfer
        IERC20(token).safeTransfer(to, amount);

        emit TokensRecovered(token, to, amount, block.timestamp);
    }

    /**
     * @notice Update the foundation wallet address
     * @param _newWallet New foundation wallet address
     */
    function setFoundationWallet(address _newWallet) 
        external 
        onlyOwner 
        notZeroAddress(_newWallet) 
    {
        address oldWallet = foundationWallet;
        foundationWallet = _newWallet;

        emit FoundationWalletUpdated(oldWallet, _newWallet);
    }

    /**
     * @notice Update the liquidity management wallet address
     * @param _newWallet New liquidity wallet address
     */
    function setLiquidityWallet(address _newWallet) 
        external 
        onlyOwner 
        notZeroAddress(_newWallet) 
    {
        address oldWallet = liquidityWallet;
        liquidityWallet = _newWallet;

        emit LiquidityWalletUpdated(oldWallet, _newWallet);
    }

    /**
     * @notice Pause unlock functions (emergency stop)
     * @dev Does not pause withdrawals or admin functions
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause unlock functions
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get contract ETH balance
     * @return Current ETH balance held by contract
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Get comprehensive unlock statistics
     * @return _totalPaidUnlocks Total paid unlocks
     * @return _totalGiftedUnlocks Total gifted unlocks
     * @return _totalUnlocks Combined total unlocks
     * @return _totalCollected Total ETH collected
     * @return _currentBalance Current contract balance
     * @return _currentPrice Current unlock price
     */
    function getStats() external view returns (
        uint256 _totalPaidUnlocks,
        uint256 _totalGiftedUnlocks,
        uint256 _totalUnlocks,
        uint256 _totalCollected,
        uint256 _currentBalance,
        uint256 _currentPrice
    ) {
        return (
            totalPaidUnlocks,
            totalGiftedUnlocks,
            totalPaidUnlocks + totalGiftedUnlocks,
            totalCollected,
            address(this).balance,
            unlockPrice
        );
    }

    /**
     * @notice Check multiple addresses for unlock status (batch query)
     * @param users Array of addresses to check
     * @return Array of booleans indicating unlock status
     */
    function areUnlocked(address[] calldata users) external view returns (bool[] memory) {
        uint256 length = users.length;
        bool[] memory results = new bool[](length);
        
        for (uint256 i = 0; i < length; ) {
            results[i] = hasUnlocked[users[i]];
            unchecked {
                i += 1;
            }
        }
        
        return results;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Internal function to process unlock payments
     * @param recipient Address to receive the unlock
     * @param payer Address paying for the unlock
     */
    function _processUnlock(address recipient, address payer) internal {
        // Cache price to prevent reentrancy manipulation
        uint256 price = unlockPrice;

        // Checks
        if (hasUnlocked[recipient]) revert AlreadyUnlocked(recipient);
        if (msg.value != price) revert IncorrectPayment(msg.value, price);

        // Effects - update state BEFORE any potential external interactions
        hasUnlocked[recipient] = true;

        unchecked {
            totalPaidUnlocks += 1;
            totalCollected += msg.value;
        }

        // Interactions - emit event only, no external calls
        emit Unlocked(recipient, payer, msg.value, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RECEIVE / FALLBACK
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Reject direct ETH transfers - must use unlock() or unlockFor()
     * @dev Prevents accidental ETH sends without proper unlock
     */
    receive() external payable {
        revert("Use unlock() or unlockFor()");
    }

    /**
     * @notice Reject calls to non-existent functions
     */
    fallback() external payable {
        revert("Function does not exist");
    }
}
