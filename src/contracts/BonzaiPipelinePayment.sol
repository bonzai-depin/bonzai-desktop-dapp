// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title BonzaiPipelinePayment
 * @notice Multi-payee atomic payment for pipeline-parallel private inference.
 *         A consumer signs ONE EIP-712 message covering N pipeline peers.
 *         Payment is distributed atomically — all peers get paid or none do.
 *
 * @dev Uses the same EIP-712 domain ("BonzAI x402", "2") as BonzaiP2PPayment
 *      for wallet compatibility. Supports both ETH (native) and USDC payments.
 *
 *      Privacy: Pipeline peers process opaque tensor operations. They never see
 *      the consumer's prompt, output, or identity. The consumer signs the payment
 *      off-chain; any participant can submit it on-chain after inference completes.
 */
contract BonzaiPipelinePayment is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    bytes32 public constant PIPELINE_PAYMENT_TYPEHASH = keccak256(
        "PipelinePayment(address[] providers,uint256[] amounts,uint256 totalAmount,"
        "uint256 nonce,uint256 expiry,string service,bytes32 sessionId)"
    );

    /// @notice Maximum providers per pipeline (gas safety)
    uint256 public constant MAX_PROVIDERS = 16;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice USDC token (0 = not set, ETH-only mode)
    IERC20 public immutable usdc;

    /// @notice Provider registry for recording earnings
    address public providerRegistry;

    /// @notice Platform treasury
    address public treasury;

    /// @notice Platform fee in basis points (250 = 2.5%)
    uint256 public platformFeeBps;

    /// @notice Used nonces per consumer (prevent replay)
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    /// @notice Provider earnings pending withdrawal (ETH)
    mapping(address => uint256) public pendingWithdrawalsETH;

    /// @notice Provider earnings pending withdrawal (USDC)
    mapping(address => uint256) public pendingWithdrawalsUSDC;

    /// @notice Total ETH processed through this contract
    uint256 public totalProcessedETH;

    /// @notice Total USDC processed through this contract
    uint256 public totalProcessedUSDC;

    /// @notice Total pipeline sessions settled
    uint256 public totalSessions;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event PipelinePaymentProcessed(
        address indexed consumer,
        bytes32 indexed sessionId,
        uint256 totalAmount,
        uint256 platformFee,
        uint256 providerCount,
        string service,
        bool isETH
    );

    event ProviderPaid(
        bytes32 indexed sessionId,
        address indexed provider,
        uint256 amount
    );

    event EarningsWithdrawn(address indexed provider, uint256 amount, bool isETH);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @param _usdc USDC token address (use address(0) for ETH-only mode)
     * @param _treasury Platform treasury address
     * @param _platformFeeBps Platform fee in basis points (250 = 2.5%)
     */
    constructor(
        address _usdc,
        address _treasury,
        uint256 _platformFeeBps
    ) Ownable(msg.sender) EIP712("BonzAI x402", "2") {
        require(_treasury != address(0), "Invalid treasury");
        require(_platformFeeBps <= 1000, "Fee too high");
        usdc = IERC20(_usdc);
        treasury = _treasury;
        platformFeeBps = _platformFeeBps;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PIPELINE PAYMENT (EIP-712 signature)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Process a signed multi-payee pipeline payment in ETH.
     *         Consumer signs off-chain; any participant submits on-chain.
     * @param consumer Consumer's address (signer)
     * @param providers Array of provider addresses
     * @param amounts Array of per-provider amounts (before platform fee)
     * @param totalAmount Sum of amounts (verified on-chain)
     * @param nonce Unique nonce to prevent replay
     * @param expiry Payment expiration timestamp
     * @param service Service identifier (e.g., "pipeline/llm/llama-3.1-8b")
     * @param sessionId Pipeline session ID
     * @param signature Consumer's EIP-712 signature
     */
    function processPipelinePaymentETH(
        address consumer,
        address[] calldata providers,
        uint256[] calldata amounts,
        uint256 totalAmount,
        uint256 nonce,
        uint256 expiry,
        string calldata service,
        bytes32 sessionId,
        bytes calldata signature
    ) external payable nonReentrant {
        _validateAndVerify(consumer, providers, amounts, totalAmount, nonce, expiry, service, sessionId, signature);
        require(msg.value >= totalAmount, "Insufficient ETH sent");

        uint256 platformFee = (totalAmount * platformFeeBps) / 10000;
        uint256 distributable = totalAmount - platformFee;

        // Distribute to providers proportionally (amounts are relative weights)
        uint256 distributed;
        for (uint256 i = 0; i < providers.length;) {
            uint256 share = (distributable * amounts[i]) / totalAmount;
            pendingWithdrawalsETH[providers[i]] += share;
            distributed += share;
            emit ProviderPaid(sessionId, providers[i], share);
            unchecked { i++; }
        }

        // Platform fee to treasury
        if (platformFee > 0) {
            (bool ok, ) = treasury.call{value: platformFee}("");
            require(ok, "Treasury transfer failed");
        }

        // Refund any dust from rounding
        uint256 dust = msg.value - platformFee - distributed;
        if (dust > 0) {
            (bool ok, ) = consumer.call{value: dust}("");
            require(ok, "Dust refund failed");
        }

        totalProcessedETH += totalAmount;
        totalSessions++;

        _recordEarnings(providers, amounts, totalAmount, distributable);

        emit PipelinePaymentProcessed(consumer, sessionId, totalAmount, platformFee, providers.length, service, true);
    }

    /**
     * @notice Process a signed multi-payee pipeline payment in USDC.
     *         Consumer must have approved this contract for totalAmount USDC.
     */
    function processPipelinePaymentUSDC(
        address consumer,
        address[] calldata providers,
        uint256[] calldata amounts,
        uint256 totalAmount,
        uint256 nonce,
        uint256 expiry,
        string calldata service,
        bytes32 sessionId,
        bytes calldata signature
    ) external nonReentrant {
        require(address(usdc) != address(0), "USDC not configured");
        _validateAndVerify(consumer, providers, amounts, totalAmount, nonce, expiry, service, sessionId, signature);

        // Transfer USDC from consumer
        usdc.safeTransferFrom(consumer, address(this), totalAmount);

        uint256 platformFee = (totalAmount * platformFeeBps) / 10000;
        uint256 distributable = totalAmount - platformFee;

        // Distribute to providers
        for (uint256 i = 0; i < providers.length;) {
            uint256 share = (distributable * amounts[i]) / totalAmount;
            pendingWithdrawalsUSDC[providers[i]] += share;
            emit ProviderPaid(sessionId, providers[i], share);
            unchecked { i++; }
        }

        // Platform fee to treasury
        if (platformFee > 0) {
            usdc.safeTransfer(treasury, platformFee);
        }

        totalProcessedUSDC += totalAmount;
        totalSessions++;

        _recordEarnings(providers, amounts, totalAmount, distributable);

        emit PipelinePaymentProcessed(consumer, sessionId, totalAmount, platformFee, providers.length, service, false);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WITHDRAWALS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Provider withdraws accumulated ETH earnings
    function withdrawETH() external nonReentrant {
        uint256 amount = pendingWithdrawalsETH[msg.sender];
        require(amount > 0, "No ETH earnings");

        pendingWithdrawalsETH[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "ETH transfer failed");

        emit EarningsWithdrawn(msg.sender, amount, true);
    }

    /// @notice Provider withdraws accumulated USDC earnings
    function withdrawUSDC() external nonReentrant {
        uint256 amount = pendingWithdrawalsUSDC[msg.sender];
        require(amount > 0, "No USDC earnings");

        pendingWithdrawalsUSDC[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit EarningsWithdrawn(msg.sender, amount, false);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════════════════════

    function isNonceUsed(address consumer, uint256 nonce) external view returns (bool) {
        return usedNonces[consumer][nonce];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════════

    function setProviderRegistry(address _registry) external onlyOwner {
        providerRegistry = _registry;
    }

    function setPlatformFee(uint256 _bps) external onlyOwner {
        require(_bps <= 1000, "Fee too high");
        platformFeeBps = _bps;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════════════════════

    function _validateAndVerify(
        address consumer,
        address[] calldata providers,
        uint256[] calldata amounts,
        uint256 totalAmount,
        uint256 nonce,
        uint256 expiry,
        string calldata service,
        bytes32 sessionId,
        bytes calldata signature
    ) internal {
        require(providers.length > 0, "No providers");
        require(providers.length <= MAX_PROVIDERS, "Too many providers");
        require(providers.length == amounts.length, "Array length mismatch");
        require(totalAmount > 0, "Zero amount");
        require(block.timestamp <= expiry, "Payment expired");
        require(!usedNonces[consumer][nonce], "Nonce already used");

        // Verify amounts sum to totalAmount
        uint256 sum;
        for (uint256 i = 0; i < amounts.length;) {
            require(amounts[i] > 0, "Zero provider amount");
            require(providers[i] != address(0), "Invalid provider address");
            sum += amounts[i];
            unchecked { i++; }
        }
        require(sum == totalAmount, "Amounts don't sum to totalAmount");

        // Mark nonce used
        usedNonces[consumer][nonce] = true;

        // Verify EIP-712 signature
        bytes32 structHash = keccak256(abi.encode(
            PIPELINE_PAYMENT_TYPEHASH,
            keccak256(abi.encodePacked(providers)),
            keccak256(abi.encodePacked(amounts)),
            totalAmount,
            nonce,
            expiry,
            keccak256(bytes(service)),
            sessionId
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        require(signer == consumer, "Invalid signature");
    }

    function _recordEarnings(
        address[] calldata providers,
        uint256[] calldata amounts,
        uint256 totalAmount,
        uint256 distributable
    ) internal {
        if (providerRegistry == address(0)) return;

        for (uint256 i = 0; i < providers.length;) {
            uint256 share = (distributable * amounts[i]) / totalAmount;
            (bool ok, ) = providerRegistry.call(
                abi.encodeWithSignature("recordEarnings(address,uint256)", providers[i], share)
            );
            // Silently continue if registry call fails — don't block payment
            if (!ok) {}
            unchecked { i++; }
        }
    }

    /// @notice Allow contract to receive ETH (for pipeline payments)
    receive() external payable {}
}
