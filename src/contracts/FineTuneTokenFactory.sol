// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./BonzaiV4Liquidity.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IBonzaiCollectiblesMembership {
    function isCollection(address collection) external view returns (bool);
}

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

    function nextTokenId() external view returns (uint256);
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;

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
 * @title FineTuneToken
 * @notice Burnable ERC-20 token for published AI models
 * @dev Links to a collection and token ID; model metadata and validation hash are publisher assertions, not independent verification.
 */
contract FineTuneToken is ERC20, ERC20Burnable {
    /// @notice Factory-registered collection containing the published model NFT.
    address public immutable contentCollection;

    /// @notice Content NFT token ID that this model token represents
    uint256 public immutable contentTokenId;

    /// @notice Local/IPFS metadata reference retained under the legacy getter name.
    string public modelIrysHash;
    string public metadataURI;
    string public description;
    string public imageURI;
    string public modelKind;
    /// @notice Publisher-supplied artifact/evaluation commitment; not a verification verdict.
    bytes32 public validationHash;

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
        address _contentCollection,
        uint256 _contentTokenId,
        string memory _modelIrysHash,
        address _creator,
        string memory _description,
        string memory _imageURI,
        string memory _modelKind,
        bytes32 _validationHash
    ) ERC20(name, symbol) {
        require(recipient != address(0), "Invalid recipient");
        require(_creator != address(0), "Invalid creator");

        require(_contentCollection != address(0), "Invalid collection");
        contentCollection = _contentCollection;
        contentTokenId = _contentTokenId;
        modelIrysHash = _modelIrysHash;
        metadataURI = _modelIrysHash;
        description = _description;
        imageURI = _imageURI;
        modelKind = _modelKind;
        validationHash = _validationHash;
        creator = _creator;
        factory = msg.sender;
        deployedAt = block.timestamp;

        _mint(recipient, totalSupply);
    }

    function getModelProfile() external view returns (
        string memory metadataURI_,
        string memory description_,
        string memory imageURI_,
        string memory modelKind_,
        bytes32 validationHash_
    ) {
        return (metadataURI, description, imageURI, modelKind, validationHash);
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
 * - LP position NFT BURNED at launch (sent to 0xdead — canonical V4 burn,
 *   liquidity stays in the pool, NFT permanently unreachable)
 * - Tokens are burnable (deflationary)
 * - One token per content NFT (prevents duplicates)
 * - Links to content NFT token ID and IPFS model hash
 * - Hook captures 1% of swap output: 80% creator, 10% treasury, 10% MintPool
 *   (MintPool slice spread equally across all 6 content-type buckets)
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
    /// @notice Address with no known private key. Receiving the LP position NFT
    ///         here is equivalent to burning it: ERC-721 transfers to address(0)
    ///         revert in OZ v5, so this is the canonical V4 burn pattern.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

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

    /// @notice Canonical BonzaiCollectiblesFactory (collection membership verification).
    address public contentContract;
    bool public legacyLaunchEnabled;

    /// @notice One model token per (collection, NFT token ID), including after transfers.
    mapping(address => mapping(uint256 => address)) public modelTokens;

    /// @notice Array of all launched token addresses
    address[] public allTokens;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a new model token is launched
    event ModelTokenLaunched(
        address contentCollection,
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
    event LegacyLaunchDisabled();

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

    /// @notice Legacy global-token-ID publication cannot identify a collection and is disabled.
    function launchToken(
        uint256,
        string calldata,
        string calldata,
        string calldata,
        address
    ) external payable returns (address, bytes32) {
        revert("Use validated model launch");
    }

    /// @notice Publish a model linked to a canonical collection NFT owned by the caller.
    /// @dev Metadata and validationHash are supplied by the publisher. Their presence
    ///      does not establish independent model quality, provenance, or safety review.
    function launchValidatedToken(
        address contentCollection,
        uint256 contentTokenId,
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata description,
        string calldata imageURI,
        string calldata modelKind,
        bytes32 validationHash,
        address creator
    ) external payable nonReentrant returns (address token, bytes32 poolId) {
        require(validationHash != bytes32(0), "Validation required");
        require(bytes(metadataURI).length > 0, "Metadata required");
        require(bytes(description).length > 0, "Description required");
        require(bytes(imageURI).length > 0, "Image required");
        require(
            keccak256(bytes(modelKind)) == keccak256("fine_tuned") ||
            keccak256(bytes(modelKind)) == keccak256("abliterated"),
            "Invalid model kind"
        );
        return _launchToken(
            contentCollection, contentTokenId, name, symbol, metadataURI, description, imageURI, modelKind, validationHash, creator
        );
    }

    function _launchToken(
        address contentCollection,
        uint256 contentTokenId,
        string memory name,
        string memory symbol,
        string memory metadataURI,
        string memory description,
        string memory imageURI,
        string memory modelKind,
        bytes32 validationHash,
        address creator
    ) internal returns (address token, bytes32 poolId) {
        require(msg.value >= minEthLiquidity, "Insufficient ETH for liquidity");
        require(modelTokens[contentCollection][contentTokenId] == address(0), "Token already launched for this model");
        require(creator != address(0), "Invalid creator address");
        require(bytes(symbol).length > 0, "Symbol required");
        require(bytes(name).length > 0, "Name required");
        require(contentContract != address(0), "Content contract not set");
        require(IBonzaiCollectiblesMembership(contentContract).isCollection(contentCollection), "Unregistered collection");
        require(IERC721(contentCollection).ownerOf(contentTokenId) == msg.sender, "Not NFT owner");

        // 1. Calculate supply split: 96% to pool, 4% to creator
        uint256 lpAmount = (TOTAL_SUPPLY * LP_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 creatorAmount = TOTAL_SUPPLY - lpAmount;

        // 2. Deploy token with full supply to this contract
        FineTuneToken newToken = new FineTuneToken(
            name,
            symbol,
            TOTAL_SUPPLY,
            address(this),
            contentCollection,
            contentTokenId,
            metadataURI,
            creator,
            description,
            imageURI,
            modelKind,
            validationHash
        );
        token = address(newToken);

        // 3. Register token
        modelTokens[contentCollection][contentTokenId] = token;
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

        // 9. Mint using the canonical V4 PositionManager action interface.
        // Initialization and mint happen atomically at the same price; no slippage
        // allowance is needed. Maxima follow currency0=ETH, currency1=token.
        uint256 positionId = positionManager.nextTokenId();
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            poolKey, MIN_TICK, MAX_TICK,
            uint256(BonzaiV4Liquidity.liquidity(msg.value, lpAmount, sqrtPriceX96)),
            uint128(msg.value), uint128(lpAmount), BURN_ADDRESS, bytes("")
        );
        params[1] = abi.encode(NATIVE_ETH, token);
        params[2] = abi.encode(NATIVE_ETH, msg.sender);
        positionManager.modifyLiquidities{value: msg.value}(abi.encode(hex"020d14", params), block.timestamp);
        require(IERC721(address(positionManager)).ownerOf(positionId) == BURN_ADDRESS, "Position not locked");
        // Any rounding remainder is inaccessible to the factory administrator.
        uint256 tokenDust = newToken.balanceOf(address(this));
        if (tokenDust > 0) newToken.transfer(BURN_ADDRESS, tokenDust);
        newToken.approve(address(permit2), 0);
        permit2.approve(token, address(positionManager), 0, 0);

        // 11. Compute poolId and register with hook
        poolId = keccak256(abi.encode(poolKey));
        // FineTune doesn't use live NFT lookups — pass zeros for NFT fields.
        feeHook.registerPool(poolId, creator, address(0), 0, 1, MINT_POOL_INDEX); // 1 = FINETUNE

        emit ModelTokenLaunched(
            contentCollection,
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

    function disableLegacyLaunch() external onlyOwner {
        legacyLaunchEnabled = false;
        emit LegacyLaunchDisabled();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function hasToken(address contentCollection, uint256 contentTokenId) external view returns (bool) {
        return modelTokens[contentCollection][contentTokenId] != address(0);
    }

    function getToken(address contentCollection, uint256 contentTokenId) external view returns (address) {
        return modelTokens[contentCollection][contentTokenId];
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
        require(_contentContract.code.length > 0, "Invalid collection factory");
        require(!IBonzaiCollectiblesMembership(_contentContract).isCollection(address(0)), "Invalid collection factory");
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
        internal pure returns (uint160)
    {
        return BonzaiV4Liquidity.sqrtPrice(ethAmount, tokenAmount);
    }

    receive() external payable {}
}
