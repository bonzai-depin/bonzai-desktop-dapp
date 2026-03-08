// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/**
 * @title IPoolManager (Uniswap V4)
 */
interface IPoolManagerFTF {
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
 * @title IPositionManagerFTF (Uniswap V4)
 */
interface IPositionManagerFTF {
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
 * @title IPermit2FTF
 */
interface IPermit2FTF {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

/**
 * @title IBonzaiUniswapHookFTF
 */
interface IBonzaiUniswapHookFTF {
    function registerPool(bytes32 poolId, address beneficiary, address companionOwner, uint8 poolType, uint8 mintPoolIndex) external;
}

/**
 * @title FineTuneToken
 * @notice Burnable ERC-20 token for fine-tuned AI models on Base
 * @dev Simple token linking to content NFT token ID and Irys model hash
 */
contract FineTuneToken is ERC20, ERC20Burnable {
    /// @notice Content NFT token ID that this model token represents
    uint256 public immutable contentTokenId;

    /// @notice Irys/Arweave hash of the model weights
    string public modelIrysHash;

    /// @notice Creator address
    address public immutable creator;

    /// @notice Factory that deployed this token
    address public immutable factory;

    /// @notice Deployment timestamp
    uint256 public immutable deployedAt;

    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        address recipient,
        uint256 _contentTokenId,
        string memory _modelIrysHash,
        address _creator
    ) ERC20(name, symbol) {
        require(recipient != address(0), "Invalid recipient");
        require(_creator != address(0), "Invalid creator");

        contentTokenId = _contentTokenId;
        modelIrysHash = _modelIrysHash;
        creator = _creator;
        factory = msg.sender;
        deployedAt = block.timestamp;

        _mint(recipient, totalSupply);
    }

    function getTokenInfo()
        external
        view
        returns (
            string memory name_,
            string memory symbol_,
            uint8 decimals_,
            uint256 contentTokenId_,
            string memory modelIrysHash_,
            address creator_
        )
    {
        return (name(), symbol(), decimals(), contentTokenId, modelIrysHash, creator);
    }
}

/**
 * @title FineTuneTokenFactory
 * @notice Factory for atomic fine-tune model token deployment + Uniswap V4 liquidity.
 *         Adapts the CompanionTokenFactory V4 pattern for fine-tuned AI models.
 *
 * Features:
 * - One-click token launch with 96% supply in liquidity, 4% to creator
 * - LP position NFT sent to DEAD_ADDRESS (unruggable - permanent liquidity)
 * - Tokens are burnable (deflationary)
 * - One token per content NFT (prevents duplicates)
 * - Links to content NFT token ID and Irys model hash
 * - Hook captures 1% of swap output: 80% creator, 10% treasury, 10% MintPool(LVL6)
 */
contract FineTuneTokenFactory is Ownable, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Fixed total supply for all model tokens (1 billion)
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18;

    /// @notice Percentage of supply allocated to liquidity pool (96%)
    uint256 public constant LP_SHARE_BPS = 9600;

    /// @notice Percentage of supply allocated to creator (4%)
    uint256 public constant CREATOR_SHARE_BPS = 400;

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Dead address for locking LP position NFT
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Native ETH placeholder (V4 uses address(0))
    address public constant NATIVE_ETH = address(0);

    /// @notice V4 full-range tick boundaries (aligned to tickSpacing=60)
    int24 public constant MIN_TICK = -887220;
    int24 public constant MAX_TICK = 887220;

    /// @notice Pool tick spacing
    int24 public constant TICK_SPACING = 60;

    /// @notice Hook mint pool index for training tokens (LVL6 = training pool)
    uint8 public constant MINT_POOL_INDEX = 5;

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Uniswap V4 PoolManager
    IPoolManagerFTF public immutable poolManager;

    /// @notice Uniswap V4 PositionManager
    IPositionManagerFTF public immutable positionManager;

    /// @notice Permit2 contract
    IPermit2FTF public immutable permit2;

    /// @notice BonzaiUniswapHook for fee capture
    IBonzaiUniswapHookFTF public immutable feeHook;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Minimum ETH required for liquidity
    uint256 public minEthLiquidity = 0.01 ether;

    /// @notice BonzaiContent NFT contract (for ownership verification)
    address public contentContract;

    /// @notice Mapping from content NFT tokenId to model token address
    mapping(uint256 => address) public modelTokens;

