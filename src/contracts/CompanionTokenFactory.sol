// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "./CompanionToken.sol";

/**
 * @title IPoolManager (Uniswap V4)
 */
interface IPoolManagerCTF {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);
}

/**
 * @title IPositionManager (Uniswap V4)
 * @notice Minimal interface for minting full-range LP positions
 */
interface IPositionManager {
    struct MintPositionParams {
        PoolKey poolKey;
        int24 tickLower;
        int24 tickUpper;
        uint256 liquidity;
        uint128 amount0Max;
        uint128 amount1Max;
        address owner;
        bytes hookData;
    }

    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    function mint(
        PoolKey calldata poolKey,
        int24 tickLower,
        int24 tickUpper,
        uint256 liquidity,
        uint128 amount0Max,
        uint128 amount1Max,
        address owner,
        bytes calldata hookData
    ) external payable returns (uint256 tokenId, uint128 liquidity0, uint128 liquidity1);

    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

/**
 * @title IPermit2
 */
interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

/**
 * @title IBonzaiUniswapHook
 */
interface IBonzaiUniswapHook {
    function registerPool(
        bytes32 poolId,
        address beneficiary,
        address companionNFT,
        uint256 companionTokenId,
        uint8 poolType,
        uint8 mintPoolIndex
    ) external;
}

/**
 * @title CompanionTokenFactory
 * @notice Factory for atomic companion token deployment + Uniswap V4 liquidity
 * @dev Deploys ERC-20 token, creates V4 pool with fee=0 (hook-only fees),
 *      mints full-range LP position, locks LP NFT to DEAD address, and
 *      registers the pool with BonzaiUniswapHook for 33/33/34 fee capture.
 *
 * Features:
 * - One-click token launch with 96% supply in liquidity, 4% to companion (agent wallet)
 * - LP position NFT BURNED at launch (sent to 0xdead — no private key exists, so
 *   the NFT is permanently unreachable and the underlying liquidity stays in the
 *   V4 pool forever; this is the canonical V4 burn pattern since ERC-721
 *   transfers to address(0) revert).
 * - Tokens are burnable (deflationary)
 * - No trading tax, no honeypot, no special permissions
 * - One token per companion (prevents duplicates)
 * - Minimum ETH requirement to prevent dust attacks
 * - Hook captures 1% of swap output: 40 wallet / 40 owner / 10 treasury / 10 MintPool
 */
contract CompanionTokenFactory is Ownable, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Fixed total supply for all companion tokens (1 billion)
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18;

    /// @notice Percentage of supply allocated to liquidity pool (96%)
    uint256 public constant POOL_SHARE_BPS = 9600;

    /// @notice Percentage of supply allocated to agent wallet (4%)
    uint256 public constant AGENT_SHARE_BPS = 400;

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Dead address for locking LP position NFT (unruggable liquidity)
    /// @notice Address with no known private key. Receiving the LP position NFT
    ///         here is equivalent to burning it: ERC-721 transfers to address(0)
    ///         revert in OZ v5, so this is the canonical V4 burn pattern.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Native ETH placeholder (Uniswap V4 uses address(0) for native ETH)
    address public constant NATIVE_ETH = address(0);

    /// @notice V4 full-range tick boundaries (aligned to tickSpacing=60)
    int24 public constant MIN_TICK = -887220; // Nearest multiple of 60 below -887272
    int24 public constant MAX_TICK = 887220;  // Nearest multiple of 60 above 887272

    /// @notice Pool tick spacing
    int24 public constant TICK_SPACING = 60;

    /// @notice Hook mint pool index for companion tokens (LVL4 = video pool)
    /// @notice Unused for COMPANION pool type — companion hook fees always go to pool 5 (LVL6 training).
    /// This value is passed to registerPool() but ignored by BonzaiUniswapHook for POOL_TYPE_COMPANION.
    uint8 public constant MINT_POOL_INDEX = 0;

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Uniswap V4 PoolManager
    IPoolManagerCTF public immutable poolManager;

    /// @notice Uniswap V4 PositionManager (ERC-721 for LP positions)
    IPositionManager public immutable positionManager;

    /// @notice Permit2 contract for token approvals
    IPermit2 public immutable permit2;

    /// @notice BonzaiUniswapHook for fee capture
    IBonzaiUniswapHook public immutable feeHook;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Minimum ETH required for liquidity
    uint256 public minEthLiquidity = 0.01 ether;

    /// @notice BonzaiCompanions NFT contract (for ownership verification)
    address public companionContract;

    /// @notice Mapping from companion NFT token ID to token address (prevents duplicates)
    mapping(uint256 => address) public companionTokens;

    /// @notice Array of all launched token addresses
    address[] public allTokens;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a new companion token is launched
    event CompanionTokenLaunched(
        uint256 indexed nftTokenId,
        address indexed token,
        bytes32 indexed poolId,
        string symbol,
        uint256 ethLiquidity,
        uint256 positionId,
        uint256 timestamp
    );

