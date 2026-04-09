// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title BonzaiProviderRegistry
 * @notice Registry for P2P inference providers in the BonzAI network
 * @dev Providers register with their libp2p peer ID, capabilities, and pricing
 */
contract BonzaiProviderRegistry is Ownable, ReentrancyGuard, Pausable {
    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    struct Provider {
        address wallet;           // Provider's Ethereum address (for payments)
        string peerId;            // libp2p peer ID (e.g., "12D3KooW...")
        string[] multiaddrs;      // libp2p multiaddresses for dialing
        uint8[] pipelines;        // Supported pipeline IDs
        uint256 pricePerToken;    // Price per 1000 tokens (token-agnostic: ETH or USDC)
        uint256 stakedAmount;     // ETH staked for reputation
        uint256 totalEarnings;    // Total earned
        uint256 completedJobs;    // Number of completed inferences
        uint256 registeredAt;     // Registration timestamp
        uint256 lastSeenAt;       // Last activity timestamp
        bool isActive;            // Currently accepting jobs
        bool isRelay;             // Acts as a relay node
        // Pipeline shard capabilities (v2)
        uint16 maxLayers;         // Max transformer layers this peer can serve (0 = not shard-capable)
        uint32 computeScore;      // Benchmark throughput score (self-reported, higher = faster)
        uint32 memoryMB;          // Available VRAM/RAM for model shards in MB
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
        LLM,            // 0: Text generation (models via OpenClaw)
        IMAGE_TURBO,    // 1: Fast image gen
        IMAGE_QUALITY,  // 2: Quality image gen
        IMAGE_STANDARD, // 3: Standard image gen
        IMAGE_ADVANCED, // 4: Advanced image gen
        AUDIO,          // 5: Reserved (deprecated)
        AUDIO_TURBO,    // 6: Fast TTS
        AUDIO_QUALITY,  // 7: Quality TTS
        MUSIC,          // 8: Music generation
        VIDEO_FAST,     // 9: Video generation (fast)
        VISION,         // 10: Vision analysis
        PIPELINE_SHARD  // 11: Pipeline shard provider (partial LLM layers for private inference)
    }

    /// @notice Maximum valid pipeline category value
    uint8 public constant MAX_PIPELINE_CATEGORY = uint8(type(PipelineCategory).max);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error ZeroAddress();
    error EmptyPeerId();
    error NoPipelines();
    error ZeroPrice();
    error PeerIdTaken(string peerId);
    error InsufficientStake(uint256 sent, uint256 required);
    error NotRegistered();
    error StillActive();
    error ZeroAmount();
    error InsufficientStakeBalance(uint256 requested, uint256 available);
    error TransferFailed(address recipient);
    error OnlyPaymentContract();
    error ProviderNotRegistered(address provider);
    error FeeTooHigh(uint256 feeBps, uint256 maxBps);
    error InvalidPipelineCategory(uint8 category, uint8 max);

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
    event ShardCapabilitiesUpdated(address indexed wallet, uint16 maxLayers, uint32 computeScore, uint32 memoryMB);
    event EarningsRecorded(address indexed wallet, uint256 amount);
    event StakeWithdrawn(address indexed wallet, uint256 amount);
    event MinStakeUpdated(uint256 oldMinStake, uint256 newMinStake);
    event PlatformFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PaymentContractUpdated(address indexed oldContract, address indexed newContract);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    constructor(
        address _treasury,
        uint256 _minStakeAmount,
        uint256 _platformFeeBps
    ) Ownable(msg.sender) {
        if (_treasury == address(0)) revert ZeroAddress();
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
     * @param pipelines Array of supported pipeline IDs (must be 0-10)
     * @param pricePerToken Price per 1000 tokens (token-agnostic)
     * @param isRelay Whether this provider acts as a relay
     */
    function register(
        string calldata peerId,
        string[] calldata multiaddrs,
        uint8[] calldata pipelines,
        uint256 pricePerToken,
        bool isRelay
    ) external payable nonReentrant whenNotPaused {
        if (bytes(peerId).length == 0) revert EmptyPeerId();
        if (pipelines.length == 0) revert NoPipelines();
        if (pricePerToken == 0) revert ZeroPrice();
        if (peerIdToWallet[peerId] != address(0) && peerIdToWallet[peerId] != msg.sender) {
            revert PeerIdTaken(peerId);
        }

        // Validate all pipeline categories are in valid range
        for (uint256 i = 0; i < pipelines.length; ) {
            if (pipelines[i] > MAX_PIPELINE_CATEGORY) {
                revert InvalidPipelineCategory(pipelines[i], MAX_PIPELINE_CATEGORY);
            }
            unchecked { i++; }
        }

        // Require minimum stake (optional, can be 0)
        if (minStakeAmount > 0) {
            if (msg.value < minStakeAmount) revert InsufficientStake(msg.value, minStakeAmount);
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
     * @notice Update provider details without re-registering
     * @param peerId New libp2p peer ID
     * @param multiaddrs New multiaddresses
     * @param pipelines New supported pipeline IDs (must be 0-10)
     * @param pricePerToken New price per 1000 tokens
     * @param isRelay Whether this provider acts as a relay
     */
    function updateProvider(
        string calldata peerId,
        string[] calldata multiaddrs,
        uint8[] calldata pipelines,
        uint256 pricePerToken,
        bool isRelay
    ) external nonReentrant whenNotPaused {
        if (providers[msg.sender].wallet == address(0)) revert NotRegistered();
        if (bytes(peerId).length == 0) revert EmptyPeerId();
        if (pipelines.length == 0) revert NoPipelines();
        if (pricePerToken == 0) revert ZeroPrice();
        if (peerIdToWallet[peerId] != address(0) && peerIdToWallet[peerId] != msg.sender) {
            revert PeerIdTaken(peerId);
        }

        // Validate all pipeline categories
        for (uint256 i = 0; i < pipelines.length; ) {
            if (pipelines[i] > MAX_PIPELINE_CATEGORY) {
                revert InvalidPipelineCategory(pipelines[i], MAX_PIPELINE_CATEGORY);
            }
            unchecked { i++; }
        }

        // Clear old peer ID mapping if changed
        string memory oldPeerId = providers[msg.sender].peerId;
        if (keccak256(bytes(oldPeerId)) != keccak256(bytes(peerId))) {
            delete peerIdToWallet[oldPeerId];
        }

        Provider storage provider = providers[msg.sender];
        provider.peerId = peerId;
        provider.multiaddrs = multiaddrs;
        provider.pipelines = pipelines;
        provider.pricePerToken = pricePerToken;
        provider.lastSeenAt = block.timestamp;
        provider.isRelay = isRelay;

        peerIdToWallet[peerId] = msg.sender;

        emit ProviderUpdated(msg.sender, peerId, pipelines, pricePerToken);
    }

    /**
     * @notice Deactivate provider (stop accepting jobs)
     */
    function deactivate() external {
        if (providers[msg.sender].wallet == address(0)) revert NotRegistered();
        delete peerIdToWallet[providers[msg.sender].peerId];
        providers[msg.sender].isActive = false;
        emit ProviderDeactivated(msg.sender);
    }

    /**
     * @notice Reactivate provider
     * @dev Reverts if another provider has claimed this peerId while deactivated
     */
    function activate() external {
        if (providers[msg.sender].wallet == address(0)) revert NotRegistered();

        // Prevent overwriting another provider's peerId mapping
        string memory peerId = providers[msg.sender].peerId;
        address currentHolder = peerIdToWallet[peerId];
        if (currentHolder != address(0) && currentHolder != msg.sender) {
            revert PeerIdTaken(peerId);
        }

        providers[msg.sender].isActive = true;
        providers[msg.sender].lastSeenAt = block.timestamp;
        peerIdToWallet[peerId] = msg.sender;
        emit ProviderActivated(msg.sender);
    }

    /**
     * @notice Set shard capabilities for pipeline participation.
     *         Providers call this after registration to advertise their
     *         ability to serve as pipeline shard nodes for private inference.
     * @param _maxLayers Max transformer layers this provider can serve
     * @param _computeScore Self-reported benchmark throughput score
     * @param _memoryMB Available VRAM/RAM for model shards in MB
     */
    function setShardCapabilities(
        uint16 _maxLayers,
        uint32 _computeScore,
        uint32 _memoryMB
    ) external {
        if (providers[msg.sender].wallet == address(0)) revert NotRegistered();

        providers[msg.sender].maxLayers = _maxLayers;
        providers[msg.sender].computeScore = _computeScore;
        providers[msg.sender].memoryMB = _memoryMB;
        providers[msg.sender].lastSeenAt = block.timestamp;

        emit ShardCapabilitiesUpdated(msg.sender, _maxLayers, _computeScore, _memoryMB);
    }

    /**
     * @notice Update last seen timestamp (called periodically by provider)
     */
    function heartbeat() external {
        if (providers[msg.sender].wallet == address(0)) revert NotRegistered();
        providers[msg.sender].lastSeenAt = block.timestamp;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EARNINGS & PAYMENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Record completed job earnings (called by payment contract only)
     * @param provider Provider address
     * @param amount Earnings amount
     */
    function recordEarnings(address provider, uint256 amount) external {
        if (msg.sender != paymentContract) revert OnlyPaymentContract();
        if (providers[provider].wallet == address(0)) revert ProviderNotRegistered(provider);

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
        if (providers[msg.sender].wallet == address(0)) revert NotRegistered();
        if (providers[msg.sender].isActive) revert StillActive();
        if (amount == 0) revert ZeroAmount();
        if (providers[msg.sender].stakedAmount < amount) {
            revert InsufficientStakeBalance(amount, providers[msg.sender].stakedAmount);
        }

        providers[msg.sender].stakedAmount -= amount;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed(msg.sender);

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

    /**
     * @notice Get active shard-capable providers meeting minimum requirements
     * @param minLayers Minimum layers the provider must support
     * @param minMemoryMB Minimum available VRAM/RAM in MB
     */
    function getShardProviders(uint16 minLayers, uint32 minMemoryMB) external view returns (Provider[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < providerAddresses.length; i++) {
            Provider storage p = providers[providerAddresses[i]];
            if (p.isActive && p.maxLayers >= minLayers && p.memoryMB >= minMemoryMB) {
                count++;
            }
        }

        Provider[] memory result = new Provider[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < providerAddresses.length; i++) {
            Provider storage p = providers[providerAddresses[i]];
            if (p.isActive && p.maxLayers >= minLayers && p.memoryMB >= minMemoryMB) {
                result[idx++] = p;
            }
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Update platform fee
     */
    function setPlatformFee(uint256 _platformFeeBps) external onlyOwner {
        if (_platformFeeBps > 1000) revert FeeTooHigh(_platformFeeBps, 1000);
        uint256 old = platformFeeBps;
        platformFeeBps = _platformFeeBps;
        emit PlatformFeeUpdated(old, _platformFeeBps);
    }

    /**
     * @notice Update minimum stake
     */
    function setMinStake(uint256 _minStakeAmount) external onlyOwner {
        uint256 old = minStakeAmount;
        minStakeAmount = _minStakeAmount;
        emit MinStakeUpdated(old, _minStakeAmount);
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
     * @notice Set the authorized payment contract for recordEarnings
     */
    function setPaymentContract(address _paymentContract) external onlyOwner {
        if (_paymentContract == address(0)) revert ZeroAddress();
        address old = paymentContract;
        paymentContract = _paymentContract;
        emit PaymentContractUpdated(old, _paymentContract);
    }

    /**
     * @notice Slash a provider's stake (for misbehavior)
     */
    function slashProvider(address provider, uint256 amount, string calldata reason) external onlyOwner nonReentrant {
        if (providers[provider].wallet == address(0)) revert ProviderNotRegistered(provider);
        if (amount == 0) revert ZeroAmount();
        if (providers[provider].stakedAmount < amount) {
            revert InsufficientStakeBalance(amount, providers[provider].stakedAmount);
        }

        // Transfer slashed amount to treasury first (reverts on failure, preserving stake)
        (bool success, ) = treasury.call{value: amount}("");
        if (!success) revert TransferFailed(treasury);

        // Only deduct stake after successful transfer
        providers[provider].stakedAmount -= amount;

        emit ProviderSlashed(provider, amount, reason);
    }

    /**
     * @notice Pause the registry
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the registry
     */
    function unpause() external onlyOwner {
        _unpause();
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
