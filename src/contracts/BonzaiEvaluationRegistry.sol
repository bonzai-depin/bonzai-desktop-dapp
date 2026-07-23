// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract BonzaiEvaluationRegistry is Ownable, ReentrancyGuard, Pausable {
    enum TargetType { CONTRIBUTION, DATASET, MODEL, SKILL, PROVIDER, COMPANION }

    struct Evaluation {
        bytes32 id;
        address evaluator;
        bytes32 targetId;
        TargetType targetType;
        bytes32 evidenceHash;
        string metadataURI;
        uint16 score;
        bool verified;
        uint256 createdAt;
    }

    mapping(bytes32 => Evaluation) public evaluations;
    mapping(bytes32 => bytes32[]) public targetEvaluations;
    mapping(address => bytes32[]) public evaluatorIds;
    bytes32[] public allEvaluationIds;

    event EvaluationRegistered(bytes32 indexed evaluationId, address indexed evaluator, bytes32 indexed targetId, TargetType targetType, uint16 score, string metadataURI, uint256 timestamp);
    event EvaluationVerificationChanged(bytes32 indexed evaluationId, bool verified, uint256 timestamp);

    error EvaluationNotFound(bytes32 evaluationId);
    error InvalidScore(uint16 score);
    error EmptyMetadataURI();

    constructor() Ownable(msg.sender) {}

    function registerEvaluation(
        bytes32 targetId,
        TargetType targetType,
        bytes32 evidenceHash,
        string calldata metadataURI,
        uint16 score
    ) external nonReentrant whenNotPaused returns (bytes32 evaluationId) {
        if (score > 100) revert InvalidScore(score);
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();

        evaluationId = keccak256(abi.encodePacked(msg.sender, targetId, targetType, evidenceHash, block.timestamp, allEvaluationIds.length));
        evaluations[evaluationId] = Evaluation({
            id: evaluationId,
            evaluator: msg.sender,
            targetId: targetId,
            targetType: targetType,
            evidenceHash: evidenceHash,
            metadataURI: metadataURI,
            score: score,
            verified: false,
            createdAt: block.timestamp
        });

        targetEvaluations[targetId].push(evaluationId);
        evaluatorIds[msg.sender].push(evaluationId);
        allEvaluationIds.push(evaluationId);
        emit EvaluationRegistered(evaluationId, msg.sender, targetId, targetType, score, metadataURI, block.timestamp);
    }

    function setVerified(bytes32 evaluationId, bool verified) external onlyOwner {
        Evaluation storage evaluation = evaluations[evaluationId];
        if (evaluation.createdAt == 0) revert EvaluationNotFound(evaluationId);
        evaluation.verified = verified;
        emit EvaluationVerificationChanged(evaluationId, verified, block.timestamp);
    }

    function getTargetEvaluations(bytes32 targetId) external view returns (bytes32[] memory) {
        return targetEvaluations[targetId];
    }

    function totalEvaluations() external view returns (uint256) {
        return allEvaluationIds.length;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