    /// @notice Emitted when minimum ETH liquidity is updated
    event MinEthLiquidityUpdated(uint256 oldMin, uint256 newMin);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Deploy the factory with Uniswap V4 infrastructure addresses
     * @param _poolManager Uniswap V4 PoolManager on Base
     * @param _positionManager Uniswap V4 PositionManager on Base
     * @param _permit2 Permit2 contract on Base
     * @param _feeHook BonzaiUniswapHook address
     */
    constructor(
        address _poolManager,
        address _positionManager,
        address _permit2,
        address _feeHook
    ) Ownable(msg.sender) {
        require(_poolManager != address(0), "Invalid PoolManager");
        require(_positionManager != address(0), "Invalid PositionManager");
        require(_permit2 != address(0), "Invalid Permit2");
        require(_feeHook != address(0), "Invalid feeHook");

        poolManager = IPoolManagerCTF(_poolManager);
        positionManager = IPositionManager(_positionManager);
        permit2 = IPermit2(_permit2);
        feeHook = IBonzaiUniswapHook(_feeHook);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TOKEN LAUNCH
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Launch a new companion token with Uniswap V4 liquidity
     * @dev Deploys token, creates V4 pool, mints full-range LP, locks LP NFT,
     *      and registers with hook — all atomically.
     *
     * @param nftTokenId Companion NFT token ID (must be > 0, must be minted first)
     * @param name Full name of the companion (e.g., "Aurore Delacroix")
     * @param symbol Token symbol - companion's first name uppercase (e.g., "AURORE")
     * @param imageURI IPFS URI of companion's profile image
     * @param agentWallet Companion's agent wallet address
     * @param companionOwner NFT owner address (receives 33% of hook fees)
     *
     * @return token Address of the deployed token
     * @return poolId Pool ID hash for the V4 pool
     */
    function launchToken(
        uint256 nftTokenId,
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        address agentWallet,
        address companionOwner
    ) external payable nonReentrant returns (address token, bytes32 poolId) {
        // Validation
        require(msg.value >= minEthLiquidity, "Insufficient ETH for liquidity");
        require(nftTokenId > 0, "Must have minted NFT");
        require(companionTokens[nftTokenId] == address(0), "Token already exists for this companion");
        require(agentWallet != address(0), "Invalid agent wallet address");
        require(companionOwner != address(0), "Invalid companion owner address");
        require(bytes(symbol).length > 0, "Symbol required");
        require(bytes(name).length > 0, "Name required");
        require(companionContract != address(0), "Companion contract not set");
        address liveOwner = IERC721(companionContract).ownerOf(nftTokenId);
        if (msg.sender == companionContract) {
            require(liveOwner == companionOwner, "Companion owner mismatch");
        } else {
            require(msg.sender == liveOwner, "Not NFT owner");
        }

        // 1. Calculate supply split: 96% to pool, 4% to agent wallet
        uint256 poolAmount = (TOTAL_SUPPLY * POOL_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 agentAmount = TOTAL_SUPPLY - poolAmount;

        // 2. Deploy token with full supply to this contract
        CompanionToken newToken = new CompanionToken(
            name,
            symbol,
            TOTAL_SUPPLY,
            address(this),
            imageURI,
            agentWallet,
            nftTokenId
        );
        token = address(newToken);

        // 3. Register token to prevent duplicates
        companionTokens[nftTokenId] = token;
        allTokens.push(token);

        // 4. Transfer 4% to agent wallet
        require(newToken.transfer(agentWallet, agentAmount), "Agent wallet transfer failed");

        // 5. Build PoolKey — currency0 must be < currency1 (V4 requirement)
        // Native ETH = address(0), which is always < any token address
        IPositionManager.PoolKey memory poolKey = IPositionManager.PoolKey({
            currency0: NATIVE_ETH,
            currency1: token,
            fee: 0,              // No LP fee — hook captures all fees
            tickSpacing: TICK_SPACING,
            hooks: address(feeHook)
        });

        // 6. Calculate sqrtPriceX96 from ETH/token ratio
        // price = ethAmount / poolAmount (ETH per token)
        // sqrtPriceX96 = sqrt(price) * 2^96
        // For currency0=ETH, currency1=token: price = amount0/amount1 = ethAmount/tokenAmount
        uint160 sqrtPriceX96 = _calculateSqrtPriceX96(msg.value, poolAmount);

        // 7. Initialize the pool
        IPoolManagerCTF.PoolKey memory pmKey = IPoolManagerCTF.PoolKey({
            currency0: NATIVE_ETH,
            currency1: token,
            fee: 0,
            tickSpacing: TICK_SPACING,
            hooks: address(feeHook)
        });
        poolManager.initialize(pmKey, sqrtPriceX96);

        // 8. Approve token via Permit2 to PositionManager
        newToken.approve(address(permit2), poolAmount);
        permit2.approve(token, address(positionManager), uint160(poolAmount), uint48(block.timestamp + 3600));

        // 9. Mint full-range LP position (2% slippage tolerance)
        (uint256 positionId, , ) = positionManager.mint{value: msg.value}(
            poolKey,
            MIN_TICK,
            MAX_TICK,
            0,                                      // liquidity calculated by PM from amounts
            uint128(poolAmount * 98 / 100),         // 2% slippage tolerance on tokens
            uint128(msg.value * 98 / 100),          // 2% slippage tolerance on ETH
            address(this),                           // Position NFT minted to factory first
            ""                                       // No hook data
        );

        require(positionId > 0, "Position mint failed");

        // 10. Burn LP position NFT (transferred to 0xdead — no private key, the
        //     position is permanently unreachable and liquidity stays in the pool)
        // V4's BURN_POSITION removes liquidity first, so we use DEAD transfer
        positionManager.safeTransferFrom(address(this), BURN_ADDRESS, positionId);

        // 11. Compute poolId and register with hook. The hook reads owner +
        //     agent wallet LIVE from the NFT contract on every swap, so we
        //     pass companionContract + nftTokenId rather than snapshotting
        //     companionOwner. agentWallet is kept as a legacy fallback in
        //     PoolConfig.beneficiary.
        poolId = keccak256(abi.encode(poolKey));
        feeHook.registerPool(
            poolId,
            agentWallet,
            companionContract,   // NFT contract for live ownerOf / getAgentWallet
            nftTokenId,
            0,                    // 0 = COMPANION
            MINT_POOL_INDEX
        );

        emit CompanionTokenLaunched(
            nftTokenId,
            token,
            poolId,
            symbol,
            msg.value,
            positionId,
            block.timestamp
        );

        return (token, poolId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Check if a companion already has a token
     */
    function hasToken(uint256 nftTokenId) external view returns (bool) {
        return companionTokens[nftTokenId] != address(0);
    }

    /**
     * @notice Get token address for a companion
     */
    function getToken(uint256 nftTokenId) external view returns (address) {
        return companionTokens[nftTokenId];
    }

    /**
     * @notice Get total number of tokens launched
     */
    function totalTokensLaunched() external view returns (uint256) {
        return allTokens.length;
    }

    /**
     * @notice Get all launched token addresses
     */
    function getAllTokens() external view returns (address[] memory) {
        return allTokens;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Set the BonzaiCompanions NFT contract (for ownership verification)
     */
    function setCompanionContract(address _companionContract) external onlyOwner {
        require(_companionContract != address(0), "Invalid address");
        companionContract = _companionContract;
    }

    /**
     * @notice Update minimum ETH required for liquidity
     */
    function setMinEthLiquidity(uint256 _minEth) external onlyOwner {
        require(_minEth > 0, "Min must be positive");
        uint256 oldMin = minEthLiquidity;
        minEthLiquidity = _minEth;
        emit MinEthLiquidityUpdated(oldMin, _minEth);
    }

    /**
     * @notice Recover ETH accidentally sent to contract
     */
    function recoverETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to recover");
        (bool success, ) = owner().call{value: balance}("");
        require(success, "ETH transfer failed");
    }

    /**
     * @notice Recover ERC20 tokens accidentally sent to contract
     */
    function recoverERC20(address tokenAddr) external onlyOwner {
        uint256 balance = IERC20(tokenAddr).balanceOf(address(this));
        require(balance > 0, "No tokens to recover");
        IERC20(tokenAddr).safeTransfer(owner(), balance);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERC721 RECEIVER (for LP position NFT)
    // ═══════════════════════════════════════════════════════════════════════════

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return this.onERC721Received.selector;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @dev Calculate sqrtPriceX96 from ETH and token amounts.
     *      For V4 with currency0=ETH (address(0)), currency1=token:
     *      price = amount0 / amount1 = ethAmount / tokenAmount
     *      sqrtPriceX96 = sqrt(price) * 2^96
     */
    function _calculateSqrtPriceX96(uint256 ethAmount, uint256 tokenAmount)
        internal
        pure
        returns (uint160)
    {
        require(ethAmount > 0 && tokenAmount > 0, "Zero amount");
        // sqrtPriceX96 = sqrt(ethAmount * 2^192 / tokenAmount)
        // Split shift to avoid overflow: (ethAmount << 192) overflows for ethAmount >= 2^64
        // Instead: compute (ethAmount << 96) / tokenAmount, then shift result << 96 before sqrt
        uint256 step1 = (ethAmount << 96) / tokenAmount;
        uint256 ratioX192 = step1 << 96;
        uint256 sqrtResult = _sqrt(ratioX192);
        require(sqrtResult > 0 && sqrtResult <= type(uint160).max, "Invalid sqrt price");
        return uint160(sqrtResult);
    }

    /**
     * @dev Integer square root (Babylonian method)
     */
    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    /// @notice Allow contract to receive ETH
    receive() external payable {}
}
