// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BonzaiFanPayment
 * @notice Non-custodial fan payment relay for BonzAI Live Streaming.
 *
 * Fans approve USDC to this contract on bonzai.sh/link (one-time approval).
 * When a fan generates content on a BonzAI-powered stream, the streamer's app
 * calls pullPayment() to charge the fan. Funds are split 80/20:
 *   - 80% to the streamer
 *   - 20% to the BonzAI treasury
 *
 * Non-custodial guarantees:
 *   - Contract only calls transferFrom (fan must have approved)
 *   - Max per-pull capped at MAX_CHARGE_USDC (prevents draining)
 *   - Fan can revoke approval at any time via USDC.approve(this, 0)
 *   - Contract holds no funds (instant forwarding)
 */
contract BonzaiFanPayment is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public treasury;

    uint256 public constant STREAMER_SHARE_BPS = 8000; // 80%
    uint256 public constant TREASURY_SHARE_BPS = 2000; // 20%
    uint256 public constant MAX_CHARGE_USDC = 5_000_000; // $5.00 max per pull (6 decimals)

    // Events
    event PaymentPulled(
        address indexed fan,
        address indexed streamer,
        uint256 totalAmount,
        uint256 streamerAmount,
        uint256 treasuryAmount,
        string contentType
    );
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // Errors
    error ZeroAddress();
    error AmountTooHigh(uint256 amount, uint256 max);
    error InsufficientAllowance(uint256 allowance, uint256 required);

    constructor(address _usdc, address _treasury) Ownable(msg.sender) {
        if (_usdc == address(0) || _treasury == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        treasury = _treasury;
    }

    /**
     * @notice Pull USDC from a fan's wallet. Called by the streamer's BonzAI app.
     * @param fan Fan's wallet address (must have approved this contract)
     * @param amount Total USDC amount (6 decimals)
     * @param streamer Streamer's wallet to receive 80%
     * @param contentType Content type string for event logging (e.g. "image", "video")
     */
    function pullPayment(
        address fan,
        uint256 amount,
        address streamer,
        string calldata contentType
    ) external nonReentrant {
        if (fan == address(0) || streamer == address(0)) revert ZeroAddress();
        if (amount > MAX_CHARGE_USDC) revert AmountTooHigh(amount, MAX_CHARGE_USDC);

        // Check fan has approved enough
        uint256 allowance = usdc.allowance(fan, address(this));
        if (allowance < amount) revert InsufficientAllowance(allowance, amount);

        // Calculate split
        uint256 streamerAmount = (amount * STREAMER_SHARE_BPS) / 10000;
        uint256 treasuryAmount = amount - streamerAmount;

        // Pull from fan, send to streamer and treasury
        usdc.safeTransferFrom(fan, streamer, streamerAmount);
        usdc.safeTransferFrom(fan, treasury, treasuryAmount);

        emit PaymentPulled(fan, streamer, amount, streamerAmount, treasuryAmount, contentType);
    }

    /**
     * @notice Update the treasury address.
     */
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }
}
