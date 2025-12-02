// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BonzaiToken
 * @dev The utility token for the BonzAI ecosystem.
 */
contract BonzaiToken is ERC20, Ownable {
    constructor() ERC20("BonzAI", "BONZAI") Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000_000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

/**
 * @title BonzaiCollectible
 * @dev NFT contract for tokenizing AI generations.
 */
contract BonzaiCollectible is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;
    BonzaiToken public bonzaiToken;
    uint256 public constant MINT_COST = 999 * 10 ** 18; // 999 BONZAI

    constructor(
        address _tokenAddress
    ) ERC721("BonzAI Generation", "BZAI") Ownable(msg.sender) {
        bonzaiToken = BonzaiToken(_tokenAddress);
    }

    function tokenizeGeneration(
        address recipient,
        string memory tokenURI
    ) public returns (uint256) {
        require(
            bonzaiToken.transferFrom(msg.sender, address(this), MINT_COST),
            "Insufficient BONZAI or allowance"
        );

        uint256 tokenId = _nextTokenId++;
        _mint(recipient, tokenId);
        _setTokenURI(tokenId, tokenURI);

        return tokenId;
    }
}

/**
 * @title BonzaiMarketplace
 * @dev Handles Agent sales and P2P Inference Escrow (USDC/Native).
 */
contract BonzaiMarketplace is ReentrancyGuard, Ownable {
    struct AgentListing {
        uint256 id;
        address seller;
        string metadataURI;
        uint256 price;
        bool active;
    }

    struct InferenceBid {
        address provider;
        address user;
        uint256 amount;
        bool fulfilled;
        bool disputed;
    }

    uint256 public _agentIds;
    uint256 public _escrowIds;

    mapping(uint256 => AgentListing) public agents;
    mapping(uint256 => InferenceBid) public escrows;

    BonzaiToken public bonzaiToken;
    IERC20 public usdcToken; // Assuming USDC for P2P payments

    event AgentListed(uint256 id, address seller, uint256 price);
    event AgentSold(uint256 id, address buyer, address seller, uint256 price);
    event InferenceEscrowCreated(
        uint256 escrowId,
        address user,
        address provider,
        uint256 amount
    );
    event InferenceCompleted(
        uint256 escrowId,
        address provider,
        uint256 amount
    );

    constructor(address _bonzaiToken, address _usdcToken) Ownable(msg.sender) {
        bonzaiToken = BonzaiToken(_bonzaiToken);
        usdcToken = IERC20(_usdcToken);
    }

    // --- Agent Marketplace ---

    function listAgent(string memory metadataURI, uint256 price) external {
        // Requirement: Hold 9999 BONZAI to sell
        require(
            bonzaiToken.balanceOf(msg.sender) >= 9999 * 10 ** 18,
            "Insufficient BONZAI Tier"
        );

        _agentIds++;
        agents[_agentIds] = AgentListing(
            _agentIds,
            msg.sender,
            metadataURI,
            price,
            true
        );
        emit AgentListed(_agentIds, msg.sender, price);
    }

    function buyAgent(uint256 agentId) external nonReentrant {
        AgentListing storage listing = agents[agentId];
        require(listing.active, "Listing not active");
        require(
            bonzaiToken.balanceOf(msg.sender) >= 9999 * 10 ** 18,
            "Insufficient BONZAI Tier"
        );

        // Transfer BONZAI from buyer to seller
        require(
            bonzaiToken.transferFrom(msg.sender, listing.seller, listing.price),
            "Transfer failed"
        );

        emit AgentSold(agentId, msg.sender, listing.seller, listing.price);
    }

    // --- P2P Inference Escrow ---

    function createInferenceEscrow(
        address provider,
        uint256 amount
    ) external nonReentrant returns (uint256) {
        // User accepts a bid, locks USDC into contract
        require(
            usdcToken.transferFrom(msg.sender, address(this), amount),
            "USDC Transfer failed"
        );

        _escrowIds++;
        escrows[_escrowIds] = InferenceBid(
            provider,
            msg.sender,
            amount,
            false,
            false
        );

        emit InferenceEscrowCreated(_escrowIds, msg.sender, provider, amount);
        return _escrowIds;
    }

    function releaseInferenceEscrow(uint256 escrowId) external nonReentrant {
        InferenceBid storage escrow = escrows[escrowId];
        require(msg.sender == escrow.user, "Only user can release");
        require(!escrow.fulfilled, "Already fulfilled");

        escrow.fulfilled = true;
        require(
            usdcToken.transfer(escrow.provider, escrow.amount),
            "USDC Release failed"
        );

        emit InferenceCompleted(escrowId, escrow.provider, escrow.amount);
    }
}