    /// @notice Array of all launched token addresses
    address[] public allTokens;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a new model token is launched
    event ModelTokenLaunched(
        uint256 indexed contentTokenId,
        address indexed token,
        bytes32 indexed poolId,
        string symbol,
        uint256 ethLiquidity,
        uint256 positionId,
        address creator,
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

        poolManager = IPoolManagerFTF(_poolManager);
        positionManager = IPositionManagerFTF(_positionManager);
        permit2 = IPermit2FTF(_permit2);
        feeHook = IBonzaiUniswapHookFTF(_feeHook);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TOKEN LAUNCH
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Launch a new model token with Uniswap V4 liquidity
     * @dev Deploys token, creates V4 pool, mints full-range LP, locks LP NFT,
     *      and registers with hook — all atomically.
     *
     * @param contentTokenId BonzaiContent NFT token ID for the fine-tuned model
     * @param name Full name (e.g., "BonzAI Fine-Tune: My Custom Model")
     * @param symbol Token symbol (e.g., "BZCUSTOM")
     * @param modelIrysHash Irys/Arweave hash of the model weights
     * @param creator Creator address (receives 4% of supply + 80% hook fees)
     *
     * @return token Address of the deployed token
     * @return poolId Pool ID hash for the V4 pool
     */
    function launchToken(
        uint256 contentTokenId,
        string calldata name,
        string calldata symbol,
        string calldata modelIrysHash,
        address creator
    ) external payable nonReentrant returns (address token, bytes32 poolId) {
        require(msg.value >= minEthLiquidity, "Insufficient ETH for liquidity");
        require(modelTokens[contentTokenId] == address(0), "Token already launched for this model");
        require(creator != address(0), "Invalid creator address");
        require(bytes(symbol).length > 0, "Symbol required");
        require(bytes(name).length > 0, "Name required");
        require(contentContract != address(0), "Content contract not set");
        require(IERC721(contentContract).ownerOf(contentTokenId) == msg.sender, "Not NFT owner");

        // 1. Calculate supply split: 96% to pool, 4% to creator
        uint256 lpAmount = (TOTAL_SUPPLY * LP_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 creatorAmount = TOTAL_SUPPLY - lpAmount;

        // 2. Deploy token with full supply to this contract
        FineTuneToken newToken = new FineTuneToken(
            name,
            symbol,
            TOTAL_SUPPLY,
            address(this),
            contentTokenId,
            modelIrysHash,
            creator
        );
        token = address(newToken);

        // 3. Register token
        modelTokens[contentTokenId] = token;
        allTokens.push(token);

        // 4. Transfer 4% to creator
        require(newToken.transfer(creator, creatorAmount), "Creator transfer failed");

        // 5. Build PoolKey
        IPositionManagerFTF.PoolKey memory poolKey = IPositionManagerFTF.PoolKey({
            currency0: NATIVE_ETH,
            currency1: token,
            fee: 0,
            tickSpacing: TICK_SPACING,
            hooks: address(feeHook)
        });

        // 6. Calculate sqrtPriceX96
        uint160 sqrtPriceX96 = _calculateSqrtPriceX96(msg.value, lpAmount);

        // 7. Initialize the pool
        IPoolManagerFTF.PoolKey memory pmKey = IPoolManagerFTF.PoolKey({
            currency0: NATIVE_ETH,
            currency1: token,
            fee: 0,
            tickSpacing: TICK_SPACING,
            hooks: address(feeHook)
        });
        poolManager.initialize(pmKey, sqrtPriceX96);

        // 8. Approve token via Permit2 to PositionManager
        newToken.approve(address(permit2), lpAmount);
        permit2.approve(token, address(positionManager), uint160(lpAmount), uint48(block.timestamp + 3600));

        // 9. Mint full-range LP position (2% slippage tolerance)
        (uint256 positionId, , ) = positionManager.mint{value: msg.value}(
            poolKey,
            MIN_TICK,
            MAX_TICK,
            0,
            uint128(lpAmount * 98 / 100),       // 2% slippage tolerance on tokens
            uint128(msg.value * 98 / 100),       // 2% slippage tolerance on ETH
            address(this),
            ""
        );

        require(positionId > 0, "Position mint failed");

        // 10. Transfer LP position NFT to DEAD_ADDRESS
        positionManager.safeTransferFrom(address(this), DEAD_ADDRESS, positionId);

        // 11. Compute poolId and register with hook
        poolId = keccak256(abi.encode(poolKey));
        feeHook.registerPool(poolId, creator, address(0), 1, MINT_POOL_INDEX); // 1 = FINETUNE, no companionOwner

        emit ModelTokenLaunched(
            contentTokenId,
            token,
            poolId,
            symbol,
            msg.value,
            positionId,
            creator,
            block.timestamp
        );

        return (token, poolId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function hasToken(uint256 contentTokenId) external view returns (bool) {
        return modelTokens[contentTokenId] != address(0);
    }

    function getToken(uint256 contentTokenId) external view returns (address) {
        return modelTokens[contentTokenId];
    }

    function totalTokensLaunched() external view returns (uint256) {
        return allTokens.length;
    }

    function getAllTokens() external view returns (address[] memory) {
        return allTokens;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function setContentContract(address _contentContract) external onlyOwner {
        require(_contentContract != address(0), "Invalid address");
        contentContract = _contentContract;
    }

    function setMinEthLiquidity(uint256 _minEth) external onlyOwner {
        require(_minEth > 0, "Min must be positive");
        uint256 oldMin = minEthLiquidity;
        minEthLiquidity = _minEth;
        emit MinEthLiquidityUpdated(oldMin, _minEth);
    }

    function recoverETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to recover");
        (bool success, ) = owner().call{value: balance}("");
        require(success, "ETH transfer failed");
    }

    function recoverERC20(address tokenAddr) external onlyOwner {
        uint256 balance = IERC20(tokenAddr).balanceOf(address(this));
        require(balance > 0, "No tokens to recover");
        IERC20(tokenAddr).safeTransfer(owner(), balance);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERC721 RECEIVER
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

    function _calculateSqrtPriceX96(uint256 ethAmount, uint256 tokenAmount)
        internal
        pure
        returns (uint160)
    {
        uint256 ratioX192 = (ethAmount << 192) / tokenAmount;
        uint256 sqrtRatio = _sqrt(ratioX192);
        require(sqrtRatio <= type(uint160).max, "Price overflow");
        return uint160(sqrtRatio);
    }

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

    receive() external payable {}
}
