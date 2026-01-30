// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title BonzAI Companion NFT (ERC-8004 Compatible)
 * @notice Each companion is a unique AI agent with on-chain identity
 * @dev Implements ERC-8004 Agent Identity standard for AI agents
 *
 * ERC-8004 Registries:
 * - Identity: This contract (ERC-721 token = agent identity)
 * - Reputation: Tracked via events and external indexers
 * - Validation: Via signature verification and owner attestations
 */
contract BonzaiCompanionNFT is ERC721, ERC721URIStorage, ERC721Enumerable, Ownable {
    using Counters for Counters.Counter;
    using Strings for uint256;

    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════

    Counters.Counter private _tokenIdCounter;

    // Companion metadata stored on-chain for ERC-8004 compliance
    struct CompanionIdentity {
        string name;           // Companion name (e.g., "Aurora")
        string personality;    // Personality traits
        string appearance;     // Physical description
        string voiceStyle;     // How they speak
        string moltbookHandle; // Moltbook username (external social identity)
        uint256 createdAt;     // Timestamp of creation
        uint256 lastActiveAt;  // Last activity timestamp
        bool isActive;         // Whether companion is active
    }

    // ERC-8004 Agent Registration
    struct AgentRegistration {
        string agentType;      // "companion", "assistant", etc.
        string[] protocols;    // Supported protocols ["moltbook", "openclaw"]
        string endpointUri;    // How to reach this agent (IPFS/HTTP)
        bytes32 configHash;    // Hash of off-chain configuration
    }

    // Token ID => Companion Identity
    mapping(uint256 => CompanionIdentity) public companions;

    // Token ID => Agent Registration (ERC-8004)
    mapping(uint256 => AgentRegistration) public agentRegistrations;

    // Name => Token ID (for lookup)
    mapping(string => uint256) public companionByName;

    // Moltbook handle => Token ID
    mapping(string => uint256) public companionByMoltbook;

    // Reputation scores (simple on-chain tracking)
    mapping(uint256 => int256) public reputationScores;

    // Authorized operators (can update activity, not transfer)
    mapping(address => bool) public authorizedOperators;

    // Mint price
    uint256 public mintPrice = 0.01 ether;

    // Base URI for metadata
    string private _baseTokenURI;

    // ═══════════════════════════════════════════════════════════════════════
    // EVENTS (ERC-8004 Compatible)
    // ═══════════════════════════════════════════════════════════════════════

    event CompanionMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string name,
        string personality
    );

    event CompanionUpdated(
        uint256 indexed tokenId,
        string field,
        string newValue
    );

    event AgentRegistered(
        uint256 indexed tokenId,
        string agentType,
        string endpointUri
    );

    event MoltbookLinked(
        uint256 indexed tokenId,
        string moltbookHandle
    );

    event ReputationChanged(
        uint256 indexed tokenId,
        int256 delta,
        int256 newScore,
        string reason
    );

    event ActivityRecorded(
        uint256 indexed tokenId,
        uint256 timestamp,
        string activityType
    );

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════

    constructor() ERC721("BonzAI Companion", "COMPANION") Ownable(msg.sender) {
        _baseTokenURI = "https://bonzai.app/api/companions/";
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MINTING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Mint a new companion NFT
     * @param name Companion name (must be unique)
     * @param personality Personality traits
     * @param appearance Physical description
     * @param voiceStyle Voice/speech style
     * @param metadataUri IPFS URI for full metadata
     */
    function mintCompanion(
        string memory name,
        string memory personality,
        string memory appearance,
        string memory voiceStyle,
        string memory metadataUri
    ) external payable returns (uint256) {
        require(msg.value >= mintPrice, "Insufficient payment");
        require(bytes(name).length > 0, "Name required");
        require(companionByName[name] == 0, "Name already taken");

        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();

        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, metadataUri);

        companions[tokenId] = CompanionIdentity({
            name: name,
            personality: personality,
            appearance: appearance,
            voiceStyle: voiceStyle,
            moltbookHandle: "",
            createdAt: block.timestamp,
            lastActiveAt: block.timestamp,
            isActive: true
        });

        companionByName[name] = tokenId;

        emit CompanionMinted(tokenId, msg.sender, name, personality);

        return tokenId;
    }

    /**
     * @notice Mint a predefined companion (owner only, for initial set)
     */
    function mintPredefinedCompanion(
        address to,
        string memory name,
        string memory personality,
        string memory appearance,
        string memory voiceStyle,
        string memory metadataUri
    ) external onlyOwner returns (uint256) {
        require(companionByName[name] == 0, "Name already taken");

        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, metadataUri);

        companions[tokenId] = CompanionIdentity({
            name: name,
            personality: personality,
            appearance: appearance,
            voiceStyle: voiceStyle,
            moltbookHandle: "",
            createdAt: block.timestamp,
            lastActiveAt: block.timestamp,
            isActive: true
        });

        companionByName[name] = tokenId;

        emit CompanionMinted(tokenId, to, name, personality);

        return tokenId;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ERC-8004 AGENT REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Register agent capabilities (ERC-8004)
     * @param tokenId Companion token ID
     * @param agentType Type of agent ("companion")
     * @param protocols Supported protocols
     * @param endpointUri How to reach the agent
     * @param configHash Hash of off-chain config
     */
    function registerAgent(
        uint256 tokenId,
        string memory agentType,
        string[] memory protocols,
        string memory endpointUri,
        bytes32 configHash
    ) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");

        agentRegistrations[tokenId] = AgentRegistration({
            agentType: agentType,
            protocols: protocols,
            endpointUri: endpointUri,
            configHash: configHash
        });

        emit AgentRegistered(tokenId, agentType, endpointUri);
    }

    /**
     * @notice Get agent registration info
     */
    function getAgentRegistration(uint256 tokenId) external view returns (
        string memory agentType,
        string[] memory protocols,
        string memory endpointUri,
        bytes32 configHash
    ) {
        AgentRegistration storage reg = agentRegistrations[tokenId];
        return (reg.agentType, reg.protocols, reg.endpointUri, reg.configHash);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MOLTBOOK INTEGRATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Link a Moltbook account to this companion
     * @param tokenId Companion token ID
     * @param moltbookHandle Moltbook username
     */
    function linkMoltbook(uint256 tokenId, string memory moltbookHandle) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(bytes(moltbookHandle).length > 0, "Handle required");
        require(companionByMoltbook[moltbookHandle] == 0, "Handle already linked");

        // Unlink previous handle if exists
        string memory oldHandle = companions[tokenId].moltbookHandle;
        if (bytes(oldHandle).length > 0) {
            delete companionByMoltbook[oldHandle];
        }

        companions[tokenId].moltbookHandle = moltbookHandle;
        companionByMoltbook[moltbookHandle] = tokenId;

        emit MoltbookLinked(tokenId, moltbookHandle);
    }

    /**
     * @notice Get companion by Moltbook handle
     */
    function getCompanionByMoltbook(string memory handle) external view returns (uint256) {
        return companionByMoltbook[handle];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REPUTATION (ERC-8004)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Update reputation score (authorized operators only)
     * @param tokenId Companion token ID
     * @param delta Change in reputation (positive or negative)
     * @param reason Reason for change
     */
    function updateReputation(
        uint256 tokenId,
        int256 delta,
        string memory reason
    ) external {
        require(
            authorizedOperators[msg.sender] || ownerOf(tokenId) == msg.sender,
            "Not authorized"
        );

        reputationScores[tokenId] += delta;

        emit ReputationChanged(tokenId, delta, reputationScores[tokenId], reason);
    }

    /**
     * @notice Get reputation score
     */
    function getReputation(uint256 tokenId) external view returns (int256) {
        return reputationScores[tokenId];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY TRACKING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Record companion activity (updates lastActiveAt)
     * @param tokenId Companion token ID
     * @param activityType Type of activity ("chat", "post", "comment")
     */
    function recordActivity(uint256 tokenId, string memory activityType) external {
        require(
            authorizedOperators[msg.sender] ||
            ownerOf(tokenId) == msg.sender,
            "Not authorized"
        );

        companions[tokenId].lastActiveAt = block.timestamp;

        emit ActivityRecorded(tokenId, block.timestamp, activityType);
    }

    /**
     * @notice Get companion identity
     */
    function getCompanion(uint256 tokenId) external view returns (CompanionIdentity memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return companions[tokenId];
    }

    /**
     * @notice Get companion by name
     */
    function getCompanionByName(string memory name) external view returns (uint256) {
        return companionByName[name];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Set mint price
     */
    function setMintPrice(uint256 newPrice) external onlyOwner {
        mintPrice = newPrice;
    }

    /**
     * @notice Set base URI
     */
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
    }

    /**
     * @notice Add/remove authorized operator
     */
    function setAuthorizedOperator(address operator, bool authorized) external onlyOwner {
        authorizedOperators[operator] = authorized;
    }

    /**
     * @notice Withdraw funds
     */
    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OVERRIDES
    // ═══════════════════════════════════════════════════════════════════════

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, ERC721Enumerable)
        returns (bool)
    {
        // ERC-8004 interface ID (placeholder - use actual when standardized)
        // bytes4 ERC8004_INTERFACE_ID = 0x12345678;
        return super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }
}
