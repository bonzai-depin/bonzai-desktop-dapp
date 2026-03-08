// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BonzaiProviderRegistry
 * @notice Registry for P2P inference providers in the BonzAI network
 * @dev Providers register with their libp2p peer ID, capabilities, and pricing
 */
contract BonzaiProviderRegistry is Ownable, ReentrancyGuard {
    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    struct Provider {
        address wallet;           // Provider's Ethereum address (for payments)
        string peerId;            // libp2p peer ID (e.g., "12D3KooW...")
        string[] multiaddrs;      // libp2p multiaddresses for dialing
        uint8[] pipelines;        // Supported pipeline IDs
        uint256 pricePerToken;    // Price per 1000 tokens in USDC (6 decimals)
        uint256 stakedAmount;     // BONZAI staked for reputation
        uint256 totalEarnings;    // Total USDC earned
        uint256 completedJobs;    // Number of completed inferences
        uint256 registeredAt;     // Registration timestamp
        uint256 lastSeenAt;       // Last activity timestamp
        bool isActive;            // Currently accepting jobs
        bool isRelay;             // Acts as a relay node
    }

    /**
     * Pipeline categories (0-10): AI inference capabilities offered by providers.
     * Each category maps to a specific ML pipeline endpoint.
     *
     * NOTE: These are DIFFERENT from the 12 spending profile categories (0-11)
     * in BonzaiCompanions.sol, which represent consumer spending habits
     * (education, entertainment, fashion, etc.). Pipeline categories describe
     * what a provider CAN DO; spending categories describe what a companion LIKES.
     * They serve unrelated purposes and are intentionally different enums.
     */
    enum PipelineCategory {
        LLM,            // 0: Text generation (21 models via OpenClaw)
        IMAGE_TURBO,    // 1: Fast image gen
        IMAGE_QUALITY,  // 2: Quality image gen
        IMAGE_STANDARD, // 3: Standard image gen
        IMAGE_ADVANCED, // 4: Advanced image gen
        AUDIO,          // 5: Reserved (deprecated)
        AUDIO_TURBO,    // 6: Fast TTS
        AUDIO_QUALITY,  // 7: Quality TTS
        MUSIC,          // 8: Music generation
        VIDEO_FAST,     // 9: Video generation
        VISION          // 10: Vision analysis
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    // Provider data by wallet address
    mapping(address => Provider) public providers;

    // Lookup by peer ID
    mapping(string => address) public peerIdToWallet;

    // List of all provider addresses
    address[] public providerAddresses;

    // Minimum stake required to register
    uint256 public minStakeAmount;

    // Platform fee in basis points (250 = 2.5%)
    uint256 public platformFeeBps;

    // Platform treasury
    address public treasury;

    // Authorized payment contract (only caller for recordEarnings)
    address public paymentContract;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event ProviderRegistered(
        address indexed wallet,
        string peerId,
        uint8[] pipelines,
        uint256 pricePerToken
    );

    event ProviderUpdated(
        address indexed wallet,
        string peerId,
        uint8[] pipelines,
        uint256 pricePerToken
    );

    event ProviderDeactivated(address indexed wallet);
    event ProviderActivated(address indexed wallet);
    event ProviderSlashed(address indexed wallet, uint256 amount, string reason);
    event EarningsRecorded(address indexed wallet, uint256 amount);
    event StakeWithdrawn(address indexed wallet, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    constructor(
        address _treasury,
        uint256 _minStakeAmount,
        uint256 _platformFeeBps
    ) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        minStakeAmount = _minStakeAmount;
        platformFeeBps = _platformFeeBps;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROVIDER REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Register as a provider
     * @param peerId libp2p peer ID
     * @param multiaddrs Array of libp2p multiaddresses
     * @param pipelines Array of supported pipeline IDs
     * @param pricePerToken Price per 1000 tokens in USDC (6 decimals)
     * @param isRelay Whether this provider acts as a relay
     */
    function register(
        string calldata peerId,
        string[] calldata multiaddrs,
        uint8[] calldata pipelines,
        uint256 pricePerToken,
        bool isRelay
    ) external payable nonReentrant {
        require(bytes(peerId).length > 0, "Invalid peer ID");
        require(pipelines.length > 0, "Must support at least one pipeline");
        require(pricePerToken > 0, "Price must be positive");
        require(peerIdToWallet[peerId] == address(0) || peerIdToWallet[peerId] == msg.sender, "Peer ID already registered");

        // Require minimum stake (optional, can be 0)
        if (minStakeAmount > 0) {
            require(msg.value >= minStakeAmount, "Insufficient stake");
        }

        // Check if updating existing registration
        bool isUpdate = providers[msg.sender].wallet != address(0);

        if (!isUpdate) {
            // New registration
            providerAddresses.push(msg.sender);
        } else {
            // Clear old peer ID mapping if changed
            string memory oldPeerId = providers[msg.sender].peerId;
            if (keccak256(bytes(oldPeerId)) != keccak256(bytes(peerId))) {
                delete peerIdToWallet[oldPeerId];
            }
        }

        // Update provider data
        Provider storage provider = providers[msg.sender];
        provider.wallet = msg.sender;
        provider.peerId = peerId;
        provider.multiaddrs = multiaddrs;
        provider.pipelines = pipelines;
        provider.pricePerToken = pricePerToken;
        provider.stakedAmount += msg.value;
        provider.registeredAt = isUpdate ? provider.registeredAt : block.timestamp;
        provider.lastSeenAt = block.timestamp;
        provider.isActive = true;
        provider.isRelay = isRelay;

        // Update peer ID lookup
        peerIdToWallet[peerId] = msg.sender;

        if (isUpdate) {
            emit ProviderUpdated(msg.sender, peerId, pipelines, pricePerToken);
        } else {
            emit ProviderRegistered(msg.sender, peerId, pipelines, pricePerToken);
        }
    }

    /**
     * @notice Deactivate provider (stop accepting jobs)
     */
    function deactivate() external {
        require(providers[msg.sender].wallet != address(0), "Not registered");
        delete peerIdToWallet[providers[msg.sender].peerId];
        providers[msg.sender].isActive = false;
        emit ProviderDeactivated(msg.sender);
    }

    /**
     * @notice Reactivate provider
     */
    function activate() external {
        require(providers[msg.sender].wallet != address(0), "Not registered");
        providers[msg.sender].isActive = true;
        providers[msg.sender].lastSeenAt = block.timestamp;
        peerIdToWallet[providers[msg.sender].peerId] = msg.sender;
        emit ProviderActivated(msg.sender);
    }

    /**
     * @notice Update last seen timestamp (called periodically by provider)
     */
    function heartbeat() external {
        require(providers[msg.sender].wallet != address(0), "Not registered");
        providers[msg.sender].lastSeenAt = block.timestamp;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EARNINGS & PAYMENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Record completed job earnings (called by payment contract only)
     * @param provider Provider address
     * @param amount Earnings amount in USDC
     */
    function recordEarnings(address provider, uint256 amount) external {
        require(msg.sender == paymentContract, "Only payment contract");
        require(providers[provider].wallet != address(0), "Provider not registered");

        providers[provider].totalEarnings += amount;
        providers[provider].completedJobs += 1;
        providers[provider].lastSeenAt = block.timestamp;

        emit EarningsRecorded(provider, amount);
    }

    /**
     * @notice Withdraw staked ETH (provider must deactivate first)
     * @param amount Amount of stake to withdraw
     */
    function withdrawStake(uint256 amount) external nonReentrant {
        require(providers[msg.sender].wallet != address(0), "Not registered");
        require(!providers[msg.sender].isActive, "Deactivate before withdrawing stake");
        require(amount > 0, "Amount must be positive");
        require(providers[msg.sender].stakedAmount >= amount, "Insufficient stake");

        providers[msg.sender].stakedAmount -= amount;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit StakeWithdrawn(msg.sender, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get provider info by wallet
     */
    function getProvider(address wallet) external view returns (Provider memory) {
        return providers[wallet];
    }

    /**
     * @notice Get provider info by peer ID
     */
    function getProviderByPeerId(string calldata peerId) external view returns (Provider memory) {
        address wallet = peerIdToWallet[peerId];
        return providers[wallet];
    }

    /**
     * @notice Get all active providers supporting a specific pipeline
     * @param pipeline Pipeline ID to filter by
     * @return Active providers supporting the pipeline
     */
    function getProvidersForPipeline(uint8 pipeline) external view returns (Provider[] memory) {
        // First pass: count matching providers
        uint256 count = 0;
        for (uint256 i = 0; i < providerAddresses.length; i++) {
            Provider storage p = providers[providerAddresses[i]];
            if (p.isActive && _supportsPipeline(p.pipelines, pipeline)) {
                count++;
            }
        }

        // Second pass: collect matching providers
        Provider[] memory result = new Provider[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < providerAddresses.length; i++) {
            Provider storage p = providers[providerAddresses[i]];
            if (p.isActive && _supportsPipeline(p.pipelines, pipeline)) {
                result[index] = p;
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get all active relay nodes
     */
    function getRelayNodes() external view returns (Provider[] memory) {
        // First pass: count relays
        uint256 count = 0;
        for (uint256 i = 0; i < providerAddresses.length; i++) {
            Provider storage p = providers[providerAddresses[i]];
            if (p.isActive && p.isRelay) {
                count++;
            }
        }

        // Second pass: collect relays
        Provider[] memory result = new Provider[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < providerAddresses.length; i++) {
            Provider storage p = providers[providerAddresses[i]];
            if (p.isActive && p.isRelay) {
                result[index] = p;
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get total provider count
     */
    function getProviderCount() external view returns (uint256) {
        return providerAddresses.length;
    }

    /**
     * @notice Get active provider count
     */
    function getActiveProviderCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < providerAddresses.length; i++) {
            if (providers[providerAddresses[i]].isActive) {
                count++;
            }
        }
        return count;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Update platform fee
     */
    function setPlatformFee(uint256 _platformFeeBps) external onlyOwner {
        require(_platformFeeBps <= 1000, "Fee too high"); // Max 10%
        platformFeeBps = _platformFeeBps;
    }

    /**
     * @notice Update minimum stake
     */
    function setMinStake(uint256 _minStakeAmount) external onlyOwner {
        minStakeAmount = _minStakeAmount;
    }

    /**
     * @notice Update treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    /**
     * @notice Set the authorized payment contract for recordEarnings
     */
    function setPaymentContract(address _paymentContract) external onlyOwner {
        require(_paymentContract != address(0), "Invalid payment contract");
        paymentContract = _paymentContract;
    }

    /**
     * @notice Slash a provider's stake (for misbehavior)
     */
    function slashProvider(address provider, uint256 amount, string calldata reason) external onlyOwner {
        require(amount > 0, "Amount must be positive");
        require(providers[provider].stakedAmount >= amount, "Insufficient stake");

        providers[provider].stakedAmount -= amount;

        // Transfer slashed amount to treasury
        (bool success, ) = treasury.call{value: amount}("");
        require(success, "Transfer failed");

        emit ProviderSlashed(provider, amount, reason);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════════════════════

    function _supportsPipeline(uint8[] storage pipelines, uint8 target) internal view returns (bool) {
        for (uint256 i = 0; i < pipelines.length; i++) {
            if (pipelines[i] == target) {
                return true;
            }
        }
        return false;
    }
}
