// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title IBonzaiMintPoolSplitter
 * @notice Interface for depositing into content-type pools and querying activity
 */
interface IBonzaiMintPoolSplitter {
    function depositForPool(uint8 poolIndex) external payable;
    function getAllTotalDeposited() external view returns (uint256[6] memory);
}

/**
 * @title BonzaiRoyaltySplitter
 * @notice Receives 7.5% royalty from BonzaiContent secondary sales and distributes:
 *           - 2/3 to BonzAI treasury
 *           - 1/3 to LVL pools, weighted by historical deposit activity per content type
 *
 * Content-type weighting:
 *   The 1/3 pool share is distributed proportionally based on each pool's lifetime
 *   deposits in BonzaiMintPool (from primary mint fees). If image mints generated 60%
 *   of all pool deposits, the image pool gets 60% of the secondary royalty pool share.
 *   Falls back to equal distribution if no deposits exist yet.
 *
 * Why no per-token routing:
 *   Marketplaces send royalty ETH as a plain transfer (no calldata). The contract
 *   has no on-chain proof of WHICH tokenId was sold. Any function accepting a
 *   tokenId parameter could be called with an arbitrary token, allowing the caller
 *   to misdirect the creator's share. Weighting by historical activity is the closest
 *   correct approximation without per-sale attribution.
 *
 * Minimum distribution threshold:
 *   distribute() requires address(this).balance >= minDistributionAmount to prevent
 *   gas-wasteful tiny distributions from bots or griefing. Owner-configurable.
 *
 * Operates on address(this).balance, not msg.value.
 * Anyone can call distribute() when the threshold is met.
 */
contract BonzaiRoyaltySplitter is Ownable, ReentrancyGuard, Pausable {
    /// @notice BonzAI treasury address
    address public treasury;

    /// @notice BonzaiMintPool contract for deposits and activity queries
    address public mintPool;

    /// @notice Minimum balance required to trigger distribution
    uint256 public minDistributionAmount = 0.01 ether;

    /// @notice Number of LVL pools
    uint256 private constant NUM_POOLS = 6;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event Distributed(
        uint256 treasuryAmount,
        uint256 poolAmount
    );

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event MintPoolUpdated(address indexed oldPool, address indexed newPool);
    event MinDistributionAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event PoolDepositFailed(uint8 poolIndex, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @param _treasury BonzAI treasury address
     * @param _mintPool BonzaiMintPool contract address
     */
    constructor(
        address _treasury,
        address _mintPool
    ) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        require(_mintPool != address(0), "Invalid mint pool");
        treasury = _treasury;
        mintPool = _mintPool;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DISTRIBUTE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Distribute the contract's entire ETH balance.
     *         Split: 2/3 to treasury, 1/3 to LVL pools weighted by content-type activity.
     * @dev Anyone can call this when balance >= minDistributionAmount.
     *      Uses address(this).balance, not msg.value.
     */
    function distribute() external nonReentrant whenNotPaused {
        uint256 amount = address(this).balance;
        require(amount >= minDistributionAmount, "Below minimum distribution amount");

        uint256 treasuryShare = (amount * 2) / 3;
        uint256 poolShare = amount - treasuryShare;

        // 2/3 to treasury
        (bool s1, ) = treasury.call{value: treasuryShare}("");
        require(s1, "Treasury transfer failed");

        // 1/3 to pools, weighted by historical deposit activity per content type
        if (mintPool != address(0) && poolShare > 0) {
            uint256[6] memory deposited = IBonzaiMintPoolSplitter(mintPool).getAllTotalDeposited();
            uint256 totalAllPools = 0;
            for (uint8 i = 0; i < NUM_POOLS; ) {
                totalAllPools += deposited[i];
                unchecked { i++; }
            }

            if (totalAllPools > 0) {
                // Weighted distribution based on historical deposit activity
                uint256 distributed = 0;
                for (uint8 i = 0; i < NUM_POOLS; ) {
                    if (deposited[i] > 0) {
                        uint256 poolAmt = (poolShare * deposited[i]) / totalAllPools;
                        if (poolAmt > 0) {
                            try IBonzaiMintPoolSplitter(mintPool).depositForPool{value: poolAmt}(i) {
                                distributed += poolAmt;
                            } catch {
                                emit PoolDepositFailed(i, poolAmt);
                            }
                        }
                    }
                    unchecked { i++; }
                }
                // Undistributed amount (rounding dust + any failed deposits) goes to treasury
                uint256 remainder = poolShare - distributed;
                if (remainder > 0) {
                    (bool s2, ) = treasury.call{value: remainder}("");
                    require(s2, "Remainder transfer failed");
                }
            } else {
                // No deposits yet — equal distribution as fallback
                uint256 distributed = 0;
                uint256 perPool = poolShare / NUM_POOLS;
                for (uint8 i = 0; i < NUM_POOLS; ) {
                    uint256 poolAmt = (i == NUM_POOLS - 1)
                        ? poolShare - (perPool * (NUM_POOLS - 1))
                        : perPool;
                    if (poolAmt > 0) {
                        try IBonzaiMintPoolSplitter(mintPool).depositForPool{value: poolAmt}(i) {
                            distributed += poolAmt;
                        } catch {
                            emit PoolDepositFailed(i, poolAmt);
                        }
                    }
                    unchecked { i++; }
                }
                // Any failed deposits go to treasury
                uint256 remainder = poolShare - distributed;
                if (remainder > 0) {
                    (bool s2, ) = treasury.call{value: remainder}("");
                    require(s2, "Remainder transfer failed");
                }
            }
        } else if (poolShare > 0) {
            // Fallback: send pool share to treasury if pool not configured
            (bool s2, ) = treasury.call{value: poolShare}("");
            require(s2, "Fallback pool transfer failed");
        }

        emit Distributed(treasuryShare, poolShare);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }

    function setMintPool(address _mintPool) external onlyOwner {
        require(_mintPool != address(0), "Invalid mint pool");
        address old = mintPool;
        mintPool = _mintPool;
        emit MintPoolUpdated(old, _mintPool);
    }

    function setMinDistributionAmount(uint256 _amount) external onlyOwner {
        uint256 old = minDistributionAmount;
        minDistributionAmount = _amount;
        emit MinDistributionAmountUpdated(old, _amount);
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

    /**
     * @notice Recover any stuck ETH (e.g. if treasury/pool reverts)
     */
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        (bool sent, ) = owner().call{value: balance}("");
        require(sent, "ETH transfer failed");
    }

    /// @notice Allow contract to receive ETH (royalties from marketplaces)
    receive() external payable {}
}
