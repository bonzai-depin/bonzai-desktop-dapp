// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract BonzaiDatasetRegistry is Ownable, ReentrancyGuard, Pausable {
    struct Dataset {
        bytes32 id;
        address owner;
        bytes32 contentHash;
        string metadataURI;
        string licenseURI;
        bool trainingAllowed;
        bool commercialAllowed;
        bool royaltyBearing;
        bool active;
        bool verified;
        uint256 createdAt;
        uint256 updatedAt;
    }

    mapping(bytes32 => Dataset) public datasets;
    mapping(address => bytes32[]) public ownerDatasets;
    mapping(bytes32 => bytes32[]) private datasetContributions;
    bytes32[] public allDatasetIds;

    event DatasetRegistered(bytes32 indexed datasetId, address indexed owner, bytes32 contentHash, string metadataURI, uint256 contributionCount, uint256 timestamp);
    event DatasetUpdated(bytes32 indexed datasetId, string metadataURI, bool active, uint256 timestamp);
    event DatasetVerificationChanged(bytes32 indexed datasetId, bool verified, uint256 timestamp);

    error DatasetNotFound(bytes32 datasetId);
    error NotDatasetOwner(address caller, address owner);
    error EmptyMetadataURI();
    error EmptyLicenseURI();

    constructor() Ownable(msg.sender) {}

    function registerDataset(
        bytes32 contentHash,
        string calldata metadataURI,
        string calldata licenseURI,
        bool trainingAllowed,
        bool commercialAllowed,
        bool royaltyBearing,
        bytes32[] calldata contributionIds
    ) external nonReentrant whenNotPaused returns (bytes32 datasetId) {
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        if (bytes(licenseURI).length == 0) revert EmptyLicenseURI();

        datasetId = keccak256(abi.encodePacked(msg.sender, contentHash, metadataURI, block.timestamp, allDatasetIds.length));
        Dataset storage dataset = datasets[datasetId];
        dataset.id = datasetId;
        dataset.owner = msg.sender;
        dataset.contentHash = contentHash;
        dataset.metadataURI = metadataURI;
        dataset.licenseURI = licenseURI;
        dataset.trainingAllowed = trainingAllowed;
        dataset.commercialAllowed = commercialAllowed;
        dataset.royaltyBearing = royaltyBearing;
        dataset.active = true;
        dataset.createdAt = block.timestamp;
        dataset.updatedAt = block.timestamp;

        for (uint256 i = 0; i < contributionIds.length; ) {
            datasetContributions[datasetId].push(contributionIds[i]);
            unchecked { i++; }
        }

        ownerDatasets[msg.sender].push(datasetId);
        allDatasetIds.push(datasetId);
        emit DatasetRegistered(datasetId, msg.sender, contentHash, metadataURI, contributionIds.length, block.timestamp);
    }

    function updateDataset(bytes32 datasetId, string calldata metadataURI, bool active) external whenNotPaused {
        Dataset storage dataset = datasets[datasetId];
        if (dataset.createdAt == 0) revert DatasetNotFound(datasetId);
        if (dataset.owner != msg.sender) revert NotDatasetOwner(msg.sender, dataset.owner);
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        dataset.metadataURI = metadataURI;
        dataset.active = active;
        dataset.updatedAt = block.timestamp;
        emit DatasetUpdated(datasetId, metadataURI, active, block.timestamp);
    }

    function setVerified(bytes32 datasetId, bool verified) external onlyOwner {
        Dataset storage dataset = datasets[datasetId];
        if (dataset.createdAt == 0) revert DatasetNotFound(datasetId);
        dataset.verified = verified;
        dataset.updatedAt = block.timestamp;
        emit DatasetVerificationChanged(datasetId, verified, block.timestamp);
    }

    function getDatasetContributions(bytes32 datasetId) external view returns (bytes32[] memory) {
        return datasetContributions[datasetId];
    }

    function totalDatasets() external view returns (uint256) {
        return allDatasetIds.length;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
