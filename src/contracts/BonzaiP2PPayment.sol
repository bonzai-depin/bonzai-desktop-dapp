// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title BonzaiP2PPayment
 * @notice Handles USDC payments for P2P inference in the BonzAI network
 * @dev Uses EIP-712 signatures for off-chain payment authorization (x402 flow)
 */
contract BonzaiP2PPayment is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        "Payment(address providerId,uint256 amount,uint256 nonce,uint256 expiry,string pipeline)"
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    // USDC token
    IERC20 public immutable usdc;

    // Provider registry (for recording earnings)
    address public providerRegistry;

    // Platform treasury
    address public treasury;

    // Platform fee in basis points (250 = 2.5%)
    uint256 public platformFeeBps;

    // Used nonces per consumer (prevent replay)
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    // Consumer balances (pre-deposited for faster payments)
    mapping(address => uint256) public balances;

    // Provider earnings pending withdrawal
    mapping(address => uint256) public pendingWithdrawals;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event Deposited(address indexed consumer, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event PaymentProcessed(
        address indexed consumer,
        address indexed provider,
        uint256 amount,
        uint256 platformFee,
        string pipeline
    );
    event PaymentSettled(
        address indexed consumer,
        address indexed provider,
        uint256 amount,
        bytes32 paymentHash
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    constructor(
        address _usdc,
        address _treasury,
        uint256 _platformFeeBps
    ) Ownable(msg.sender) EIP712("BonzAI x402", "1") {
        usdc = IERC20(_usdc);
        treasury = _treasury;
        platformFeeBps = _platformFeeBps;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DEPOSITS & WITHDRAWALS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Deposit USDC for faster inference payments
     * @param amount Amount of USDC to deposit
     */
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;

        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw deposited USDC
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(balances[msg.sender] >= amount, "Insufficient balance");

        balances[msg.sender] -= amount;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Provider withdraws earned USDC
     */
    function withdrawEarnings() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No earnings to withdraw");

        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PAYMENT PROCESSING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Process a signed payment (called by provider after completing inference)
     * @param consumer Consumer's address
     * @param provider Provider's address
     * @param amount Payment amount in USDC
     * @param nonce Unique nonce to prevent replay
     * @param expiry Payment expiration timestamp
     * @param pipeline Pipeline identifier
     * @param signature Consumer's EIP-712 signature
     */
    function processPayment(
        address consumer,
        address provider,
        uint256 amount,
        uint256 nonce,
        uint256 expiry,
        string calldata pipeline,
        bytes calldata signature
    ) external nonReentrant {
        // Verify expiry
        require(block.timestamp <= expiry, "Payment expired");

        // Verify nonce not used
        require(!usedNonces[consumer][nonce], "Nonce already used");

        // Mark nonce as used
        usedNonces[consumer][nonce] = true;

        // Verify signature
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_TYPEHASH,
            provider,
            amount,
            nonce,
            expiry,
            keccak256(bytes(pipeline))
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        require(signer == consumer, "Invalid signature");

        // Process payment
        _processPayment(consumer, provider, amount, pipeline);
    }

    /**
     * @notice Direct payment (consumer pays provider directly without signature)
     * @param provider Provider's address
     * @param amount Payment amount in USDC
     * @param pipeline Pipeline identifier
     */
    function payDirect(
        address provider,
        uint256 amount,
        string calldata pipeline
    ) external nonReentrant {
        // Transfer from consumer
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Process payment
        _processPayment(msg.sender, provider, amount, pipeline);
    }

    /**
     * @notice Pay from deposited balance
     * @param provider Provider's address
     * @param amount Payment amount in USDC
     * @param pipeline Pipeline identifier
     */
    function payFromBalance(
        address provider,
        uint256 amount,
        string calldata pipeline
    ) external nonReentrant {
        require(balances[msg.sender] >= amount, "Insufficient balance");

        balances[msg.sender] -= amount;
        _processPayment(msg.sender, provider, amount, pipeline);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get consumer's deposited balance
     */
    function getBalance(address consumer) external view returns (uint256) {
        return balances[consumer];
    }

    /**
     * @notice Get provider's pending withdrawals
     */
    function getPendingWithdrawals(address provider) external view returns (uint256) {
        return pendingWithdrawals[provider];
    }

    /**
     * @notice Check if a nonce has been used
     */
    function isNonceUsed(address consumer, uint256 nonce) external view returns (bool) {
        return usedNonces[consumer][nonce];
    }

    /**
     * @notice Get the domain separator for EIP-712
     */
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Set provider registry address
     */
    function setProviderRegistry(address _providerRegistry) external onlyOwner {
        providerRegistry = _providerRegistry;
    }

    /**
     * @notice Update platform fee
     */
    function setPlatformFee(uint256 _platformFeeBps) external onlyOwner {
        require(_platformFeeBps <= 1000, "Fee too high"); // Max 10%
        platformFeeBps = _platformFeeBps;
    }

    /**
     * @notice Update treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════════════════════

    function _processPayment(
        address consumer,
        address provider,
        uint256 amount,
        string memory pipeline
    ) internal {
        require(amount > 0, "Amount must be positive");
        require(provider != address(0), "Invalid provider");

        // Calculate platform fee
        uint256 platformFee = (amount * platformFeeBps) / 10000;
        uint256 providerAmount = amount - platformFee;

        // Credit provider (they can withdraw later)
        pendingWithdrawals[provider] += providerAmount;

        // Send platform fee to treasury
        if (platformFee > 0) {
            usdc.safeTransfer(treasury, platformFee);
        }

        // Record earnings in provider registry (if set)
        if (providerRegistry != address(0)) {
            // Call recordEarnings on the registry
            // Note: This is a simplified interface, actual implementation
            // should use proper interface
            (bool success, ) = providerRegistry.call(
                abi.encodeWithSignature(
                    "recordEarnings(address,uint256)",
                    provider,
                    providerAmount
                )
            );
            // Don't revert if registry call fails
            if (!success) {
                // Log or handle silently
            }
        }

        emit PaymentProcessed(consumer, provider, amount, platformFee, pipeline);
    }
}
