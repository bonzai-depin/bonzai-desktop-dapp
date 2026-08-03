// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IBonzaiGameCollectionSource {
    function collections(address owner) external view returns (address);
}

/**
 * @title BonzaiGameRegistry
 * @notice Canonical on-chain identity for composed BonzAI game collectibles.
 */
contract BonzaiGameRegistry {
    struct GameRecord {
        address creator;
        bytes32 manifestHash;
        string metadataURI;
        uint64 registeredAt;
    }

    IBonzaiGameCollectionSource public immutable collectiblesFactory;
    mapping(bytes32 => GameRecord) public games;

    event GameRegistered(
        address indexed collectible,
        uint256 indexed tokenId,
        address indexed creator,
        bytes32 manifestHash,
        string metadataURI
    );

    constructor(address collectiblesFactory_) {
        require(collectiblesFactory_ != address(0), "Invalid collectibles factory");
        collectiblesFactory = IBonzaiGameCollectionSource(collectiblesFactory_);
    }

    function gameKey(address collectible, uint256 tokenId) public pure returns (bytes32) {
        return keccak256(abi.encode(collectible, tokenId));
    }

    function register(
        address collectible,
        uint256 tokenId,
        bytes32 manifestHash,
        string calldata metadataURI
    ) external {
        require(manifestHash != bytes32(0), "Manifest hash required");
        require(bytes(metadataURI).length != 0, "Metadata required");
        require(collectiblesFactory.collections(msg.sender) == collectible, "Not BonzAI collection");
        require(IERC721(collectible).ownerOf(tokenId) == msg.sender, "Not collectible owner");

        bytes32 key = gameKey(collectible, tokenId);
        require(games[key].creator == address(0), "Game already registered");
        games[key] = GameRecord(msg.sender, manifestHash, metadataURI, uint64(block.timestamp));
        emit GameRegistered(collectible, tokenId, msg.sender, manifestHash, metadataURI);
    }

    function isRegisteredGame(address collectible, uint256 tokenId) external view returns (bool) {
        return games[gameKey(collectible, tokenId)].creator != address(0);
    }

    function metadataHashFor(address collectible, uint256 tokenId) external view returns (bytes32) {
        return keccak256(bytes(games[gameKey(collectible, tokenId)].metadataURI));
    }
}
