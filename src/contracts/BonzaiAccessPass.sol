// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title BonzaiAccessPass
 * @notice ERC1155 NFT collection for BonzAI level access
 * @dev Token IDs correspond to levels:
 *      1 = LVL1 (Text Generation)
 *      2 = LVL2 (Audio Generation)
 *      3 = LVL3 (Image Generation)
 *      4 = LVL4 (Video Generation)
 *      5 = LVL5 (Training)
 */
contract BonzaiAccessPass is ERC1155, ERC1155Burnable, ERC1155Supply, Ownable {
    using Strings for uint256;

    string public name = "BonzAI Access Pass";
    string public symbol = "BONZAI-PASS";
    
    // Token IDs
    uint256 public constant LVL1 = 1; // Text Generation
    uint256 public constant LVL2 = 2; // Audio Generation
    uint256 public constant LVL3 = 3; // Image Generation
    uint256 public constant LVL4 = 4; // Video Generation
    uint256 public constant LVL5 = 5; // Game Generation
    uint256 public constant LVL6 = 6; // Training
    
    // Prices in wTAO (9 decimals)
    mapping(uint256 => uint256) public prices;
    
    // Max supply per token
    mapping(uint256 => uint256) public maxSupply;
    
    // Payment token (wTAO)
    address public paymentToken;
    
    // Treasury address
    address public treasury;
    
    // Base URI for metadata
    string private _baseTokenURI;
    
    // Events
    event PassPurchased(address indexed buyer, uint256 indexed tokenId, uint256 amount);
    event PriceUpdated(uint256 indexed tokenId, uint256 newPrice);
    event MaxSupplyUpdated(uint256 indexed tokenId, uint256 newMaxSupply);
    
    constructor(
        address _treasury,
        address _paymentToken,
        string memory baseURI
    ) ERC1155(baseURI) Ownable(msg.sender) {
        treasury = _treasury;
        paymentToken = _paymentToken;
        _baseTokenURI = baseURI;
        
        // Set initial prices (in wTAO, 9 decimals)
        // e.g., 10 wTAO = 10 * 10^9 = 10000000000
        prices[LVL1] = 5 * 10**9;    // 5 wTAO
        prices[LVL2] = 10 * 10**9;   // 10 wTAO
        prices[LVL3] = 25 * 10**9;   // 25 wTAO
        prices[LVL4] = 50 * 10**9;   // 50 wTAO
        prices[LVL5] = 75 * 10**9;   // 75 wTAO
        prices[LVL6] = 100 * 10**9;  // 100 wTAO
        
        // Set max supply (0 = unlimited)
        maxSupply[LVL1] = 10000;
        maxSupply[LVL2] = 5000;
        maxSupply[LVL3] = 2500;
        maxSupply[LVL4] = 1000;
        maxSupply[LVL5] = 500;
        maxSupply[LVL6] = 250;
    }
    
    /**
     * @notice Purchase an access pass
     * @param tokenId The level token ID to purchase
     * @param amount Number of passes to purchase
     */
    function purchase(uint256 tokenId, uint256 amount) external {
        require(tokenId >= LVL1 && tokenId <= LVL6, "Invalid token ID");
        require(amount > 0, "Amount must be > 0");
        
        // Check max supply
        if (maxSupply[tokenId] > 0) {
            require(
                totalSupply(tokenId) + amount <= maxSupply[tokenId],
                "Exceeds max supply"
            );
        }
        
        // Calculate total cost
        uint256 totalCost = prices[tokenId] * amount;
        
        // Transfer payment to treasury
        IERC20(paymentToken).transferFrom(msg.sender, treasury, totalCost);
        
        // Mint the pass
        _mint(msg.sender, tokenId, amount, "");
        
        emit PassPurchased(msg.sender, tokenId, amount);
    }
    
    /**
     * @notice Admin mint function for airdrops/rewards
     */
    function adminMint(
        address to,
        uint256 tokenId,
        uint256 amount
    ) external onlyOwner {
        require(tokenId >= LVL1 && tokenId <= LVL6, "Invalid token ID");
        
        if (maxSupply[tokenId] > 0) {
            require(
                totalSupply(tokenId) + amount <= maxSupply[tokenId],
                "Exceeds max supply"
            );
        }
        
        _mint(to, tokenId, amount, "");
    }
    
    /**
     * @notice Batch admin mint
     */
    function adminMintBatch(
        address to,
        uint256[] calldata tokenIds,
        uint256[] calldata amounts
    ) external onlyOwner {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(
                tokenIds[i] >= LVL1 && tokenIds[i] <= LVL6,
                "Invalid token ID"
            );
            
            if (maxSupply[tokenIds[i]] > 0) {
                require(
                    totalSupply(tokenIds[i]) + amounts[i] <= maxSupply[tokenIds[i]],
                    "Exceeds max supply"
                );
            }
        }
        
        _mintBatch(to, tokenIds, amounts, "");
    }
    
    /**
     * @notice Update price for a token
     */
    function setPrice(uint256 tokenId, uint256 newPrice) external onlyOwner {
        require(tokenId >= LVL1 && tokenId <= LVL6, "Invalid token ID");
        prices[tokenId] = newPrice;
        emit PriceUpdated(tokenId, newPrice);
    }
    
    /**
     * @notice Update max supply for a token
     */
    function setMaxSupply(uint256 tokenId, uint256 newMaxSupply) external onlyOwner {
        require(tokenId >= LVL1 && tokenId <= LVL6, "Invalid token ID");
        require(
            newMaxSupply == 0 || newMaxSupply >= totalSupply(tokenId),
            "New max supply must be >= current supply"
        );
        maxSupply[tokenId] = newMaxSupply;
        emit MaxSupplyUpdated(tokenId, newMaxSupply);
    }
    
    /**
     * @notice Update treasury address
     */
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury");
        treasury = newTreasury;
    }
    
    /**
     * @notice Update payment token
     */
    function setPaymentToken(address newPaymentToken) external onlyOwner {
        require(newPaymentToken != address(0), "Invalid token");
        paymentToken = newPaymentToken;
    }
    
    /**
     * @notice Update base URI
     */
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
    }
    
    /**
     * @notice Get token URI
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        return string(abi.encodePacked(_baseTokenURI, tokenId.toString(), ".json"));
    }
    
    /**
     * @notice Get level name
     */
    function getLevelName(uint256 tokenId) public pure returns (string memory) {
        if (tokenId == LVL1) return "Text Generation";
        if (tokenId == LVL2) return "Audio Generation";
        if (tokenId == LVL3) return "Image Generation";
        if (tokenId == LVL4) return "Video Generation";
        if (tokenId == LVL5) return "Game Generation";
        if (tokenId == LVL6) return "Training";
        return "";
    }
    
    /**
     * @notice Check if user has access to a level
     */
    function hasLevelAccess(address user, uint256 tokenId) external view returns (bool) {
        return balanceOf(user, tokenId) > 0;
    }
    
    // Required overrides
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Supply) {
        super._update(from, to, ids, values);
    }
}

// Minimal ERC20 interface for payment token
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}
