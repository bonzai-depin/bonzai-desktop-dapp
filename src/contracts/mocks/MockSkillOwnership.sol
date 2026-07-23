// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockSkillOwnership
 * @notice Mock for BonzaiSkillOwnership used in SkillRegistry tests
 */
contract MockSkillOwnership {
    using SafeERC20 for IERC20;

    bool public shouldRevert;
    bool public tokenAccess = true;
    uint256 public lastDistributedAmount;
    bytes32 public lastDistributedSkillId;
    uint256 public lastDistributedAmountUSDC;

    function setRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function setTokenAccess(bool _tokenAccess) external {
        tokenAccess = _tokenAccess;
    }

    function hasTokenAccess(address, bytes32) external view returns (bool) {
        return tokenAccess;
    }

    function distributeRevenue(bytes32 skillId, uint256 amount) external payable {
        if (shouldRevert) {
            revert("MockSkillOwnership: forced revert");
        }
        lastDistributedSkillId = skillId;
        lastDistributedAmount = amount;
    }

    function distributeRevenueUSDC(bytes32 skillId, uint256 amount) external {
        if (shouldRevert) {
            revert("MockSkillOwnership: forced revert");
        }
        lastDistributedSkillId = skillId;
        lastDistributedAmountUSDC = amount;
        // Pull USDC from caller (SkillRegistry)
        // In tests, the mock just needs to accept the call
    }

    receive() external payable {}
}
