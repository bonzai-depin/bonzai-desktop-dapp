// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface ICompanionTokenFactory {
    function launchToken(
        uint256 nftTokenId,
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        address agentWallet,
        address companionOwner
    ) external payable returns (address token, bytes32 poolId);
}

/**
 * @title IBonzaiMintPool (subset)
 * @notice Companion mint splits half its fee across the 6 MintPool buckets.
 */
interface IBonzaiMintPool {
    function depositForPool(uint8 poolIndex) external payable;
}

/**
 * @title IERC8004
 * @notice Interface for ERC-8004 Decentralized AI Agent Identity
 * @dev Core identity registry functions for autonomous AI agents.
 *      Used by supportsInterface to advertise ERC-8004 compliance.
 */
interface IERC8004 {
    function getAgentURI(uint256 agentId) external view returns (string memory);
    function setAgentURI(uint256 agentId, string calldata newURI) external;
    function getAgentWallet(uint256 agentId) external view returns (address);
    function setAgentWallet(uint256 agentId, address newWallet) external;
    function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory);
    function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) external;
}

/**
 * @title BonzaiCompanions
 * @notice NFT contract for AI companions on Base with ERC-8004 Identity Registry
 * @dev 0.25 ETH flat mint price, 10K supply cap.
 *
 * On-chain data model:
 *   1. ERC-8004 Agent Traits (via setMetadata): domain, service, skill, tool, trust_model, x402_support
 *   2. Companion Identity (struct): personalityHash, spendingProfile (12 categories × 4 bits packed uint96), gender
 *   3. Full metadata on IPFS via agentURI
 *
 * spendingProfile packing (4 bits per category, values 1-10):
 *   Bits [3:0]=education  [7:4]=entertainment  [11:8]=fashion  [15:12]=finance
 *   [19:16]=food  [23:20]=healthcare  [27:24]=housing  [31:28]=beauty
 *   [35:32]=reading  [39:36]=social  [43:40]=travel  [47:44]=sports
 */
