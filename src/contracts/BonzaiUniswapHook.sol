// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IPoolManager (Uniswap V4)
 * @notice Minimal interface for PoolManager interactions
 */
interface IPoolManager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }

    function take(address currency, address to, uint256 amount) external;
    function settle() external payable returns (uint256);
}

/**
 * @title IBonzaiMintPool
 */
interface IBonzaiMintPool {
    function depositForPool(uint8 poolIndex) external payable;
}

/**
 * @title IERC721Light
 * @notice Minimal IERC721 interface used to look up the live NFT owner.
 */
interface IERC721Light {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @title IBonzaiCompanionsAgent
 * @notice Reads live agent wallet for a companion NFT.
 */
interface IBonzaiCompanionsAgent {
    function getAgentWallet(uint256 agentId) external view returns (address);
}

/**
 * @title BonzaiUniswapHook
 * @notice Uniswap V4 afterSwap hook that captures 1% of swap output and splits
 *         it based on pool type: COMPANION (33/33/34 treasury/owner/wallet) or
 *         FINETUNE (80/10/10 beneficiary/treasury/MintPool).
 *
 * @dev Deployed via CREATE2 so the contract address has the correct permission
 *      bits (afterSwap + afterSwapReturnDelta) in its final 14 address bits.
 *
 * Hook permissions: afterSwap (bit 7) + afterSwapReturnDelta (bit 4)
 *   → flags = 0x0090 in the last 14 bits of the address.
 *
 * Fee model: Fees accumulate in the contract and are claimed later via
 *   permissionless claim functions. This avoids external calls inside the
 *   afterSwap callback, keeping gas costs low and predictable.
 *
 * Pool fee = 0: No LP fee is charged. The hook takes 1% of swap output via
 *   afterSwapReturnDelta, ensuring 100% of fee revenue flows through the split.
 */
contract BonzaiUniswapHook is Ownable, ReentrancyGuard {
    // ═══════════════════════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════════════════════

    struct PoolConfig {
        // For COMPANION pool type: beneficiary and companionOwner are read
        // LIVE from companionNFT via companionTokenId, so this struct only
        // stores the NFT contract + tokenId. The legacy `beneficiary` /
        // `companionOwner` fields are kept for FineTune compatibility.
        address beneficiary;        // FineTune: creator. Companion: cached agent wallet (live read takes priority)
        address companionOwner;     // FineTune: zero. Companion: cached owner (live read takes priority)
        address companionNFT;       // BonzaiCompanions address (used for live ownerOf lookup)
        uint256 companionTokenId;   // 0 for FineTune, the NFT id for COMPANION
        uint8 poolType;             // 0 = COMPANION, 1 = FINETUNE
        uint8 mintPoolIndex;        // MintPool index (5 for training/LVL6; unused for COMPANION)
        bool active;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    uint256 public constant FEE_BPS = 100;            // 1% total hook fee
    uint256 public constant BPS_DENOMINATOR = 10000;

    // Companion pool split: 40 wallet / 40 owner / 10 treasury / 10 MintPool
    // The MintPool slice is spread equally across all 6 content-type buckets.
    uint256 public constant COMPANION_WALLET_BPS = 4000;
    uint256 public constant COMPANION_OWNER_BPS = 4000;
    uint256 public constant COMPANION_TREASURY_BPS = 1000;
    uint256 public constant COMPANION_POOL_BPS = 1000;

    // FineTune pool split: 80 beneficiary / 10 treasury / 10 MintPool
    // MintPool slice spread equally across all 6 content-type buckets.
    uint256 public constant FINETUNE_BENEFICIARY_BPS = 8000;
    uint256 public constant FINETUNE_TREASURY_BPS = 1000;
    uint256 public constant FINETUNE_POOL_BPS = 1000;

    /// @notice Number of MintPool content-type buckets — pool slices are
    ///         distributed equally across all of these.
    uint8 public constant NUM_POOLS = 6;

    uint8 public constant POOL_TYPE_COMPANION = 0;
    uint8 public constant POOL_TYPE_FINETUNE = 1;

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Uniswap V4 PoolManager
    IPoolManager public immutable poolManager;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Treasury address (receives 10% of fees)
    address public treasury;

    /// @notice BonzaiMintPool contract (receives 10% of fees)
    IBonzaiMintPool public mintPool;

    /// @notice Per-pool configuration (poolId hash → config)
    mapping(bytes32 => PoolConfig) public poolConfigs;

    /// @notice Unclaimed fees for each beneficiary
    mapping(address => uint256) public unclaimedBeneficiary;

    /// @notice Running total of all unclaimed beneficiary fees (tracks the sum
    ///         of the unclaimedBeneficiary mapping so withdrawSurplus can account
    ///         for it without iterating the mapping)
    uint256 public totalUnclaimedBeneficiary;

    /// @notice Unclaimed treasury fees
    uint256 public unclaimedTreasury;

    /// @notice Unclaimed MintPool fees per pool index
    mapping(uint8 => uint256) public unclaimedPool;

    /// @notice Authorized factory contracts that can register pools
    mapping(address => bool) public authorizedFactories;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event PoolRegistered(bytes32 indexed poolId, address indexed beneficiary, uint8 poolType, uint8 mintPoolIndex);
    event PoolDeregistered(bytes32 indexed poolId);
    /// @notice Generic fee-captured event covering both pool types.
    ///         For COMPANION: walletShare = companion agent wallet,
    ///                       ownerShare  = NFT owner,
    ///                       treasuryShare,
    ///                       poolShare    = MintPool slice (spread across 6 buckets).
    ///         For FINETUNE:  walletShare = creator (beneficiary),
    ///                       ownerShare  = 0,
    ///                       treasuryShare,
    ///                       poolShare    = MintPool slice.
    event FeeCaptured(
        bytes32 indexed poolId,
        uint8 poolType,
        uint256 totalFee,
        uint256 walletShare,
        uint256 ownerShare,
        uint256 treasuryShare,
        uint256 poolShare
    );
    event BeneficiaryFeesClaimed(address indexed beneficiary, uint256 amount);
    event TreasuryFeesClaimed(address indexed treasury, uint256 amount);
    event PoolFeesClaimed(uint8 indexed mintPoolIndex, uint256 amount);
    event FactoryAuthorized(address indexed factory, bool authorized);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event MintPoolUpdated(address indexed oldPool, address indexed newPool);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @param _poolManager Uniswap V4 PoolManager address on Base
     * @param _treasury Treasury address for 10% fee share
     * @param _mintPool BonzaiMintPool address for 10% fee share
     * @param _initialOwner Owner address (needed for CREATE2 where msg.sender is the deployer contract)
     */
    constructor(
        address _poolManager,
        address _treasury,
        address _mintPool,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(_poolManager != address(0), "Invalid PoolManager");
        require(_treasury != address(0), "Invalid treasury");
        require(_mintPool != address(0), "Invalid MintPool");
        require(_initialOwner != address(0), "Invalid owner");

        poolManager = IPoolManager(_poolManager);
        treasury = _treasury;
        mintPool = IBonzaiMintPool(_mintPool);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HOOK CALLBACKS (called by PoolManager)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Returns the hook's permission flags.
     * @dev afterSwap (bit 7 = 0x80) + afterSwapReturnDelta (bit 4 = 0x10) = 0x0090
     *      The contract address must have these bits set in its last 14 bits.
     */
    function getHookPermissions() public pure returns (uint16) {
        return 0x0090; // afterSwap + afterSwapReturnDelta
    }

    /**
     * @notice Called by PoolManager after every swap on a registered pool.
     * @dev Captures 1% of the positive swap output and splits 80/10/10.
     *      Returns a negative delta to reduce the swapper's output by the fee amount.
     *      Unregistered pools pass through with no fee.
     *
     * @param sender The address that initiated the swap (not used)
     * @param key The pool key identifying the pool
     * @param params The swap parameters
     * @param delta The balance delta from the swap (amount0, amount1)
     * @param hookData Arbitrary data passed through (not used)
     * @return selector The function selector (for V4 hook validation)
     * @return hookDelta The fee amount to deduct from swapper output (negative)
     */
    function afterSwap(
        address sender,
        IPoolManager.PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        int256 delta,
        bytes calldata hookData
    ) external returns (bytes4 selector, int128 hookDelta) {
        require(msg.sender == address(poolManager), "Only PoolManager");

        // Compute poolId hash from PoolKey
        bytes32 poolId = _computePoolId(key);

        PoolConfig storage config = poolConfigs[poolId];

        // Pass through if pool not registered or inactive
        if (!config.active) {
            return (this.afterSwap.selector, 0);
        }

        // Determine output amount (positive side of the delta)
        // For exact-input swaps: delta is positive for the output token
        // zeroForOne=true: user sends token0, receives token1 → delta is output amount for token1
        // zeroForOne=false: user sends token1, receives token0 → delta is output amount for token0
        //
        // The `delta` parameter represents the amount of output tokens.
        // If negative, it means the pool owes the user tokens (standard output).
        int256 outputAmount;
        if (delta < 0) {
            outputAmount = -delta; // Convert to positive
        } else {
            // No positive output to take fees from
            return (this.afterSwap.selector, 0);
        }

        // Determine output currency
        address outputCurrency = params.zeroForOne ? key.currency1 : key.currency0;

        // Only capture fees on native ETH output — ERC-20 fee distribution not supported.
        // Claim functions use .call{value:}("") which only works for ETH. Capturing
        // ERC-20 fees would lock tokens permanently. This means fees are only taken on
        // sells (companion/finetune token → ETH), not on buys (ETH → token).
        if (outputCurrency != address(0)) {
            return (this.afterSwap.selector, 0);
        }

        // Calculate 1% fee
        uint256 feeAmount = (uint256(outputAmount) * FEE_BPS) / BPS_DENOMINATOR;
        if (feeAmount == 0) {
            return (this.afterSwap.selector, 0);
        }

        // Take fee from PoolManager
        poolManager.take(outputCurrency, address(this), feeAmount);

        // Split based on pool type
        if (config.poolType == POOL_TYPE_COMPANION) {
            // COMPANION: 40 wallet / 40 owner / 10 treasury / 10 MintPool
            //  (MintPool slice spread equally across the 6 buckets)
            //
            // Beneficiary + owner are read LIVE from the NFT contract:
            //   - owner    = companionNFT.ownerOf(tokenId)
            //   - wallet   = BonzaiCompanions.getAgentWallet(tokenId)
            // Selling the NFT on a marketplace transparently redirects future
            // hook fees to the new owner — no manual update needed.
            uint256 walletShare = (feeAmount * COMPANION_WALLET_BPS) / BPS_DENOMINATOR;
            uint256 ownerShare = (feeAmount * COMPANION_OWNER_BPS) / BPS_DENOMINATOR;
            uint256 treasuryShare = (feeAmount * COMPANION_TREASURY_BPS) / BPS_DENOMINATOR;
            uint256 poolShare = feeAmount - walletShare - ownerShare - treasuryShare;

            address liveOwner = treasury;
            try IERC721Light(config.companionNFT).ownerOf(config.companionTokenId) returns (address o) {
                if (o != address(0)) liveOwner = o;
            } catch { /* fall back to treasury */ }

            address liveWallet = treasury;
            try IBonzaiCompanionsAgent(config.companionNFT).getAgentWallet(config.companionTokenId) returns (address w) {
                if (w != address(0)) liveWallet = w;
            } catch { /* fall back to treasury */ }

            unclaimedBeneficiary[liveWallet] += walletShare;
            totalUnclaimedBeneficiary += walletShare;
            unclaimedBeneficiary[liveOwner] += ownerShare;
            totalUnclaimedBeneficiary += ownerShare;
            unclaimedTreasury += treasuryShare;
            _spreadAcrossPools(poolShare);

            emit FeeCaptured(poolId, POOL_TYPE_COMPANION, feeAmount, walletShare, ownerShare, treasuryShare, poolShare);
        } else {
            // FINETUNE: 80 beneficiary / 10 treasury / 10 MintPool
            //  (MintPool slice spread equally across the 6 buckets)
            uint256 beneficiaryShare = (feeAmount * FINETUNE_BENEFICIARY_BPS) / BPS_DENOMINATOR;
            uint256 treasuryShare = (feeAmount * FINETUNE_TREASURY_BPS) / BPS_DENOMINATOR;
            uint256 poolShare = feeAmount - beneficiaryShare - treasuryShare;

            unclaimedBeneficiary[config.beneficiary] += beneficiaryShare;
            totalUnclaimedBeneficiary += beneficiaryShare;
            unclaimedTreasury += treasuryShare;
            _spreadAcrossPools(poolShare);

            emit FeeCaptured(poolId, POOL_TYPE_FINETUNE, feeAmount, beneficiaryShare, 0, treasuryShare, poolShare);
        }

        // Return negative delta to reduce swapper's output
        return (this.afterSwap.selector, -int128(int256(feeAmount)));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // POOL REGISTRATION (authorized factories only)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Register a pool with the hook for fee capture.
     * @dev Only callable by authorized factory contracts.
     *
     *      For COMPANION pools, fees route to the LIVE NFT owner + LIVE
     *      agent wallet at the moment of every swap (read via
     *      companionNFT.ownerOf and BonzaiCompanions.getAgentWallet).
     *      Selling the NFT on a marketplace transparently redirects future
     *      hook revenue to the new owner — no manual update needed.
     *
     * @param poolId Pool ID hash (keccak256 of PoolKey)
     * @param beneficiary Cached agent wallet (FineTune: creator; Companion: legacy fallback)
     * @param companionNFT_ Address of BonzaiCompanions for live lookups (COMPANION only)
     * @param companionTokenId NFT id (COMPANION only; 0 for FINETUNE)
     * @param poolType 0 = COMPANION, 1 = FINETUNE
     * @param mintPoolIndex MintPool index (FineTune only; companion pool slice spreads across all 6)
     */
    function registerPool(
        bytes32 poolId,
        address beneficiary,
        address companionNFT_,
        uint256 companionTokenId,
        uint8 poolType,
        uint8 mintPoolIndex
    ) external {
        require(authorizedFactories[msg.sender], "Not authorized factory");
        require(beneficiary != address(0), "Invalid beneficiary");
        require(!poolConfigs[poolId].active, "Pool already registered");
        if (poolType == POOL_TYPE_COMPANION) {
            require(companionNFT_ != address(0), "Companion pool requires NFT contract");
            require(companionTokenId != 0, "Companion pool requires NFT id");
        } else if (poolType == POOL_TYPE_FINETUNE) {
            require(mintPoolIndex < 6, "Invalid mint pool index");
        }

        poolConfigs[poolId] = PoolConfig({
            beneficiary: beneficiary,
            companionOwner: address(0), // companion owner read live via companionNFT.ownerOf
            companionNFT: companionNFT_,
            companionTokenId: companionTokenId,
            poolType: poolType,
            mintPoolIndex: mintPoolIndex,
            active: true
        });

        emit PoolRegistered(poolId, beneficiary, poolType, mintPoolIndex);
    }

    /**
     * @notice Deregister a pool, stopping fee capture on future swaps.
     * @dev Owner-only. Already-accumulated unclaimed fees remain claimable
     *      by the beneficiary — this only prevents new fee accrual.
     *
     * @param poolId Pool ID hash to deregister
     */
    function deregisterPool(bytes32 poolId) external onlyOwner {
        require(poolConfigs[poolId].active, "Pool not active");

        poolConfigs[poolId].active = false;

        emit PoolDeregistered(poolId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CLAIM FUNCTIONS (permissionless triggers)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Claim accumulated beneficiary fees.
     * @dev Sends accumulated ETH/tokens to msg.sender. Only works if msg.sender
     *      has unclaimed fees (i.e., is a registered beneficiary).
     */
    function claimBeneficiaryFees() external nonReentrant {
        uint256 amount = unclaimedBeneficiary[msg.sender];
        require(amount > 0, "No fees to claim");

        unclaimedBeneficiary[msg.sender] = 0;
        totalUnclaimedBeneficiary -= amount;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit BeneficiaryFeesClaimed(msg.sender, amount);
    }

    /**
     * @notice Claim accumulated treasury fees.
     * @dev Permissionless — anyone can trigger this to send fees to treasury.
     */
    function claimTreasuryFees() external nonReentrant {
        uint256 amount = unclaimedTreasury;
        require(amount > 0, "No treasury fees to claim");

        unclaimedTreasury = 0;

        (bool success, ) = treasury.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit TreasuryFeesClaimed(treasury, amount);
    }

    /**
     * @notice Claim accumulated MintPool fees for a specific pool index.
     * @dev Permissionless — calls BonzaiMintPool.depositForPool() with the
     *      accumulated ETH for the given pool index.
     *
     * @param mintPoolIndex Pool index (0-5) matching BonzaiMintPool
     */
    function claimPoolFees(uint8 mintPoolIndex) external nonReentrant {
        require(mintPoolIndex < 6, "Invalid pool index");
        uint256 amount = unclaimedPool[mintPoolIndex];
        require(amount > 0, "No pool fees to claim");

        // Effects-before-interactions: zero the bucket so a re-entry can't
        // double-spend, but RE-CREDIT it on revert so the fees aren't lost
        // permanently when the MintPool refuses the deposit (e.g., hook not
        // wired as feeHook on MintPool, or MintPool paused).
        unclaimedPool[mintPoolIndex] = 0;

        try mintPool.depositForPool{value: amount}(mintPoolIndex) {
            emit PoolFeesClaimed(mintPoolIndex, amount);
        } catch {
            // Restore the bucket — the fees stay claimable once MintPool
            // is correctly wired or unpaused.
            unclaimedPool[mintPoolIndex] = amount;
            emit PoolFeesClaimFailed(mintPoolIndex, amount);
        }
    }

    event PoolFeesClaimFailed(uint8 indexed mintPoolIndex, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Authorize or deauthorize a factory contract for pool registration.
     * @param factory Factory contract address
     * @param authorized Whether to authorize (true) or deauthorize (false)
     */
    function authorizeFactory(address factory, bool authorized) external onlyOwner {
        require(factory != address(0), "Invalid factory address");
        authorizedFactories[factory] = authorized;
        emit FactoryAuthorized(factory, authorized);
    }

    /**
     * @notice Update the treasury address.
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }

    /**
     * @notice Update the BonzaiMintPool address.
     * @param _mintPool New MintPool address
     */
    function setMintPool(address _mintPool) external onlyOwner {
        require(_mintPool != address(0), "Invalid MintPool");
        address old = address(mintPool);
        mintPool = IBonzaiMintPool(_mintPool);
        emit MintPoolUpdated(old, _mintPool);
    }

    /// @notice Admin recovery for stuck beneficiary fees.
    ///         INTENDED USE: a beneficiary address belongs to a smart
    ///         contract that started reverting on receive() (e.g., paused
    ///         multisig), or the beneficiary lost their key. Without this
    ///         function the fees would be unrecoverable.
    ///         RISK: a compromised owner can drain any beneficiary. Treat
    ///         this contract's owner as a privileged role and protect with
    ///         a multisig + timelock.
    function adminRecoverBeneficiaryFees(address beneficiary, address recipient) external onlyOwner {
        require(beneficiary != address(0) && recipient != address(0), "Zero address");
        uint256 amount = unclaimedBeneficiary[beneficiary];
        require(amount > 0, "Nothing to recover");

        unclaimedBeneficiary[beneficiary] = 0;
        totalUnclaimedBeneficiary -= amount;

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");

        emit BeneficiaryFeesRecovered(beneficiary, recipient, amount);
    }

    event BeneficiaryFeesRecovered(address indexed beneficiary, address indexed recipient, uint256 amount);

    /**
     * @notice Withdraw surplus ETH (rounding dust, direct transfers).
     * @dev Only withdraws ETH not accounted for in any unclaimed balance.
     *      Uses totalUnclaimedBeneficiary to account for all beneficiary
     *      fees without iterating the mapping.
     */
    function withdrawSurplus() external onlyOwner {
        uint256 accountable = totalUnclaimedBeneficiary + unclaimedTreasury;

        // Sum all unclaimed pool fees
        for (uint8 i = 0; i < 6; ) {
            accountable += unclaimedPool[i];
            unchecked { i++; }
        }

        uint256 balance = address(this).balance;
        require(balance > accountable, "No surplus");

        uint256 surplus = balance - accountable;
        (bool success, ) = owner().call{value: surplus}("");
        require(success, "ETH transfer failed");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get pool configuration
     * @param poolId Pool ID hash
     * @return beneficiary The beneficiary address
     * @return companionOwner The companion owner address (COMPANION type only)
     * @return poolType 0 = COMPANION, 1 = FINETUNE
     * @return mintPoolIndex MintPool index
     * @return active Whether the pool is registered and active
     */
    function getPoolConfig(bytes32 poolId)
        external
        view
        returns (address beneficiary, address companionOwner, uint8 poolType, uint8 mintPoolIndex, bool active)
    {
        PoolConfig storage config = poolConfigs[poolId];
        return (config.beneficiary, config.companionOwner, config.poolType, config.mintPoolIndex, config.active);
    }

    /**
     * @notice Get unclaimed fees for a beneficiary
     * @param beneficiary Beneficiary address
     * @return Unclaimed fee amount in wei
     */
    function getUnclaimedFees(address beneficiary) external view returns (uint256) {
        return unclaimedBeneficiary[beneficiary];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @dev Compute pool ID hash from PoolKey (matches V4 PoolManager's hashing)
     */
    function _computePoolId(IPoolManager.PoolKey calldata key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key));
    }

    /**
     * @dev Spread a MintPool share equally across all 6 content-type
     *      buckets. Any rounding remainder rotates by `block.timestamp %
     *      NUM_POOLS` so over time every bucket gets a fair share of dust,
     *      not just bucket 0.
     */
    function _spreadAcrossPools(uint256 amount) internal {
        if (amount == 0) return;
        uint256 perPool = amount / NUM_POOLS;
        uint256 remainder = amount - (perPool * NUM_POOLS);
        for (uint8 i = 0; i < NUM_POOLS; ) {
            unclaimedPool[i] += perPool;
            unchecked { ++i; }
        }
        if (remainder > 0) {
            uint8 dustBucket = uint8(block.timestamp % NUM_POOLS);
            unclaimedPool[dustBucket] += remainder;
        }
    }

    /// @notice Accept ETH (from PoolManager.take or direct transfers)
    receive() external payable {}
}
