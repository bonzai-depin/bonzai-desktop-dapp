// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title BonzaiLevelNFT
 * @notice ERC-1155 NFT collection for BonzAI level access passes
 * @dev Each token ID (1-6) represents a level. Owning a higher level unlocks all lower levels.
 *      - LVL1 (ID 1): 0.125 ETH
 *      - LVL2 (ID 2): 0.250 ETH
 *      - LVL3 (ID 3): 0.375 ETH
 *      - LVL4 (ID 4): 0.500 ETH
 *      - LVL5 (ID 5): 0.625 ETH
 *      - LVL6 (ID 6): 0.750 ETH
 *      Max supply: 99 per level
 */
contract BonzaiLevelNFT is ERC1155, Ownable {
    using Strings for uint256;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    uint256 public constant MAX_LEVEL = 6;
    uint256 public constant MAX_SUPPLY_PER_LEVEL = 99;
    uint256 public constant PRICE_PER_LEVEL = 0.125 ether;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Base URI for metadata (can be updated if Pinata changes)
    string private _baseURI;

    /// @notice Treasury address receiving mint proceeds
    address public treasury;

    /// @notice Minted supply per level
    mapping(uint256 => uint256) public mintedSupply;

    /// @notice Whether minting is paused
    bool public paused;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event LevelMinted(address indexed minter, uint256 level, uint256 price);
    event BaseURIUpdated(string newURI);
    event TreasuryUpdated(address newTreasury);
    event PausedStateChanged(bool isPaused);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error InvalidLevel();
    error MaxSupplyReached();
    error InsufficientPayment();
    error AlreadyOwnsLevel();
    error MintingPaused();
    error TransferFailed();
    error ZeroAddress();

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @param baseURI_ Initial base URI for metadata (Pinata IPFS gateway)
     * @param treasury_ Address to receive mint proceeds
     */
    constructor(
        string memory baseURI_,
        address treasury_
    ) ERC1155(baseURI_) Ownable(msg.sender) {
        if (treasury_ == address(0)) revert ZeroAddress();
        _baseURI = baseURI_;
        treasury = treasury_;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MINTING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Mint a level NFT
     * @param level The level to mint (1-6)
     * @dev Price = level * 0.125 ETH. Owning a level unlocks all lower levels.
     */
    function mint(uint256 level) external payable {
        if (paused) revert MintingPaused();
        if (level == 0 || level > MAX_LEVEL) revert InvalidLevel();
        if (mintedSupply[level] >= MAX_SUPPLY_PER_LEVEL) revert MaxSupplyReached();
        if (balanceOf(msg.sender, level) > 0) revert AlreadyOwnsLevel();

        uint256 price = getPrice(level);
        if (msg.value < price) revert InsufficientPayment();

        // Mint the NFT
        mintedSupply[level]++;
        _mint(msg.sender, level, 1, "");

        // Transfer proceeds to treasury
        (bool success, ) = treasury.call{value: msg.value}("");
        if (!success) revert TransferFailed();

        emit LevelMinted(msg.sender, level, price);
    }

    /**
     * @notice Get the mint price for a level
     * @param level The level (1-6)
     * @return price The price in wei
     */
    function getPrice(uint256 level) public pure returns (uint256) {
        if (level == 0 || level > MAX_LEVEL) revert InvalidLevel();
        return level * PRICE_PER_LEVEL;
    }

    /**
     * @notice Get remaining supply for a level
     * @param level The level (1-6)
     * @return remaining Number of NFTs still available
     */
    function remainingSupply(uint256 level) external view returns (uint256) {
        if (level == 0 || level > MAX_LEVEL) return 0;
        return MAX_SUPPLY_PER_LEVEL - mintedSupply[level];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LEVEL ACCESS CHECK
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Check if an address has access to a specific level
     * @param account The address to check
     * @param level The level to check access for
     * @return hasAccess True if the account owns this level OR any higher level
     * @dev Owning LVL3 grants access to LVL1, LVL2, and LVL3
     */
    function hasLevelAccess(address account, uint256 level) external view returns (bool) {
        if (level == 0 || level > MAX_LEVEL) return false;

        // Check if user owns this level or any higher level
        for (uint256 i = level; i <= MAX_LEVEL; i++) {
            if (balanceOf(account, i) > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Get the highest level owned by an address
     * @param account The address to check
     * @return highestLevel The highest level owned (0 if none)
     */
    function getHighestLevel(address account) external view returns (uint256) {
        for (uint256 i = MAX_LEVEL; i >= 1; i--) {
            if (balanceOf(account, i) > 0) {
                return i;
            }
        }
        return 0;
    }

    /**
     * @notice Get all levels owned by an address
     * @param account The address to check
     * @return levels Array of booleans indicating ownership per level (index 0 = LVL1)
     */
    function getOwnedLevels(address account) external view returns (bool[6] memory levels) {
        for (uint256 i = 1; i <= MAX_LEVEL; i++) {
            levels[i - 1] = balanceOf(account, i) > 0;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // METADATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get the metadata URI for a token
     * @param tokenId The token ID (level)
     * @return URI string
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        if (tokenId == 0 || tokenId > MAX_LEVEL) revert InvalidLevel();
        return string(abi.encodePacked(_baseURI, tokenId.toString(), ".json"));
    }

    /**
     * @notice Update the base URI (in case Pinata changes)
     * @param newBaseURI The new base URI
     */
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        _baseURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    /**
     * @notice Get the current base URI
     */
    function baseURI() external view returns (string memory) {
        return _baseURI;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Update the treasury address
     * @param newTreasury The new treasury address
     */
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /**
     * @notice Pause or unpause minting
     * @param _paused Whether to pause minting
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedStateChanged(_paused);
    }

    /**
     * @notice Admin mint for giveaways/partnerships
     * @param to Recipient address
     * @param level The level to mint
     */
    function adminMint(address to, uint256 level) external onlyOwner {
        if (level == 0 || level > MAX_LEVEL) revert InvalidLevel();
        if (mintedSupply[level] >= MAX_SUPPLY_PER_LEVEL) revert MaxSupplyReached();

        mintedSupply[level]++;
        _mint(to, level, 1, "");

        emit LevelMinted(to, level, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get supply info for all levels
     * @return minted Array of minted counts per level
     * @return remaining Array of remaining supply per level
     */
    function getSupplyInfo() external view returns (
        uint256[6] memory minted,
        uint256[6] memory remaining
    ) {
        for (uint256 i = 1; i <= MAX_LEVEL; i++) {
            minted[i - 1] = mintedSupply[i];
            remaining[i - 1] = MAX_SUPPLY_PER_LEVEL - mintedSupply[i];
        }
    }
}
