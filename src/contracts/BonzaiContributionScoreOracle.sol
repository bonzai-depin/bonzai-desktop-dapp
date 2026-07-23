// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IBonzaiScoreVault {
    function setContributionScore(address wallet, uint32 score) external;
}

contract BonzaiContributionScoreOracle is Ownable {
    IBonzaiScoreVault public immutable stakingVault;
    mapping(address => bool) public evaluators;

    event EvaluatorUpdated(address indexed evaluator, bool authorized);
    event ScoreAttested(address indexed wallet, uint32 score, bytes32 indexed evidenceHash, address indexed evaluator);

    error UnauthorizedEvaluator();

    constructor(address vault) Ownable(msg.sender) {
        require(vault != address(0), "Invalid vault");
        stakingVault = IBonzaiScoreVault(vault);
    }

    function setEvaluator(address evaluator, bool authorized) external onlyOwner {
        require(evaluator != address(0), "Invalid evaluator");
        evaluators[evaluator] = authorized;
        emit EvaluatorUpdated(evaluator, authorized);
    }

    function attestScore(address wallet, uint32 score, bytes32 evidenceHash) external {
        if (!evaluators[msg.sender]) revert UnauthorizedEvaluator();
        require(wallet != address(0), "Invalid wallet");
        require(evidenceHash != bytes32(0), "Evidence required");
        stakingVault.setContributionScore(wallet, score);
        emit ScoreAttested(wallet, score, evidenceHash, msg.sender);
    }
}
