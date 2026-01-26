// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title BonzaiCompanionNFT
 * @notice NFT contract for AI roleplay companions with creator royalties
 * @dev Implements ERC721 with URI storage and EIP-2981 royalties
 */
contract BonzaiCompanionNFT is ERC721URIStorage, ERC721Royalty, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════════════════════

    enum Rarity { Common, Rare, Epic, Legendary, Mythic }
    enum Gender { Neutral, Female, Male }

    struct CompanionData {
        address creator;
        uint256 createdAt;
        bytes32 personalityHash;    // keccak256 of core personality traits for verification
        bytes32 loraHash;           // Optional: hash of LoRA weights for visual consistency
        Rarity rarity;
        Gender gender;
        bool isVerified;            // Creator-verified authentic
        bool isBuiltIn;             // Platform built-in companion (non-transferable)
        uint256 totalChats;         // Usage analytics
        uint256 totalMessages;
    }

    struct ListingInfo {
        bool isListed;
        uint256 price;              // Price in BONZAI tokens
        address seller;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    uint256 private _tokenIdCounter;
    IERC20 public bonzaiToken;
    address public treasury;

    // Token data
    mapping(uint256 => CompanionData) public companions;
    mapping(uint256 => ListingInfo) public listings;

    // Creator tracking
    mapping(address => uint256[]) private _creatorCompanions;

    // Built-in companions (free to use, owned by contract)
    mapping(string => uint256) public builtInCompanions; // builtInId => tokenId
    string[] public builtInCompanionIds;

    // Pricing by rarity (in BONZAI tokens, 18 decimals)
    mapping(Rarity => uint256) public mintPrices;

    // Platform fee for marketplace sales (basis points, 10000 = 100%)
    uint256 public platformFeeBps = 250; // 2.5%

    // Maximum royalty (basis points)
    uint256 public constant MAX_ROYALTY_BPS = 1000; // 10%

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event CompanionMinted(
        uint256 indexed tokenId,
        address indexed creator,
        Rarity rarity,
        Gender gender,
        string metadataURI
    );
    event CompanionVerified(uint256 indexed tokenId, address indexed verifier);
    event CompanionListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event CompanionDelisted(uint256 indexed tokenId);
    event CompanionSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);
    event BuiltInCompanionRegistered(string builtInId, uint256 tokenId);
    event CompanionUsageUpdated(uint256 indexed tokenId, uint256 totalChats, uint256 totalMessages);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    constructor(
        address _bonzaiToken,
        address _treasury
    ) ERC721("Bonzai Companion", "BZCOMP") Ownable(msg.sender) {
        require(_bonzaiToken != address(0), "Invalid token address");
        require(_treasury != address(0), "Invalid treasury address");

        bonzaiToken = IERC20(_bonzaiToken);
        treasury = _treasury;

        // Set default mint prices (in BONZAI tokens)
        mintPrices[Rarity.Common] = 100 ether;      // 100 BONZAI
        mintPrices[Rarity.Rare] = 500 ether;        // 500 BONZAI
        mintPrices[Rarity.Epic] = 2000 ether;       // 2,000 BONZAI
        mintPrices[Rarity.Legendary] = 10000 ether; // 10,000 BONZAI
        mintPrices[Rarity.Mythic] = 50000 ether;    // 50,000 BONZAI
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MINTING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Mint a new companion NFT
     * @param metadataURI IPFS URI to companion metadata JSON
     * @param personalityHash Hash of personality traits for verification
     * @param loraHash Optional hash of LoRA weights
     * @param rarity Companion rarity tier
     * @param gender Companion gender for voice selection
     * @param royaltyBps Creator royalty in basis points (max 10%)
     */
    function mintCompanion(
        string memory metadataURI,
        bytes32 personalityHash,
        bytes32 loraHash,
        Rarity rarity,
        Gender gender,
        uint96 royaltyBps
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(bytes(metadataURI).length > 0, "Empty metadata URI");
        require(royaltyBps <= MAX_ROYALTY_BPS, "Royalty exceeds maximum");

        // Charge mint price
        uint256 price = mintPrices[rarity];
        if (price > 0) {
            bonzaiToken.safeTransferFrom(msg.sender, treasury, price);
        }

        uint256 tokenId = _tokenIdCounter++;

        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, metadataURI);

        // Set creator royalty
        if (royaltyBps > 0) {
            _setTokenRoyalty(tokenId, msg.sender, royaltyBps);
        }

        companions[tokenId] = CompanionData({
            creator: msg.sender,
            createdAt: block.timestamp,
            personalityHash: personalityHash,
            loraHash: loraHash,
            rarity: rarity,
            gender: gender,
            isVerified: false,
            isBuiltIn: false,
            totalChats: 0,
            totalMessages: 0
        });

        _creatorCompanions[msg.sender].push(tokenId);

        emit CompanionMinted(tokenId, msg.sender, rarity, gender, metadataURI);
        return tokenId;
    }

    /**
     * @notice Register a built-in companion (admin only)
     * @dev Built-in companions are owned by the contract and free to use
     */
    function registerBuiltInCompanion(
        string memory builtInId,
        string memory metadataURI,
        bytes32 personalityHash,
        Gender gender
    ) external onlyOwner returns (uint256) {
        require(bytes(builtInId).length > 0, "Empty built-in ID");
        require(builtInCompanions[builtInId] == 0, "Built-in ID already exists");

        uint256 tokenId = _tokenIdCounter++;

        // Mint to contract itself
        _safeMint(address(this), tokenId);
        _setTokenURI(tokenId, metadataURI);

        companions[tokenId] = CompanionData({
            creator: msg.sender,
            createdAt: block.timestamp,
            personalityHash: personalityHash,
            loraHash: bytes32(0),
            rarity: Rarity.Common,
            gender: gender,
            isVerified: true,
            isBuiltIn: true,
            totalChats: 0,
            totalMessages: 0
        });

        builtInCompanions[builtInId] = tokenId;
        builtInCompanionIds.push(builtInId);

        emit BuiltInCompanionRegistered(builtInId, tokenId);
        emit CompanionMinted(tokenId, msg.sender, Rarity.Common, gender, metadataURI);
        return tokenId;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MARKETPLACE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice List a companion for sale
     * @param tokenId Token to list
     * @param price Price in BONZAI tokens
     */
    function listCompanion(uint256 tokenId, uint256 price) external nonReentrant whenNotPaused {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(!companions[tokenId].isBuiltIn, "Cannot sell built-in companion");
        require(price > 0, "Price must be positive");

        listings[tokenId] = ListingInfo({
            isListed: true,
            price: price,
            seller: msg.sender
        });

        emit CompanionListed(tokenId, msg.sender, price);
    }

    /**
     * @notice Remove listing
     */
    function delistCompanion(uint256 tokenId) external {
        require(listings[tokenId].seller == msg.sender, "Not seller");

        delete listings[tokenId];
        emit CompanionDelisted(tokenId);
    }

    /**
     * @notice Purchase a listed companion
     */
    function purchaseCompanion(uint256 tokenId) external nonReentrant whenNotPaused {
        ListingInfo memory listing = listings[tokenId];
        require(listing.isListed, "Not listed");
        require(listing.seller != msg.sender, "Cannot buy own listing");

        address seller = listing.seller;
        uint256 price = listing.price;

        // Clear listing first (reentrancy protection)
        delete listings[tokenId];

        // Calculate fees
        uint256 platformFee = (price * platformFeeBps) / 10000;
        (address royaltyReceiver, uint256 royaltyAmount) = royaltyInfo(tokenId, price);

        uint256 sellerProceeds = price - platformFee - royaltyAmount;

        // Transfer payments
        bonzaiToken.safeTransferFrom(msg.sender, treasury, platformFee);
        if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
            bonzaiToken.safeTransferFrom(msg.sender, royaltyReceiver, royaltyAmount);
        }
        bonzaiToken.safeTransferFrom(msg.sender, seller, sellerProceeds);

        // Transfer NFT
        _transfer(seller, msg.sender, tokenId);

        emit CompanionSold(tokenId, seller, msg.sender, price);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACCESS CONTROL
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Check if user can use a companion
     * @dev Returns true if user owns the companion OR it's a built-in companion
     */
    function canUseCompanion(address user, uint256 tokenId) external view returns (bool) {
        if (!_exists(tokenId)) return false;

        // Built-in companions are free for everyone
        if (companions[tokenId].isBuiltIn) return true;

        // Check ownership or approval
        return ownerOf(tokenId) == user ||
               getApproved(tokenId) == user ||
               isApprovedForAll(ownerOf(tokenId), user);
    }

    /**
     * @notice Check if a built-in companion ID can be used
     */
    function canUseBuiltIn(string memory builtInId) external view returns (bool) {
        uint256 tokenId = builtInCompanions[builtInId];
        return tokenId != 0 && companions[tokenId].isBuiltIn;
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

    /**
     * @notice Update usage statistics (called by platform)
     */
    function recordUsage(uint256 tokenId, uint256 messages) external onlyOwner {
        require(_exists(tokenId), "Token does not exist");
        companions[tokenId].totalChats++;
        companions[tokenId].totalMessages += messages;
        emit CompanionUsageUpdated(tokenId, companions[tokenId].totalChats, companions[tokenId].totalMessages);
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

    function getBuiltInCompanionIds() external view returns (string[] memory) {
        return builtInCompanionIds;
    }

    function getBuiltInTokenId(string memory builtInId) external view returns (uint256) {
        return builtInCompanions[builtInId];
    }

    function getListing(uint256 tokenId) external view returns (ListingInfo memory) {
        return listings[tokenId];
    }

    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function setMintPrice(Rarity rarity, uint256 price) external onlyOwner {
        mintPrices[rarity] = price;
    }

    function setPlatformFee(uint256 feeBps) external onlyOwner {
        require(feeBps <= 1000, "Fee too high"); // Max 10%
        platformFeeBps = feeBps;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
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
        IERC20(token).safeTransfer(owner(), amount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OVERRIDES
    // ═══════════════════════════════════════════════════════════════════════════

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        // Prevent transfer of built-in companions
        if (companions[tokenId].isBuiltIn && to != address(0) && _ownerOf(tokenId) != address(0)) {
            revert("Built-in companions cannot be transferred");
        }

        // Clear listing on transfer
        if (listings[tokenId].isListed) {
            delete listings[tokenId];
        }

        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, ERC721Royalty)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
}
