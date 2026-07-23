// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title BonzaiContributionRegistry
 * @notice Atomic Proof-of-Contribution registry for datasets, appraisals,
 *         generations, skills, provider time, and companion actions.
 * @dev Large files stay off-chain. This contract stores hashes, metadata URIs,
 *      contributor identity, license, visibility, quality, and lineage links.
 */
contract BonzaiContributionRegistry is Ownable, ReentrancyGuard, Pausable {
    enum ContributionType {
        DATASET_TEXT,
        DATASET_IMAGE,
        DATASET_VIDEO,
        APPRAISAL,
        GENERATION,
        MODEL_ADAPTER,
        SKILL,
        EVALUATION,
        PROVIDER_TIME,
        COMPANION_ACTION
    }

    struct Contribution {
        bytes32 id;
        address contributor;
        ContributionType contributionType;
        bytes32 contentHash;
        string metadataURI;
        string licenseURI;
        string sourceURI;
        uint16 qualityScore;
        uint8 visibility;
        bool active;
        bool verified;
        uint256 createdAt;
        uint256 updatedAt;
    }

    mapping(bytes32 => Contribution) public contributions;
    mapping(address => bytes32[]) public contributorIds;
    mapping(bytes32 => bytes32[]) private parentIds;
    bytes32[] public allContributionIds;

    event ContributionRegistered(
        bytes32 indexed contributionId,
        address indexed contributor,
        ContributionType indexed contributionType,
        bytes32 contentHash,
        string metadataURI,
        uint16 qualityScore,
        uint256 timestamp
    );
    event ContributionUpdated(bytes32 indexed contributionId, string metadataURI, uint16 qualityScore, uint256 timestamp);
    event ContributionVerificationChanged(bytes32 indexed contributionId, bool verified, uint256 timestamp);
    event ContributionStatusChanged(bytes32 indexed contributionId, bool active, uint256 timestamp);

    error ContributionAlreadyExists(bytes32 contributionId);
    error ContributionNotFound(bytes32 contributionId);
    error NotContributor(address caller, address contributor);
    error InvalidQualityScore(uint16 qualityScore);
    error EmptyMetadataURI();
    error EmptyLicenseURI();

    constructor() Ownable(msg.sender) {}

    function registerContribution(
        bytes32 contentHash,
        string calldata metadataURI,
        string calldata licenseURI,
        string calldata sourceURI,
        ContributionType contributionType,
        uint16 qualityScore,
        uint8 visibility,
        bytes32[] calldata parents
    ) external nonReentrant whenNotPaused returns (bytes32 contributionId) {
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        if (bytes(licenseURI).length == 0) revert EmptyLicenseURI();
        if (qualityScore > 100) revert InvalidQualityScore(qualityScore);

        contributionId = keccak256(abi.encodePacked(msg.sender, contentHash, metadataURI, block.timestamp, allContributionIds.length));
        if (contributions[contributionId].createdAt != 0) revert ContributionAlreadyExists(contributionId);

        contributions[contributionId] = Contribution({
            id: contributionId,
            contributor: msg.sender,
            contributionType: contributionType,
            contentHash: contentHash,
            metadataURI: metadataURI,
            licenseURI: licenseURI,
            sourceURI: sourceURI,
            qualityScore: qualityScore,
            visibility: visibility,
            active: true,
            verified: false,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        for (uint256 i = 0; i < parents.length; ) {
            parentIds[contributionId].push(parents[i]);
            unchecked { i++; }
        }

        contributorIds[msg.sender].push(contributionId);
        allContributionIds.push(contributionId);

        emit ContributionRegistered(contributionId, msg.sender, contributionType, contentHash, metadataURI, qualityScore, block.timestamp);
    }

    function updateContribution(
        bytes32 contributionId,
        string calldata metadataURI,
        uint16 qualityScore
    ) external whenNotPaused {
        Contribution storage contribution = contributions[contributionId];
        if (contribution.createdAt == 0) revert ContributionNotFound(contributionId);
        if (contribution.contributor != msg.sender) revert NotContributor(msg.sender, contribution.contributor);
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        if (qualityScore > 100) revert InvalidQualityScore(qualityScore);

        contribution.metadataURI = metadataURI;
        contribution.qualityScore = qualityScore;
        contribution.updatedAt = block.timestamp;
        emit ContributionUpdated(contributionId, metadataURI, qualityScore, block.timestamp);
    }

    function setContributionActive(bytes32 contributionId, bool active) external {
        Contribution storage contribution = contributions[contributionId];
        if (contribution.createdAt == 0) revert ContributionNotFound(contributionId);
        if (contribution.contributor != msg.sender) revert NotContributor(msg.sender, contribution.contributor);
        contribution.active = active;
        contribution.updatedAt = block.timestamp;
        emit ContributionStatusChanged(contributionId, active, block.timestamp);
    }

    function setVerified(bytes32 contributionId, bool verified) external onlyOwner {
        Contribution storage contribution = contributions[contributionId];
        if (contribution.createdAt == 0) revert ContributionNotFound(contributionId);
        contribution.verified = verified;
        contribution.updatedAt = block.timestamp;
        emit ContributionVerificationChanged(contributionId, verified, block.timestamp);
    }

    function getParentIds(bytes32 contributionId) external view returns (bytes32[] memory) {
        return parentIds[contributionId];
    }

    function getContributorIds(address contributor) external view returns (bytes32[] memory) {
        return contributorIds[contributor];
    }

    function totalContributions() external view returns (uint256) {
        return allContributionIds.length;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
