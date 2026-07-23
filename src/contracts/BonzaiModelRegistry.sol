// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract BonzaiModelRegistry is Ownable, ReentrancyGuard, Pausable {
    enum ModelType { LLM, IMAGE, AUDIO, VIDEO, VISION, EMBEDDING, ADAPTER, SKILL_MODEL }

    struct ModelAsset {
        bytes32 id;
        address publisher;
        ModelType modelType;
        bytes32 modelHash;
        string metadataURI;
        string licenseURI;
        address revenueRecipient;
        uint16 qualityScore;
        bool active;
        bool verified;
        uint256 createdAt;
        uint256 updatedAt;
    }

    mapping(bytes32 => ModelAsset) public models;
    mapping(address => bytes32[]) public publisherModels;
    mapping(bytes32 => bytes32[]) private modelDatasets;
    mapping(bytes32 => bytes32[]) private modelEvaluations;
    bytes32[] public allModelIds;

    event ModelPublished(bytes32 indexed modelId, address indexed publisher, ModelType indexed modelType, bytes32 modelHash, string metadataURI, uint16 qualityScore, uint256 timestamp);
    event ModelUpdated(bytes32 indexed modelId, string metadataURI, uint16 qualityScore, bool active, uint256 timestamp);
    event ModelVerificationChanged(bytes32 indexed modelId, bool verified, uint256 timestamp);

    error ModelNotFound(bytes32 modelId);
    error NotPublisher(address caller, address publisher);
    error InvalidQualityScore(uint16 qualityScore);
    error EmptyMetadataURI();
    error EmptyLicenseURI();
    error ZeroRevenueRecipient();

    constructor() Ownable(msg.sender) {}

    function publishModel(
        ModelType modelType,
        bytes32 modelHash,
        string calldata metadataURI,
        string calldata licenseURI,
        address revenueRecipient,
        uint16 qualityScore,
        bytes32[] calldata datasetIds,
        bytes32[] calldata evaluationIds
    ) external nonReentrant whenNotPaused returns (bytes32 modelId) {
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        if (bytes(licenseURI).length == 0) revert EmptyLicenseURI();
        if (revenueRecipient == address(0)) revert ZeroRevenueRecipient();
        if (qualityScore > 100) revert InvalidQualityScore(qualityScore);

        modelId = keccak256(abi.encodePacked(msg.sender, modelHash, metadataURI, block.timestamp, allModelIds.length));
        models[modelId] = ModelAsset({
            id: modelId,
            publisher: msg.sender,
            modelType: modelType,
            modelHash: modelHash,
            metadataURI: metadataURI,
            licenseURI: licenseURI,
            revenueRecipient: revenueRecipient,
            qualityScore: qualityScore,
            active: true,
            verified: false,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        for (uint256 i = 0; i < datasetIds.length; ) {
            modelDatasets[modelId].push(datasetIds[i]);
            unchecked { i++; }
        }
        for (uint256 i = 0; i < evaluationIds.length; ) {
            modelEvaluations[modelId].push(evaluationIds[i]);
            unchecked { i++; }
        }

        publisherModels[msg.sender].push(modelId);
        allModelIds.push(modelId);
        emit ModelPublished(modelId, msg.sender, modelType, modelHash, metadataURI, qualityScore, block.timestamp);
    }

    function updateModel(bytes32 modelId, string calldata metadataURI, uint16 qualityScore, bool active) external whenNotPaused {
        ModelAsset storage model = models[modelId];
        if (model.createdAt == 0) revert ModelNotFound(modelId);
        if (model.publisher != msg.sender) revert NotPublisher(msg.sender, model.publisher);
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        if (qualityScore > 100) revert InvalidQualityScore(qualityScore);
        model.metadataURI = metadataURI;
        model.qualityScore = qualityScore;
        model.active = active;
        model.updatedAt = block.timestamp;
        emit ModelUpdated(modelId, metadataURI, qualityScore, active, block.timestamp);
    }

    function setVerified(bytes32 modelId, bool verified) external onlyOwner {
        ModelAsset storage model = models[modelId];
        if (model.createdAt == 0) revert ModelNotFound(modelId);
        model.verified = verified;
        model.updatedAt = block.timestamp;
        emit ModelVerificationChanged(modelId, verified, block.timestamp);
    }

    function getModelDatasets(bytes32 modelId) external view returns (bytes32[] memory) {
        return modelDatasets[modelId];
    }

    function getModelEvaluations(bytes32 modelId) external view returns (bytes32[] memory) {
        return modelEvaluations[modelId];
    }

    function totalModels() external view returns (uint256) {
        return allModelIds.length;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
