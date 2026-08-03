// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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
        _mint(creator_, supply_);
    }
}

/**
 * @title GameTokenFactory
 * @notice Issues one creator-owned ERC-20 for each BonzAI game collectible.
 * @dev Liquidity is intentionally external. The factory makes no claim about a
 *      DEX until Robinhood-native pool infrastructure is explicitly configured.
 */
contract GameTokenFactory is Ownable, ReentrancyGuard {
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
    ) external nonReentrant returns (address token) {
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

    function getAllTokens() external view returns (address[] memory) {
        return allGameTokens;
    }

    function totalTokensIssued() external view returns (uint256) {
        return allGameTokens.length;
    }
}
