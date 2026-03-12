// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title IBonzaiProviderRegistry
 * @notice Interface for the provider registry contract
 */
interface IBonzaiProviderRegistry {
    function recordEarnings(address provider, uint256 amount) external;
}

/**
 * @title BonzaiPayment
 * @notice Handles ETH and USDC payments for P2P inference in the BonzAI network
 * @dev Uses EIP-712 signatures for off-chain payment authorization (x402 flow).
 *      Supports both ETH (native) and USDC (ERC-20) payment tokens.
 */
contract BonzaiPayment is Ownable, ReentrancyGuard, Pausable, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ═══════════════════════════════════════════════════════════════════════════
    // ENUMS
    // ═══════════════════════════════════════════════════════════════════════════

    enum PaymentToken { ETH, USDC }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        "Payment(address provider,uint256 amount,uint256 nonce,uint256 expiry,string service,uint8 paymentToken)"
    );

    uint256 private constant MAX_FEE_BPS = 1000; // 10%

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error ZeroAddress();
    error ZeroAmount();
    error PaymentExpired();
    error NonceAlreadyUsed();
    error InvalidSignature();
    error InsufficientBalance();
    error FeeTooHigh(uint256 feeBps, uint256 maxBps);
    error InvalidProvider();
    error TransferFailed(address recipient);
    error InsufficientETH(uint256 sent, uint256 required);
    error NoEarnings();
    error InvalidPaymentToken();
    error ETHNotAcceptedForDeposit();

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice USDC token
    IERC20 public immutable usdc;

    /// @notice Provider registry (for recording earnings)
    IBonzaiProviderRegistry public providerRegistry;

    /// @notice Platform treasury
    address public treasury;

    /// @notice Platform fee in basis points (250 = 2.5%)
    uint256 public platformFeeBps;

    /// @notice Used nonces per consumer (prevent replay)
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    /// @notice Consumer USDC balances (pre-deposited for faster payments)
    mapping(address => uint256) public balances;

    /// @notice Consumer ETH balances (pre-deposited for faster payments)
    mapping(address => uint256) public ethBalances;

    /// @notice Provider USDC earnings pending withdrawal
    mapping(address => uint256) public pendingWithdrawals;

    /// @notice Provider ETH earnings pending withdrawal
    mapping(address => uint256) public pendingETHWithdrawals;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event Deposited(address indexed consumer, uint256 amount, PaymentToken token);
    event Withdrawn(address indexed user, uint256 amount, PaymentToken token);
    event PaymentProcessed(
        address indexed consumer,
        address indexed provider,
        uint256 amount,
        uint256 platformFee,
        string service,
        PaymentToken token
    );
    event ProviderRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PlatformFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    constructor(
        address _usdc,
        address _treasury,
        uint256 _platformFeeBps
    ) Ownable(msg.sender) EIP712("BonzAI x402", "2") {
        if (_usdc == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        if (_platformFeeBps > MAX_FEE_BPS) revert FeeTooHigh(_platformFeeBps, MAX_FEE_BPS);

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
        if (amount == 0) revert ZeroAmount();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;

        emit Deposited(msg.sender, amount, PaymentToken.USDC);
    }

    /**
     * @notice Deposit ETH for faster inference payments
     */
    function depositETH() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        ethBalances[msg.sender] += msg.value;

        emit Deposited(msg.sender, msg.value, PaymentToken.ETH);
    }

    /**
     * @notice Withdraw deposited USDC
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (balances[msg.sender] < amount) revert InsufficientBalance();

        balances[msg.sender] -= amount;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, PaymentToken.USDC);
    }

    /**
     * @notice Withdraw deposited ETH
     * @param amount Amount to withdraw
     */
    function withdrawETH(uint256 amount) external nonReentrant {
        if (ethBalances[msg.sender] < amount) revert InsufficientBalance();

        ethBalances[msg.sender] -= amount;
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed(msg.sender);

        emit Withdrawn(msg.sender, amount, PaymentToken.ETH);
    }

    /**
     * @notice Provider withdraws earned USDC
     */
    function withdrawEarnings() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NoEarnings();

        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, PaymentToken.USDC);
    }

    /**
     * @notice Provider withdraws earned ETH
     */
    function withdrawETHEarnings() external nonReentrant {
        uint256 amount = pendingETHWithdrawals[msg.sender];
        if (amount == 0) revert NoEarnings();

        pendingETHWithdrawals[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed(msg.sender);

        emit Withdrawn(msg.sender, amount, PaymentToken.ETH);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PAYMENT PROCESSING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Process a signed USDC or ETH payment (called by provider after completing inference)
     * @param consumer Consumer's address
     * @param provider Provider's address
     * @param amount Payment amount
     * @param nonce Unique nonce to prevent replay
     * @param expiry Payment expiration timestamp
     * @param service Service/pipeline identifier
     * @param paymentToken Whether to pay in ETH or USDC
     * @param signature Consumer's EIP-712 signature
     */
    function processPayment(
        address consumer,
        address provider,
        uint256 amount,
        uint256 nonce,
        uint256 expiry,
        string calldata service,
        PaymentToken paymentToken,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp > expiry) revert PaymentExpired();
        if (usedNonces[consumer][nonce]) revert NonceAlreadyUsed();

        // Mark nonce as used
        usedNonces[consumer][nonce] = true;

        // Verify signature
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_TYPEHASH,
            provider,
            amount,
            nonce,
            expiry,
            keccak256(bytes(service)),
            uint8(paymentToken)
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        if (signer != consumer) revert InvalidSignature();

        // Process payment
        _processPayment(consumer, provider, amount, service, paymentToken);
    }

    /**
     * @notice Direct USDC payment (consumer pays provider directly without signature)
     * @param provider Provider's address
     * @param amount Payment amount in USDC
     * @param service Service/pipeline identifier
     */
    function payDirect(
        address provider,
        uint256 amount,
        string calldata service
    ) external nonReentrant whenNotPaused {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _processPayment(msg.sender, provider, amount, service, PaymentToken.USDC);
    }

    /**
     * @notice Direct ETH payment (consumer pays provider directly without signature)
     * @param provider Provider's address
     * @param service Service/pipeline identifier
     */
    function payDirectETH(
        address provider,
        string calldata service
    ) external payable nonReentrant whenNotPaused {
        if (msg.value == 0) revert ZeroAmount();
        _processPayment(msg.sender, provider, msg.value, service, PaymentToken.ETH);
    }

    /**
     * @notice Pay from deposited USDC balance
     * @param provider Provider's address
     * @param amount Payment amount in USDC
     * @param service Service/pipeline identifier
     */
    function payFromBalance(
        address provider,
        uint256 amount,
        string calldata service
    ) external nonReentrant whenNotPaused {
        if (balances[msg.sender] < amount) revert InsufficientBalance();

        balances[msg.sender] -= amount;
        _processPayment(msg.sender, provider, amount, service, PaymentToken.USDC);
    }

    /**
     * @notice Pay from deposited ETH balance
     * @param provider Provider's address
     * @param amount Payment amount in ETH
     * @param service Service/pipeline identifier
     */
    function payFromETHBalance(
        address provider,
        uint256 amount,
        string calldata service
    ) external nonReentrant whenNotPaused {
        if (ethBalances[msg.sender] < amount) revert InsufficientBalance();

        ethBalances[msg.sender] -= amount;
        _processPayment(msg.sender, provider, amount, service, PaymentToken.ETH);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get consumer's deposited USDC balance
     */
    function getBalance(address consumer) external view returns (uint256) {
        return balances[consumer];
    }

    /**
     * @notice Get consumer's deposited ETH balance
     */
    function getETHBalance(address consumer) external view returns (uint256) {
        return ethBalances[consumer];
    }

    /**
     * @notice Get provider's pending USDC withdrawals
     */
    function getPendingWithdrawals(address provider) external view returns (uint256) {
        return pendingWithdrawals[provider];
    }

    /**
     * @notice Get provider's pending ETH withdrawals
     */
    function getPendingETHWithdrawals(address provider) external view returns (uint256) {
        return pendingETHWithdrawals[provider];
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
        if (_providerRegistry == address(0)) revert ZeroAddress();
        address old = address(providerRegistry);
        providerRegistry = IBonzaiProviderRegistry(_providerRegistry);
        emit ProviderRegistryUpdated(old, _providerRegistry);
    }

    /**
     * @notice Update platform fee
     */
    function setPlatformFee(uint256 _platformFeeBps) external onlyOwner {
        if (_platformFeeBps > MAX_FEE_BPS) revert FeeTooHigh(_platformFeeBps, MAX_FEE_BPS);
        uint256 old = platformFeeBps;
        platformFeeBps = _platformFeeBps;
        emit PlatformFeeUpdated(old, _platformFeeBps);
    }

    /**
     * @notice Update treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }

    /**
     * @notice Pause payment processing
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause payment processing
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════════════════════

    function _processPayment(
        address consumer,
        address provider,
        uint256 amount,
        string memory service,
        PaymentToken paymentToken
    ) internal {
        if (amount == 0) revert ZeroAmount();
        if (provider == address(0)) revert InvalidProvider();

        // Calculate platform fee
        uint256 platformFee = (amount * platformFeeBps) / 10000;
        uint256 providerAmount = amount - platformFee;

        if (paymentToken == PaymentToken.USDC) {
            // Credit provider USDC (they can withdraw later)
            pendingWithdrawals[provider] += providerAmount;

            // Send platform fee to treasury
            if (platformFee > 0) {
                usdc.safeTransfer(treasury, platformFee);
            }
        } else {
            // Credit provider ETH (they can withdraw later)
            pendingETHWithdrawals[provider] += providerAmount;

            // Send platform fee to treasury
            if (platformFee > 0) {
                (bool success, ) = treasury.call{value: platformFee}("");
                if (!success) revert TransferFailed(treasury);
            }
        }

        // Record earnings in provider registry (if set)
        if (address(providerRegistry) != address(0)) {
            try providerRegistry.recordEarnings(provider, providerAmount) {
                // Success
            } catch {
                // Don't revert if registry call fails
            }
        }

        emit PaymentProcessed(consumer, provider, amount, platformFee, service, paymentToken);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RECEIVE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Accept ETH for deposits and payments
    receive() external payable {}
}
