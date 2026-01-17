// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LSP8IdentifiableDigitalAsset} from "@lukso/lsp8-contracts/contracts/LSP8IdentifiableDigitalAsset.sol";
import {LSP8Enumerable} from "@lukso/lsp8-contracts/contracts/extensions/LSP8Enumerable.sol";
import {_LSP4_METADATA_KEY, _LSP4_TOKEN_TYPE_NFT} from "@lukso/lsp4-contracts/contracts/LSP4Constants.sol";
import {_LSP8_TOKENID_FORMAT_UNIQUE_ID} from "@lukso/lsp8-contracts/contracts/LSP8Constants.sol";
import {LSP8NonExistentTokenId} from "@lukso/lsp8-contracts/contracts/LSP8Errors.sol";

/**
 * @title BonzaiLSP8Collection
 * @notice LSP8 NFT collection for BonzAI AI-generated content
 * @dev Uses bytes32 tokenIds derived from content hashes for provenance
 *
 * Key features:
 * - Deterministic tokenIds from content hashes (collision-resistant)
 * - Irys (Arweave) transaction IDs for permanent storage proofs
 * - Tri-party attribution: creator, platform, inference node
 * - Platform mint fee for sustainability
 */
contract BonzaiLSP8Collection is LSP8Enumerable {

    // ═══════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    event ContentMinted(
        bytes32 indexed tokenId,
        address indexed creator,
        string irysTransactionId,
        string model,
        uint256 timestamp
    );

    event ProvenanceUpdated(
        bytes32 indexed tokenId,
        bytes32 newMetadataHash
    );

    event MintFeeUpdated(
        uint256 oldFee,
        uint256 newFee
    );

    event TreasuryUpdated(
        address oldTreasury,
        address newTreasury
    );

    // ═══════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════

    error InsufficientMintFee(uint256 sent, uint256 required);
    error EmptyIrysTransactionId();
    error TokenAlreadyExists(bytes32 tokenId);
    error FeeTransferFailed();
    error InvalidTreasury();
    error LengthMismatch();

    // ═══════════════════════════════════════════════════════════════════════
    // STORAGE
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Platform fee recipient
    address public treasury;

    /// @notice Mint fee in native token (LYX)
    uint256 public mintFee;

    /// @notice Mapping of tokenId to Irys transaction ID
    mapping(bytes32 => string) public irysTransactionIds;

    /// @notice Mapping of tokenId to original creator
    mapping(bytes32 => address) public originalCreators;

    /// @notice Mapping of tokenId to creation timestamp
    mapping(bytes32 => uint256) public creationTimestamps;

    /// @notice Mapping of tokenId to AI model used
    mapping(bytes32 => string) public models;

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Deploy the BonzAI LSP8 Collection
     * @param name_ Collection name (e.g., "BonzAI Creations")
     * @param symbol_ Collection symbol (e.g., "BONZAI")
     * @param newOwner_ Contract owner (can be multisig)
     * @param treasury_ Address to receive mint fees
     * @param mintFee_ Initial mint fee in wei (e.g., 10000000000000000 = 0.01 LYX)
     */
    constructor(
        string memory name_,
        string memory symbol_,
        address newOwner_,
        address treasury_,
        uint256 mintFee_
    )
        LSP8IdentifiableDigitalAsset(
            name_,
            symbol_,
            newOwner_,
            _LSP4_TOKEN_TYPE_NFT,  // 1 = NFT
            _LSP8_TOKENID_FORMAT_UNIQUE_ID  // 3 = Unique ID (hash)
        )
    {
        treasury = treasury_;
        mintFee = mintFee_;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MINTING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Mint a new AI-generated content NFT
     * @param to Recipient address (usually creator's Universal Profile)
     * @param tokenId bytes32 derived from content hash
     * @param irysTransactionId Arweave transaction ID from Irys upload
     * @param model AI model identifier (e.g., "flux-schnell")
     * @param metadataURI URI pointing to LSP4Metadata JSON (ar://...)
     * @param force Allow minting to non-LSP1 receivers
     * @param data Additional data for universalReceiver hook
     */
    function mint(
        address to,
        bytes32 tokenId,
        string calldata irysTransactionId,
        string calldata model,
        bytes calldata metadataURI,
        bool force,
        bytes calldata data
    ) external payable {
        if (msg.value < mintFee) {
            revert InsufficientMintFee(msg.value, mintFee);
        }
        if (bytes(irysTransactionId).length == 0) {
            revert EmptyIrysTransactionId();
        }
        if (_exists(tokenId)) {
            revert TokenAlreadyExists(tokenId);
        }

        // Store provenance data
        irysTransactionIds[tokenId] = irysTransactionId;
        originalCreators[tokenId] = msg.sender;
        creationTimestamps[tokenId] = block.timestamp;
        models[tokenId] = model;

        // Mint the token
        _mint(to, tokenId, force, data);

        // Set token-specific metadata
        _setDataForTokenId(
            tokenId,
            _LSP4_METADATA_KEY,
            metadataURI
        );

        // Transfer fee to treasury
        if (msg.value > 0) {
            (bool success, ) = treasury.call{value: msg.value}("");
            if (!success) {
                revert FeeTransferFailed();
            }
        }

        emit ContentMinted(tokenId, msg.sender, irysTransactionId, model, block.timestamp);
    }

    /**
     * @notice Batch mint multiple tokens
     * @dev More gas efficient than multiple individual mints
     */
    function mintBatch(
        address to,
        bytes32[] calldata tokenIds,
        string[] calldata irysTransactionIds_,
        string[] calldata models_,
        bytes[] calldata metadataURIs,
        bool force,
        bytes calldata data
    ) external payable {
        uint256 length = tokenIds.length;

        if (length != irysTransactionIds_.length ||
            length != metadataURIs.length ||
            length != models_.length) {
            revert LengthMismatch();
        }

        uint256 totalFee = mintFee * length;
        if (msg.value < totalFee) {
            revert InsufficientMintFee(msg.value, totalFee);
        }

        for (uint256 i = 0; i < length; ) {
            bytes32 tokenId = tokenIds[i];

            if (bytes(irysTransactionIds_[i]).length == 0) {
                revert EmptyIrysTransactionId();
            }
            if (_exists(tokenId)) {
                revert TokenAlreadyExists(tokenId);
            }

            irysTransactionIds[tokenId] = irysTransactionIds_[i];
            originalCreators[tokenId] = msg.sender;
            creationTimestamps[tokenId] = block.timestamp;
            models[tokenId] = models_[i];

            _mint(to, tokenId, force, data);
            _setDataForTokenId(tokenId, _LSP4_METADATA_KEY, metadataURIs[i]);

            emit ContentMinted(tokenId, msg.sender, irysTransactionIds_[i], models_[i], block.timestamp);

            unchecked { ++i; }
        }

        if (msg.value > 0) {
            (bool success, ) = treasury.call{value: msg.value}("");
            if (!success) {
                revert FeeTransferFailed();
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PROVENANCE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Get full provenance data for a token
     * @param tokenId The token to query
     * @return irysTransactionId Arweave transaction ID
     * @return originalCreator Address that minted the token
     * @return creationTimestamp Block timestamp of mint
     */
    function getProvenance(bytes32 tokenId) external view returns (
        string memory irysTransactionId,
        address originalCreator,
        uint256 creationTimestamp
    ) {
        if (!_exists(tokenId)) {
            revert LSP8NonExistentTokenId(tokenId);
        }
        return (
            irysTransactionIds[tokenId],
            originalCreators[tokenId],
            creationTimestamps[tokenId]
        );
    }

    /**
     * @notice Get the AI model used to generate a token
     * @param tokenId The token to query
     * @return model AI model identifier
     */
    function getModel(bytes32 tokenId) external view returns (string memory model) {
        if (!_exists(tokenId)) {
            revert LSP8NonExistentTokenId(tokenId);
        }
        return models[tokenId];
    }

    /**
     * @notice Verify a token's content hash matches its tokenId
     * @dev For clients to verify content authenticity
     * @param tokenId The token to verify
     * @param prompt Original prompt used
     * @param model AI model identifier
     * @param timestamp Generation timestamp
     * @param creator Creator address
     * @param contentHash keccak256 hash of the content
     * @return valid True if computed tokenId matches
     */
    function verifyContentHash(
        bytes32 tokenId,
        string calldata prompt,
        string calldata model,
        uint256 timestamp,
        address creator,
        bytes32 contentHash
    ) external pure returns (bool valid) {
        bytes32 computedId = keccak256(abi.encodePacked(
            prompt,
            model,
            timestamp,
            creator,
            contentHash
        ));
        return computedId == tokenId;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Update the mint fee
     * @param newFee New fee in wei
     */
    function setMintFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = mintFee;
        mintFee = newFee;
        emit MintFeeUpdated(oldFee, newFee);
    }

    /**
     * @notice Update the treasury address
     * @param newTreasury New treasury address
     */
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) {
            revert InvalidTreasury();
        }
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }
}
