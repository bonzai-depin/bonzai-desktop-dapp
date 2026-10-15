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
 * @notice Receives 7.5% royalty from BonzaiContent secondary sales and distributes
 *         in three-way split:
 *           - 1/3 to BonzAI treasury
 *           - 1/3 to LVL pools, weighted by historical deposit activity per content type
 *           - 1/3 to a creator-pending pool, attributed off-chain by the foundation
 *
 * Why a pending creator pool:
 *   Marketplaces send royalty ETH as a plain transfer (no calldata, no tokenId).
 *   The contract therefore can't auto-route the creator share. Instead, 1/3
 *   accumulates in `creatorPendingPool` and the owner (foundation) calls
 *   `distributeCreatorBatch(creators[], amounts[])` to credit creators based on
 *   off-chain marketplace data. Creators then `claimCreatorRevenue()` to pull
 *   their accrued balance — pull-based, no centralized dispatch.
 *
 * Content-type pool weighting:
 *   The 1/3 pool share is distributed proportionally based on each pool's lifetime
 *   deposits in BonzaiMintPool. Falls back to equal distribution if no deposits.
 *
 * Anyone can call distribute() when balance >= minDistributionAmount.
 * Operates on address(this).balance, not msg.value.
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

    /// @notice Total ETH credited to creators awaiting per-creator attribution
    ///         from the foundation. Sum of (creatorPendingPool, claimable balances)
    ///         is what the contract owes creators in aggregate.
    uint256 public creatorPendingPool;

    /// @notice Per-creator accrued balance (set by distributeCreatorBatch,
    ///         spent by claimCreatorRevenue).
    mapping(address => uint256) public creatorClaimable;

    /// @notice Sum of creatorClaimable values; complements creatorPendingPool.
    uint256 public creatorTotalAttributed;

    /// @notice Failed pool payments retain their original destination and category.
    mapping(address => mapping(uint8 => uint256)) public pendingPoolFees;
    uint256 public totalPendingPoolFees;
    event PoolFeesRetried(address indexed pool, uint8 indexed poolIndex, uint256 amount);


    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event Distributed(
        uint256 creatorAmount,
        uint256 treasuryAmount,
        uint256 poolAmount
    );
    event CreatorAttributed(address indexed creator, uint256 amount);
    event CreatorClaimed(address indexed creator, uint256 amount);

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
     * @notice Distribute the contract's UNDISTRIBUTED ETH balance into the
     *         three-way split. The creator share is held in
     *         `creatorPendingPool` until the foundation attributes it via
     *         `distributeCreatorBatch`.
     * @dev Anyone can call this when (balance - already-attributed creator
     *      balances) >= minDistributionAmount. Uses address(this).balance.
     */
    function distribute() external nonReentrant whenNotPaused {
        // Creator obligations and failed pool payments are already allocated;
        // neither may be split again or recovered by the treasury.
        uint256 reserved = creatorPendingPool + creatorTotalAttributed + totalPendingPoolFees;
        uint256 freeBalance = address(this).balance - reserved;
        require(freeBalance >= minDistributionAmount, "Below minimum distribution amount");

        uint256 creatorShare = freeBalance / 3;
        uint256 treasuryShare = creatorShare;
        uint256 poolShare = freeBalance - creatorShare - treasuryShare;
        address pool = mintPool;

        // Hold creator share in pending pool — actual ETH stays in this
        // contract, accounted for by creatorPendingPool.
        creatorPendingPool += creatorShare;

        // 1/3 to treasury
        (bool s1, ) = treasury.call{value: treasuryShare}("");
        require(s1, "Treasury transfer failed");

        // 1/3 to pools, weighted by historical deposit activity per content type
        if (pool != address(0) && poolShare > 0) {
            uint256[6] memory deposited = IBonzaiMintPoolSplitter(pool).getAllTotalDeposited();
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
                            distributed += poolAmt;
                            try IBonzaiMintPoolSplitter(pool).depositForPool{value: poolAmt}(i) {
                                // Delivered directly.
                            } catch {
                                pendingPoolFees[pool][i] += poolAmt;
                                totalPendingPoolFees += poolAmt;
                                emit PoolDepositFailed(i, poolAmt);
                            }
                        }
                    }
                    unchecked { i++; }
                }
                // Only rounding dust goes to treasury; failed allocations remain reserved.
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
                        distributed += poolAmt;
                        try IBonzaiMintPoolSplitter(pool).depositForPool{value: poolAmt}(i) {
                            // Delivered directly.
                        } catch {
                            pendingPoolFees[pool][i] += poolAmt;
                            totalPendingPoolFees += poolAmt;
                            emit PoolDepositFailed(i, poolAmt);
                        }
                    }
                    unchecked { i++; }
                }
                // Only unallocated rounding dust may go to treasury.
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

        emit Distributed(creatorShare, treasuryShare, poolShare);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CREATOR ATTRIBUTION (pull-based)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Foundation attributes accumulated creator-pool ETH to specific
     *         creators based on off-chain marketplace data.
     * @dev Sum of `amounts` must not exceed the current `creatorPendingPool`.
     *      Each (creator, amount) pair credits the creator's claimable balance.
     */
    function distributeCreatorBatch(
        address[] calldata creators,
        uint256[] calldata amounts
    ) external onlyOwner whenNotPaused {
        require(creators.length == amounts.length, "Length mismatch");
        uint256 total = 0;
        for (uint256 i = 0; i < amounts.length; ) {
            total += amounts[i];
            unchecked { ++i; }
        }
        require(total <= creatorPendingPool, "Exceeds pending pool");

        creatorPendingPool -= total;
        creatorTotalAttributed += total;

        for (uint256 i = 0; i < creators.length; ) {
            address c = creators[i];
            uint256 a = amounts[i];
            require(c != address(0), "Zero address creator");
            if (a > 0) {
                creatorClaimable[c] += a;
                emit CreatorAttributed(c, a);
            }
            unchecked { ++i; }
        }
    }

    /**
     * @notice Creator pulls their accrued royalty share.
     */
    function claimCreatorRevenue() external nonReentrant {
        uint256 amount = creatorClaimable[msg.sender];
        require(amount > 0, "Nothing to claim");
        creatorClaimable[msg.sender] = 0;
        creatorTotalAttributed -= amount;
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "Claim transfer failed");
        emit CreatorClaimed(msg.sender, amount);
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

    /// @notice Anyone may deliver retained fees, without changing their beneficiary.
    function retryPoolFees(address pool, uint8 poolIndex) external nonReentrant {
        uint256 amount = pendingPoolFees[pool][poolIndex];
        require(amount > 0, "No pending pool fees");
        pendingPoolFees[pool][poolIndex] = 0;
        totalPendingPoolFees -= amount;
        IBonzaiMintPoolSplitter(pool).depositForPool{value: amount}(poolIndex);
        emit PoolFeesRetried(pool, poolIndex, amount);
    }

    /// @notice Recover surplus ETH only; reserved pool fees remain payable to their original pool.
    function withdrawETH() external onlyOwner nonReentrant {
        uint256 reserved = creatorPendingPool + creatorTotalAttributed + totalPendingPoolFees;
        uint256 balance = address(this).balance;
        require(balance > reserved, "No surplus ETH (creator funds reserved)");
        uint256 surplus = balance - reserved;
        (bool sent, ) = owner().call{value: surplus}("");
        require(sent, "ETH transfer failed");
    }

    /// @notice Allow contract to receive ETH (royalties from marketplaces)
    receive() external payable {}
}
