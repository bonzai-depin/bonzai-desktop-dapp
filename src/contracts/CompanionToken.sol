// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title CompanionToken
 * @notice Burnable ERC-20 token for AI companions on Base with Uniswap V4 liquidity
 * @dev Simple token with metadata linking to companion NFT and agent wallet
 *
 * Features:
 * - Fixed 1 billion total supply (minted to deployer/factory)
 * - Burnable by any holder (deflationary)
 * - No trading tax or special transfer logic
 * - Stores companion's profile image URI for token lists
 * - Links to companion's agent wallet address
 * - Tracks NFT token ID for on-chain verification
 * - LP tokens are burned (unruggable liquidity)
 */
contract CompanionToken is ERC20, ERC20Burnable {
    /// @notice IPFS URI of the companion's profile image
    string public imageURI;

    /// @notice Companion's agent wallet address (for metadata/verification)
    address public immutable agentWallet;

    /// @notice NFT token ID on the companion contract (0 if not minted)
    uint256 public immutable companionId;

    /// @notice Factory that deployed this token
    address public immutable factory;

    /// @notice Deployment timestamp
    uint256 public immutable deployedAt;

    /**
     * @notice Deploy a new companion token
     * @param name Token name (companion's full name, e.g., "Aurore Delacroix")
     * @param symbol Token symbol (companion's first name uppercase, e.g., "AURORE")
     * @param totalSupply Total token supply (typically 1 billion * 10^18)
     * @param recipient Address to receive all tokens (factory for liquidity)
     * @param _imageURI IPFS URI of companion's profile image
     * @param _agentWallet Agent wallet address of the companion
     * @param _companionId NFT token ID of the companion (0 if not minted as NFT)
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        address recipient,
        string memory _imageURI,
        address _agentWallet,
        uint256 _companionId
    ) ERC20(name, symbol) {
        require(recipient != address(0), "Invalid recipient");
        require(_agentWallet != address(0), "Invalid agent wallet address");

        imageURI = _imageURI;
        agentWallet = _agentWallet;
        companionId = _companionId;
        factory = msg.sender;
        deployedAt = block.timestamp;

        _mint(recipient, totalSupply);
    }

    /**
     * @notice Get token metadata for token list registration
     * @return name_ Token name
     * @return symbol_ Token symbol
     * @return decimals_ Token decimals (18)
     * @return image_ IPFS image URI
     * @return agentWallet_ Agent wallet address
     * @return companionId_ NFT token ID
     */
    function getTokenInfo()
        external
        view
        returns (
            string memory name_,
            string memory symbol_,
            uint8 decimals_,
            string memory image_,
            address agentWallet_,
            uint256 companionId_
        )
    {
        return (name(), symbol(), decimals(), imageURI, agentWallet, companionId);
    }
}
