// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockSkillOwnership
 * @notice Mock for BonzaiSkillOwnership used in SkillRegistry tests
 */
contract MockSkillOwnership {
    bool public shouldRevert;
    uint256 public lastDistributedAmount;
    bytes32 public lastDistributedSkillId;

    function setRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function distributeRevenue(bytes32 skillId, uint256 amount) external payable {
        if (shouldRevert) {
            revert("MockSkillOwnership: forced revert");
        }
        lastDistributedSkillId = skillId;
        lastDistributedAmount = amount;
    }

    receive() external payable {}
}
