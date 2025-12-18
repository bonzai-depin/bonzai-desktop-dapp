// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BonzaiAccessPassStaking
 * @notice Staking contract for BonzAI Access Pass NFTs
 * @dev Users must stake their NFT to activate the corresponding level
 */
contract BonzaiAccessPassStaking is ERC1155Holder, Ownable, ReentrancyGuard {
    
    // Access Pass NFT contract
    IERC1155 public accessPassNFT;
    
    // Staking info per user per token
    struct StakeInfo {
        uint256 amount;
        uint256 stakedAt;
    }
    
    // user => tokenId => StakeInfo
    mapping(address => mapping(uint256 => StakeInfo)) public stakes;
    
    // Total staked per token
    mapping(uint256 => uint256) public totalStaked;
    
    // Minimum stake duration (optional, can be 0)
    uint256 public minStakeDuration;
    
    // Events
    event Staked(address indexed user, uint256 indexed tokenId, uint256 amount);
    event Unstaked(address indexed user, uint256 indexed tokenId, uint256 amount);
    event AccessPassNFTUpdated(address indexed newAddress);
    event MinStakeDurationUpdated(uint256 newDuration);
    
    constructor(address _accessPassNFT) Ownable(msg.sender) {
        require(_accessPassNFT != address(0), "Invalid NFT address");
        accessPassNFT = IERC1155(_accessPassNFT);
        minStakeDuration = 0; // No minimum by default
    }
    
    /**
     * @notice Stake access pass NFT to activate level
     * @param tokenId The level token ID to stake
     * @param amount Number of tokens to stake
     */
    function stake(uint256 tokenId, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(tokenId >= 1 && tokenId <= 6, "Invalid token ID");
        
        // Transfer NFT to this contract
        accessPassNFT.safeTransferFrom(msg.sender, address(this), tokenId, amount, "");
        
        // Update stake info
        StakeInfo storage info = stakes[msg.sender][tokenId];
        info.amount += amount;
        info.stakedAt = block.timestamp;
        
        totalStaked[tokenId] += amount;
        
        emit Staked(msg.sender, tokenId, amount);
    }
    
    /**
     * @notice Unstake access pass NFT
     * @param tokenId The level token ID to unstake
     * @param amount Number of tokens to unstake
     */
    function unstake(uint256 tokenId, uint256 amount) external nonReentrant {
        StakeInfo storage info = stakes[msg.sender][tokenId];
        
        require(info.amount >= amount, "Insufficient staked amount");
        require(amount > 0, "Amount must be > 0");
        
        // Check minimum stake duration
        if (minStakeDuration > 0) {
            require(
                block.timestamp >= info.stakedAt + minStakeDuration,
                "Minimum stake duration not met"
            );
        }
        
        // Update stake info
        info.amount -= amount;
        totalStaked[tokenId] -= amount;
        
        // Transfer NFT back to user
        accessPassNFT.safeTransferFrom(address(this), msg.sender, tokenId, amount, "");
        
        emit Unstaked(msg.sender, tokenId, amount);
    }
    
    /**
     * @notice Check if user has staked a specific token
     * @param user Address to check
     * @param tokenId Token ID to check
     * @return bool Whether the user has any staked
     */
    function isStaked(address user, uint256 tokenId) external view returns (bool) {
        return stakes[user][tokenId].amount > 0;
    }
    
    /**
     * @notice Get staked balance for a user and token
     * @param user Address to check
     * @param tokenId Token ID to check
     * @return uint256 Staked amount
     */
    function stakedBalance(address user, uint256 tokenId) external view returns (uint256) {
        return stakes[user][tokenId].amount;
    }
    
    /**
     * @notice Get stake timestamp for a user and token
     * @param user Address to check
     * @param tokenId Token ID to check
     * @return uint256 Timestamp when staked
     */
    function stakedAt(address user, uint256 tokenId) external view returns (uint256) {
        return stakes[user][tokenId].stakedAt;
    }
    
    /**
     * @notice Get all staked token IDs for a user
     * @param user Address to check
     * @return uint256[] Array of staked token IDs
     */
    function getStakedTokens(address user) external view returns (uint256[] memory) {
        uint256[] memory tempTokens = new uint256[](6);
        uint256 count = 0;
        
        for (uint256 i = 1; i <= 6; i++) {
            if (stakes[user][i].amount > 0) {
                tempTokens[count] = i;
                count++;
            }
        }
        
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = tempTokens[i];
        }
        
        return result;
    }
    
    /**
     * @notice Get complete stake info for a user
     * @param user Address to check
     * @return tokenIds Array of staked token IDs
     * @return amounts Array of staked amounts
     * @return timestamps Array of stake timestamps
     */
    function getUserStakes(address user) external view returns (
        uint256[] memory tokenIds,
        uint256[] memory amounts,
        uint256[] memory timestamps
    ) {
        uint256 count = 0;
        
        // Count staked tokens
        for (uint256 i = 1; i <= 6; i++) {
            if (stakes[user][i].amount > 0) {
                count++;
            }
        }
        
        tokenIds = new uint256[](count);
        amounts = new uint256[](count);
        timestamps = new uint256[](count);
        
        uint256 index = 0;
        for (uint256 i = 1; i <= 6; i++) {
            if (stakes[user][i].amount > 0) {
                tokenIds[index] = i;
                amounts[index] = stakes[user][i].amount;
                timestamps[index] = stakes[user][i].stakedAt;
                index++;
            }
        }
    }
    
    /**
     * @notice Check if user has full level access (staked NFT)
     * @param user Address to check
     * @param tokenId Level token ID to check
     * @return bool Whether user has active level access
     */
    function hasLevelAccess(address user, uint256 tokenId) external view returns (bool) {
        return stakes[user][tokenId].amount > 0;
    }
    
    /**
     * @notice Admin function to update NFT contract address
     */
    function setAccessPassNFT(address newAddress) external onlyOwner {
        require(newAddress != address(0), "Invalid address");
        accessPassNFT = IERC1155(newAddress);
        emit AccessPassNFTUpdated(newAddress);
    }
    
    /**
     * @notice Admin function to update minimum stake duration
     */
    function setMinStakeDuration(uint256 newDuration) external onlyOwner {
        minStakeDuration = newDuration;
        emit MinStakeDurationUpdated(newDuration);
    }
    
    /**
     * @notice Emergency withdraw for admin (only if contract is broken)
     */
    function emergencyWithdraw(
        address to,
        uint256 tokenId,
        uint256 amount
    ) external onlyOwner {
        accessPassNFT.safeTransferFrom(address(this), to, tokenId, amount, "");
    }
}
