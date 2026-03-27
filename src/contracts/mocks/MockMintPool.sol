// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockMintPool
 * @notice Mock BonzaiMintPool for testing BonzaiContent and BonzaiRoyaltySplitter
 */
contract MockMintPool {
    bool public shouldRevert;
    uint256 public totalDeposits;
    mapping(uint8 => uint256) public poolDeposits;
    uint256[6] private _totalDeposited;

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function depositForPool(uint8 poolIndex) external payable {
        if (shouldRevert) {
            revert("MockMintPool: deposit reverted");
        }
        require(poolIndex < 6, "Invalid pool index");
        poolDeposits[poolIndex] += msg.value;
        _totalDeposited[poolIndex] += msg.value;
        totalDeposits += msg.value;
    }

    function getAllTotalDeposited() external view returns (uint256[6] memory) {
        return _totalDeposited;
    }

    /// @notice Helper to set specific pool deposit amounts for weighted distribution tests
    function setTotalDeposited(uint8 poolIndex, uint256 amount) external {
        _totalDeposited[poolIndex] = amount;
    }

    /// @notice Mock setAuthorizedMinter (called by factory when creating clones)
    function setAuthorizedMinter(address, bool) external {
        // No-op in mock — all callers are accepted
    }

    receive() external payable {}
}
