// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./BonzaiLiquidityVault.sol";
import "./CompanionTokenFactory.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBonzaiGameCollectionFactory {
    function collections(address owner) external view returns (address);
}

interface IBonzaiGameRegistry {
    function isRegisteredGame(address collectible, uint256 tokenId) external view returns (bool);
    function metadataHashFor(address collectible, uint256 tokenId) external view returns (bytes32);
}

contract GameToken is ERC20, ERC20Burnable {
    address public immutable creator;
    address public immutable collectible;
    uint256 public immutable collectibleTokenId;
    string public metadataURI;

    constructor(
        string memory name_,
        string memory symbol_,
        address creator_,
        address collectible_,
        uint256 collectibleTokenId_,
        string memory metadataURI_,
        uint256 supply_
    ) ERC20(name_, symbol_) {
        creator = creator_;
        collectible = collectible_;
        collectibleTokenId = collectibleTokenId_;
        metadataURI = metadataURI_;
        _mint(msg.sender, supply_);
    }
}

/**
 * @title GameTokenFactory
 * @notice Issues one ERC-20 per game: 96% locked liquidity, 4% creator.
 * @dev Hookless 1% trading fees are collected by the same immutable vault as model and agent tokens.
 */
contract GameTokenFactory is Ownable, ReentrancyGuard {
    BonzaiLiquidityVault public liquidityVault;
    mapping(address=>uint256) public liquidityPosition;
    IPoolManagerCTF public poolManager;
    IPositionManager public positionManager;
    IPermit2 public permit2;
    uint256 public constant minEthLiquidity = 0.01 ether;
    uint256 public constant POOL_SHARE_BPS = 9600;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    event GamePoolCreated(address indexed token,bytes32 indexed poolId,uint256 indexed positionId,uint256 liquidityEth);
    function configureLiquidity(address manager,address positions,address permits,address treasury,address rewards) external onlyOwner {
        require(address(liquidityVault)==address(0),"Vault already configured");
        require(manager.code.length>0 && positions.code.length>0 && permits.code.length>0,"Invalid liquidity contracts");
        poolManager=IPoolManagerCTF(manager);positionManager=IPositionManager(positions);permit2=IPermit2(permits);
        liquidityVault=new BonzaiLiquidityVault(positions,treasury,rewards);
    }
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    IBonzaiGameCollectionFactory public immutable collectiblesFactory;
    IBonzaiGameRegistry public immutable gameRegistry;

    mapping(bytes32 => address) public tokenForCollectible;
    mapping(address => bool) public isGameToken;
    address[] private allGameTokens;

    event GameTokenIssued(
        address indexed token,
        address indexed creator,
        address indexed collectible,
        uint256 collectibleTokenId,
        string name,
        string symbol,
        string metadataURI
    );

    constructor(address collectiblesFactory_, address gameRegistry_) Ownable(msg.sender) {
        require(collectiblesFactory_ != address(0), "Invalid collectibles factory");
        require(gameRegistry_ != address(0), "Invalid game registry");
        collectiblesFactory = IBonzaiGameCollectionFactory(collectiblesFactory_);
        gameRegistry = IBonzaiGameRegistry(gameRegistry_);
    }

    function issue(
        address collectible,
        uint256 collectibleTokenId,
        string calldata name,
        string calldata symbol,
        string calldata metadataURI
    ) external payable nonReentrant returns (address token) {
        require(collectible != address(0), "Invalid collectible");
        require(bytes(name).length >= 2 && bytes(name).length <= 64, "Invalid name");
        require(bytes(symbol).length >= 2 && bytes(symbol).length <= 12, "Invalid symbol");
        require(bytes(metadataURI).length != 0, "Metadata required");
        require(collectiblesFactory.collections(msg.sender) == collectible, "Not BonzAI collection");
        require(IERC721(collectible).ownerOf(collectibleTokenId) == msg.sender, "Not game owner");
        require(gameRegistry.isRegisteredGame(collectible, collectibleTokenId), "Not registered game");
        require(
            gameRegistry.metadataHashFor(collectible, collectibleTokenId) == keccak256(bytes(metadataURI)),
            "Metadata mismatch"
        );

        bytes32 key = keccak256(abi.encode(collectible, collectibleTokenId));
        require(tokenForCollectible[key] == address(0), "Token already issued");

        require(address(liquidityVault)!=address(0),"Vault not configured");
        require(msg.value>=minEthLiquidity && msg.value<=type(uint128).max,"Invalid liquidity amount");
        token = address(new GameToken(
            name,
            symbol,
            msg.sender,
            collectible,
            collectibleTokenId,
            metadataURI,
            TOTAL_SUPPLY
        ));
        tokenForCollectible[key] = token;
        isGameToken[token] = true;
        _launchPool(token,msg.sender);
        allGameTokens.push(token);

        emit GameTokenIssued(
            token,
            msg.sender,
            collectible,
            collectibleTokenId,
            name,
            symbol,
            metadataURI
        );
    }

    function _launchPool(address token,address creator) private {
        uint256 poolAmount=TOTAL_SUPPLY*POOL_SHARE_BPS/10000;
        require(IERC20(token).transfer(creator,TOTAL_SUPPLY-poolAmount),"Creator transfer failed");
        IPositionManager.PoolKey memory key=IPositionManager.PoolKey(address(0),token,10000,60,address(0));
        uint160 price=BonzaiV4Liquidity.sqrtPrice(msg.value,poolAmount);
        poolManager.initialize(IPoolManagerCTF.PoolKey(address(0),token,10000,60,address(0)),price);
        IERC20(token).approve(address(permit2),poolAmount);
        permit2.approve(token,address(positionManager),uint160(poolAmount),uint48(block.timestamp));
        uint256 id=positionManager.nextTokenId();bytes[] memory params=new bytes[](3);
        params[0]=abi.encode(key,int24(-887220),int24(887220),uint256(BonzaiV4Liquidity.liquidity(msg.value,poolAmount,price)),uint128(msg.value),uint128(poolAmount),address(liquidityVault),bytes(""));
        params[1]=abi.encode(address(0),token);params[2]=abi.encode(address(0),creator);
        positionManager.modifyLiquidities{value:msg.value}(abi.encode(hex"020d14",params),block.timestamp);
        liquidityPosition[token]=id;
        liquidityVault.register(id,address(0),token,creator,address(0),0);
        uint256 dust=IERC20(token).balanceOf(address(this));if(dust>0)IERC20(token).transfer(BURN_ADDRESS,dust);
        IERC20(token).approve(address(permit2),0);permit2.approve(token,address(positionManager),0,0);
        emit GamePoolCreated(token,keccak256(abi.encode(key)),id,msg.value);
    }

    function getAllTokens() external view returns (address[] memory) {
        return allGameTokens;
    }

    function totalTokensIssued() external view returns (uint256) {
        return allGameTokens.length;
    }
}