contract BonzaiCompanions is ERC721URIStorage, Ownable, ReentrancyGuard, Pausable {
    using Strings for uint256;

    // ═══════════════════════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════════════════════

    enum Gender { Neutral, Female, Male }

    struct CompanionData {
        address creator;
        uint256 createdAt;
        bytes32 personalityHash;    // keccak256 of identity + personality fields
        uint96 spendingProfile;     // 12 categories × 4 bits, packed for spider chart
        Gender gender;
        bool isVerified;            // Creator-verified authentic
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    uint256 private _tokenIdCounter;
    address public treasury;

    // Flat mint price in ETH
    uint256 public mintPrice = 0.30 ether;
    uint256 public tokenLiquidityAmount = 0.05 ether;
    ICompanionTokenFactory public companionTokenFactory;

    // Core companion data
    mapping(uint256 => CompanionData) public companions;

    // Creator tracking
    mapping(address => uint256[]) private _creatorCompanions;

    // Owner tracking (maintained via _update hook — survives marketplace transfers)
    mapping(address => uint256[]) private _ownerCompanions;
    mapping(uint256 => uint256) private _ownerCompanionIndex;

    // Maximum supply of companions (scarcity bound)
    uint256 public constant MAX_SUPPLY = 10_000;

    // Maximum companions per wallet
    uint256 public constant MAX_PER_WALLET = 4;

    /// @notice MintPool contract — receives 50% of every mint, split equally
    ///         across the 6 content-type buckets so companion-related
    ///         participation rewards every category equally.
    IBonzaiMintPool public mintPool;

    /// @notice Failed pool payments retain their original destination and category.
    mapping(address => mapping(uint8 => uint256)) public pendingPoolFees;
    uint256 public totalPendingPoolFees;
    event PoolFeesRetried(address indexed pool, uint8 indexed poolIndex, uint256 amount);


    /// @notice Number of MintPool buckets (text, audio, image, video, 3D, training)
    uint8 public constant NUM_POOLS = 6;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERC-8004 IDENTITY REGISTRY STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Agent URI pointing to registration file (IPFS)
    mapping(uint256 => string) private _agentURIs;

    /// @notice Agent wallet for protocol revenue capture
    mapping(uint256 => address) private _agentWallets;

    /// @notice Arbitrary metadata storage for agent capabilities
    mapping(uint256 => mapping(string => bytes)) private _agentMetadata;

    /// @notice Reserved metadata key for agentWallet
    string public constant AGENT_WALLET_KEY = "agentWallet";

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event CompanionMinted(
        uint256 indexed tokenId,
        address indexed creator,
        Gender gender,
        uint96 indexed spendingProfile,
        string metadataURI
    );
    event CompanionVerified(uint256 indexed tokenId, address indexed verifier);
    event MintPoolUpdated(address indexed oldPool, address indexed newPool);
    event MintPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PoolDepositFailed(address indexed pool, uint8 indexed poolIndex, uint256 amount);
    event PersonalityHashUpdated(uint256 indexed tokenId, bytes32 oldHash, bytes32 newHash);
    event SpendingProfileUpdated(uint256 indexed tokenId, uint96 oldProfile, uint96 newProfile);
    event CompanionTokenFactoryUpdated(address indexed oldFactory, address indexed newFactory);
    event TokenLiquidityAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event CompanionEconomyLaunched(uint256 indexed tokenId, address indexed token, bytes32 indexed poolId, uint256 liquidity);

    // ERC-8004 events
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedMetadataKey,
        string metadataKey,
        bytes metadataValue
    );
    event AgentWalletSet(uint256 indexed agentId, address indexed newWallet, address indexed setBy);
    event AgentWalletUnset(uint256 indexed agentId, address indexed previousWallet);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    constructor(
        address _treasury
    ) ERC721("BonzAI Companions", "BZCOMP") Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MINTING (WITH ERC-8004 AGENT IDENTITY)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Mint a companion with ERC-8004 agent identity
     * @param agentURI IPFS URI to ERC-8004 registration file
     * @param personalityHash Hash of personality traits
     * @param spendingProfile Packed uint96 — 12 categories × 4 bits
     * @param gender Companion gender
     * @param agentWallet Address that receives protocol revenue
     * @return tokenId The minted token ID (agentId)
     */
    function mintCompanion(
        string memory agentURI,
        bytes32 personalityHash,
        uint96 spendingProfile,
        Gender gender,
        address agentWallet
    ) external payable nonReentrant whenNotPaused returns (uint256) {
        require(address(companionTokenFactory) == address(0), "Named companion token required");
        return _mintCompanion(
            agentURI,
            personalityHash,
            spendingProfile,
            gender,
            agentWallet,
            "",
            ""
        );
    }

    function mintCompanionWithToken(
        string memory agentURI,
        bytes32 personalityHash,
        uint96 spendingProfile,
        Gender gender,
        address agentWallet,
        string memory tokenName,
        string memory tokenSymbol
    ) external payable nonReentrant whenNotPaused returns (uint256) {
        require(bytes(tokenName).length > 0, "Empty token name");
        require(bytes(tokenSymbol).length > 0, "Empty token symbol");
        return _mintCompanion(
            agentURI,
            personalityHash,
            spendingProfile,
            gender,
            agentWallet,
            tokenName,
            tokenSymbol
        );
    }

    function _mintCompanion(
        string memory agentURI,
        bytes32 personalityHash,
        uint96 spendingProfile,
        Gender gender,
        address agentWallet,
        string memory tokenName,
        string memory tokenSymbol
    ) internal returns (uint256) {
        require(_tokenIdCounter < MAX_SUPPLY, "Max supply reached");
        require(balanceOf(msg.sender) < MAX_PER_WALLET, "Max companions per wallet reached");
        require(bytes(agentURI).length > 0, "Empty agent URI");
        _validateSpendingProfile(spendingProfile);

        // Companion mint costs `mintPrice` regardless of unlock status.
        // Unlock applies only to LVL-thresholded MintPool registration and
        // collectible mint fees — companion supply is constrained (10K cap)
        // and benefits both the LP-side hook and the MintPool, so it always
        // collects a fee.
        uint256 fee = mintPrice;
        require(msg.value >= fee, "Insufficient mint fee");

        // State changes BEFORE ETH transfers
        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;

        companions[tokenId] = CompanionData({
            creator: msg.sender,
            createdAt: block.timestamp,
            personalityHash: personalityHash,
            spendingProfile: spendingProfile,
            gender: gender,
            isVerified: false
        });

        _creatorCompanions[msg.sender].push(tokenId);

        // Fee split: 50% treasury, 50% spread equally across the 6 MintPool
        // buckets (~8.33% each). Failed configured-pool payments stay reserved
        // for permissionless retry. Only an unset pool or rounding remainder
        // falls back to treasury.
        uint256 liquidityBudget = address(companionTokenFactory) == address(0) ? 0 : tokenLiquidityAmount;
        require(fee > liquidityBudget, "Mint price below liquidity reserve");
        uint256 protocolFee = fee - liquidityBudget;
        uint256 treasuryAmt = protocolFee / 2;
        uint256 poolBudget = protocolFee - treasuryAmt;
        uint256 perPool = poolBudget / NUM_POOLS;
        uint256 allocatedToPool = 0;
        address pool = address(mintPool);

        if (pool != address(0) && perPool > 0) {
            for (uint8 i = 0; i < NUM_POOLS; ) {
                allocatedToPool += perPool;
                try IBonzaiMintPool(pool).depositForPool{value: perPool}(i) {
                    // Delivered directly.
                } catch {
                    pendingPoolFees[pool][i] += perPool;
                    totalPendingPoolFees += perPool;
                    emit PoolDepositFailed(pool, i, perPool);
                }
                unchecked { ++i; }
            }
        }

        uint256 treasurySend = treasuryAmt + (poolBudget - allocatedToPool);
        if (treasurySend > 0) {
            (bool sent, ) = treasury.call{value: treasurySend}("");
            require(sent, "Treasury transfer failed");
        }

        // Refund excess ETH to minter
        uint256 excess = msg.value - fee;
        if (excess > 0) {
            (bool refunded, ) = msg.sender.call{value: excess}("");
            require(refunded, "ETH refund failed");
        }

        // _safeMint AFTER all state changes and ETH transfers
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, agentURI);

        // Set ERC-8004 agent identity
        _agentURIs[tokenId] = agentURI;
        // Auto-launched token allocations and future hook revenue must use
        // the same effective wallet, including the owner fallback.
        if (agentWallet == address(0) && address(companionTokenFactory) != address(0)) {
            agentWallet = msg.sender;
        }
        if (agentWallet != address(0)) {
            _agentWallets[tokenId] = agentWallet;
            emit AgentWalletSet(tokenId, agentWallet, msg.sender);
        }

        if (address(companionTokenFactory) != address(0)) {
            require(bytes(tokenName).length > 0, "Empty token name");
            require(bytes(tokenSymbol).length > 0, "Empty token symbol");
            (address token, bytes32 poolId) = companionTokenFactory.launchToken{value: liquidityBudget}(
                tokenId,
                tokenName,
                tokenSymbol,
                agentURI,
                agentWallet,
                msg.sender
            );
            emit CompanionEconomyLaunched(tokenId, token, poolId, liquidityBudget);
        }

        emit Registered(tokenId, agentURI, msg.sender);
        emit CompanionMinted(tokenId, msg.sender, gender, spendingProfile, agentURI);

        return tokenId;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SPENDING PROFILE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Validate that a packed uint96 spending profile has all 12 nibbles in [1,10]
     * @dev Reverts if any nibble is 0 or > 10. Called internally during mint.
     */
    function _validateSpendingProfile(uint96 packed) internal pure {
        // Ensure upper bits (48-95) are zero — only 12 nibbles (48 bits) are used
        require(packed >> 48 == 0, "Upper bits must be zero");
        for (uint256 i = 0; i < 12; i++) {
            uint8 val = uint8((packed >> (i * 4)) & 0xF);
            require(val >= 1 && val <= 10, "Spending value must be 1-10");
        }
    }

    /**
     * @notice Pack 12 spending categories (values 1-10) into a uint96
     * @param categories Array of 12 uint8 values (education, entertainment, fashion,
     *        finance, food, healthcare, housing, beauty, reading, social, travel, sports)
     *        Each value represents spending intensity: 1-2=frugal, 3-4=conservative,
     *        5-6=moderate, 7-8=enthusiast, 9-10=luxury
     * @return packed The packed uint96 value
     */
    function packSpendingProfile(uint8[12] memory categories) public pure returns (uint96) {
        uint96 packed = 0;
        for (uint256 i = 0; i < 12; i++) {
            require(categories[i] >= 1 && categories[i] <= 10, "Category value must be 1-10");
            packed |= uint96(categories[i]) << uint96(i * 4);
        }
        return packed;
    }

    /**
     * @notice Unpack a spending profile into 12 category values
     * @param tokenId The token ID
     * @return categories Array of 12 uint8 values
     */
    function getSpendingProfile(uint256 tokenId) external view returns (uint8[12] memory categories) {
        require(_exists(tokenId), "Token does not exist");
        uint96 packed = companions[tokenId].spendingProfile;
        for (uint256 i = 0; i < 12; i++) {
            categories[i] = uint8((packed >> (i * 4)) & 0xF);
        }
        return categories;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERC-8004 IDENTITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get the agent URI for a token
     * @param agentId The token ID
     * @return The agent URI
     */
    function getAgentURI(uint256 agentId) external view returns (string memory) {
        require(_exists(agentId), "Agent does not exist");
        return _agentURIs[agentId];
    }

    /**
     * @notice Update the agent URI (owner only)
     * @param agentId The token ID
     * @param newURI The new agent URI
     */
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(ownerOf(agentId) == msg.sender, "Not owner");
        require(bytes(newURI).length > 0, "Empty URI");

        _agentURIs[agentId] = newURI;
        _setTokenURI(agentId, newURI);

        emit URIUpdated(agentId, newURI, msg.sender);
    }

    /**
     * @notice Get the agent wallet for a token
     * @param agentId The token ID
     * @return The agent wallet address
     */
    function getAgentWallet(uint256 agentId) external view returns (address) {
        require(_exists(agentId), "Agent does not exist");
        return _agentWallets[agentId];
    }

    /**
     * @notice Set the agent wallet (owner only).
     *         The token owner can set or change the agent wallet at any time,
     *         including after a marketplace transfer. This allows both the
     *         original and new owner to control the companion's payment wallet.
     * @param agentId The token ID
     * @param newWallet The new wallet address
     */
    function setAgentWallet(uint256 agentId, address newWallet) external {
        require(ownerOf(agentId) == msg.sender, "Not owner");
        require(newWallet != address(0), "Invalid wallet address");

        _agentWallets[agentId] = newWallet;

        emit AgentWalletSet(agentId, newWallet, msg.sender);
    }

    /**
     * @notice Update the personality hash for a companion (owner only).
     *         Allows bare-minted companions to set personality after mint.
     * @param tokenId The token ID
     * @param newHash The new personality hash
     */
    function setPersonalityHash(uint256 tokenId, bytes32 newHash) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        bytes32 oldHash = companions[tokenId].personalityHash;
        companions[tokenId].personalityHash = newHash;
        emit PersonalityHashUpdated(tokenId, oldHash, newHash);
    }

    /**
     * @notice Update the spending profile for a companion (owner only).
     *         Allows bare-minted companions to set spending profile after mint.
     * @param tokenId The token ID
     * @param newProfile Packed uint96 — 12 categories x 4 bits
     */
    function setSpendingProfile(uint256 tokenId, uint96 newProfile) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        _validateSpendingProfile(newProfile);
        uint96 oldProfile = companions[tokenId].spendingProfile;
        companions[tokenId].spendingProfile = newProfile;
        emit SpendingProfileUpdated(tokenId, oldProfile, newProfile);
    }

    /**
     * @notice Remove the agent wallet (owner only). Routes future hook fees
     *         to the treasury so they're never paid to address(0). The owner
     *         can re-assign at any time via setAgentWallet.
     * @param agentId The token ID
     */
    function unsetAgentWallet(uint256 agentId) external {
        require(ownerOf(agentId) == msg.sender, "Not owner");

        address previousWallet = _agentWallets[agentId];
        require(previousWallet != address(0), "No wallet set");

        // Re-route fee destination to treasury rather than zero. Hook will
        // pay treasury until the owner sets a new agent wallet.
        _agentWallets[agentId] = treasury;

        emit AgentWalletUnset(agentId, previousWallet);
        emit AgentWalletSet(agentId, treasury, msg.sender);
    }

    /**
     * @notice Get metadata for an agent
     * @param agentId The token ID
     * @param metadataKey The metadata key
     * @return The metadata value as bytes
     */
    function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory) {
        require(_exists(agentId), "Agent does not exist");
        return _agentMetadata[agentId][metadataKey];
    }

    /**
     * @notice Set metadata for an agent (owner only)
     * @param agentId The token ID
     * @param metadataKey The metadata key
     * @param metadataValue The metadata value
     */
    function setMetadata(
        uint256 agentId,
        string memory metadataKey,
        bytes memory metadataValue
    ) external {
        require(ownerOf(agentId) == msg.sender, "Not owner");
        require(
            keccak256(bytes(metadataKey)) != keccak256(bytes(AGENT_WALLET_KEY)),
            "Use setAgentWallet for wallet changes"
        );

        _agentMetadata[agentId][metadataKey] = metadataValue;

        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    /**
     * @notice Set multiple metadata entries in a single transaction
     * @param agentId The token ID
     * @param metadataKeys Array of metadata keys
     * @param metadataValues Array of metadata values
     */
    function setMetadataBatch(
        uint256 agentId,
        string[] calldata metadataKeys,
        bytes[] calldata metadataValues
    ) external {
        require(ownerOf(agentId) == msg.sender, "Not owner");
        require(metadataKeys.length == metadataValues.length, "Length mismatch");

        for (uint256 i = 0; i < metadataKeys.length; i++) {
            require(
                keccak256(bytes(metadataKeys[i])) != keccak256(bytes(AGENT_WALLET_KEY)),
                "Use setAgentWallet for wallet changes"
            );
            _agentMetadata[agentId][metadataKeys[i]] = metadataValues[i];
            emit MetadataSet(agentId, metadataKeys[i], metadataKeys[i], metadataValues[i]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACCESS CONTROL
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Check if user can use a companion
     */
    function canUseCompanion(address user, uint256 tokenId) external view returns (bool) {
        if (!_exists(tokenId)) return false;

        return ownerOf(tokenId) == user ||
               getApproved(tokenId) == user ||
               isApprovedForAll(ownerOf(tokenId), user);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VERIFICATION & ANALYTICS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Verify companion authenticity (creator only)
     */
    function verifyCompanion(uint256 tokenId) external {
        require(companions[tokenId].creator == msg.sender, "Not creator");
        companions[tokenId].isVerified = true;
        emit CompanionVerified(tokenId, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function getCompanion(uint256 tokenId) external view returns (CompanionData memory) {
        require(_exists(tokenId), "Token does not exist");
        return companions[tokenId];
    }

    function getCreatorCompanions(address creator) external view returns (uint256[] memory) {
        return _creatorCompanions[creator];
    }

    function getOwnerCompanions(address owner) external view returns (uint256[] memory) {
        return _ownerCompanions[owner];
    }

    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }

    /**
     * @notice Get full agent identity info
     * @param agentId The token ID
     * @return uri The agent URI
     * @return wallet The agent wallet
     * @return owner The token owner
     */
    function getAgentIdentity(uint256 agentId)
        external
        view
        returns (string memory uri, address wallet, address owner)
    {
        require(_exists(agentId), "Agent does not exist");
        return (_agentURIs[agentId], _agentWallets[agentId], ownerOf(agentId));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COLLECTION METADATA (OpenSea)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Collection-level metadata URI (OpenSea collection page)
    string private _contractURI;

    /// @notice Returns collection-level metadata for marketplaces
    function contractURI() external view returns (string memory) {
        return _contractURI;
    }

    /// @notice Set collection-level metadata URI (owner only)
    function setContractURI(string calldata newContractURI) external onlyOwner {
        _contractURI = newContractURI;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function setMintPrice(uint256 _mintPrice) external onlyOwner {
        require(_mintPrice > tokenLiquidityAmount, "Price must cover liquidity");
        uint256 old = mintPrice;
        mintPrice = _mintPrice;
        emit MintPriceUpdated(old, _mintPrice);
    }

    function setCompanionTokenFactory(address newFactory) external onlyOwner {
        address old = address(companionTokenFactory);
        require(_tokenIdCounter == 0 || old == address(0) || newFactory == old, "Token factory frozen after minting");
        companionTokenFactory = ICompanionTokenFactory(newFactory);
        emit CompanionTokenFactoryUpdated(old, newFactory);
    }

    function setTokenLiquidityAmount(uint256 newAmount) external onlyOwner {
        require(newAmount > 0 && newAmount < mintPrice, "Invalid liquidity amount");
        uint256 old = tokenLiquidityAmount;
        tokenLiquidityAmount = newAmount;
        emit TokenLiquidityAmountUpdated(old, newAmount);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }

    function setMintPool(address _pool) external onlyOwner {
        address old = address(mintPool);
        mintPool = IBonzaiMintPool(_pool);
        emit MintPoolUpdated(old, _pool);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Recover ERC20 tokens sent to contract by mistake
     */
    function recoverERC20(address token, uint256 amount) external onlyOwner {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", owner(), amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
    }

    /// @notice Anyone may deliver retained fees, without changing their beneficiary.
    function retryPoolFees(address pool, uint8 poolIndex) external nonReentrant {
        uint256 amount = pendingPoolFees[pool][poolIndex];
        require(amount > 0, "No pending pool fees");
        pendingPoolFees[pool][poolIndex] = 0;
        totalPendingPoolFees -= amount;
        IBonzaiMintPool(pool).depositForPool{value: amount}(poolIndex);
        emit PoolFeesRetried(pool, poolIndex, amount);
    }

    /// @notice Recover surplus ETH only; reserved pool fees remain payable to their original pool.
    function withdrawETH() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > totalPendingPoolFees, "No ETH to withdraw");
        (bool sent, ) = owner().call{value: balance - totalPendingPoolFees}("");
        require(sent, "ETH transfer failed");
    }

    /// @notice Accept ETH transfers
    receive() external payable {}

    // ═══════════════════════════════════════════════════════════════════════════
    // OVERRIDES
    // ═══════════════════════════════════════════════════════════════════════════

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);

        // Remove from previous owner's list (skip on mint where from == address(0))
        if (from != address(0)) {
            _removeFromOwnerList(from, tokenId);
        }

        // Add to new owner's list (skip on burn where to == address(0))
        if (to != address(0)) {
            _ownerCompanionIndex[tokenId] = _ownerCompanions[to].length;
            _ownerCompanions[to].push(tokenId);
        }

        return from;
    }

    function _removeFromOwnerList(address owner, uint256 tokenId) private {
        uint256[] storage list = _ownerCompanions[owner];
        uint256 idx = _ownerCompanionIndex[tokenId];
        uint256 lastIdx = list.length - 1;

        if (idx != lastIdx) {
            uint256 lastTokenId = list[lastIdx];
            list[idx] = lastTokenId;
            _ownerCompanionIndex[lastTokenId] = idx;
        }

        list.pop();
        delete _ownerCompanionIndex[tokenId];
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override
        returns (bool)
    {
        return
            interfaceId == type(IERC8004).interfaceId ||
            super.supportsInterface(interfaceId);
    }

}
