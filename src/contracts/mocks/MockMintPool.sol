// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockMintPool
 * @notice Mock BonzaiMintPool for testing BonzaiContent and BonzaiRoyaltySplitter
 */
contract MockMintPool {
    bool public shouldRevert;
    mapping(uint8 => bool) public poolShouldRevert;
    uint256 public totalDeposits;
    mapping(uint8 => uint256) public poolDeposits;
    uint256[6] private _totalDeposited;

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function setPoolShouldRevert(uint8 poolIndex, bool value) external {
        poolShouldRevert[poolIndex] = value;
    }

    function depositForPool(uint8 poolIndex) external payable {
        if (shouldRevert || poolShouldRevert[poolIndex]) {
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

    /// @notice Mock recordMint (called by BonzaiCollectibles after a successful mint)
    mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public epochMints;
    uint256 public mockEpoch;
    function setMockEpoch(uint256 epochId) external { mockEpoch = epochId; }
    function recordMint(address wallet, uint8 poolIndex) external {
        epochMints[mockEpoch][poolIndex][wallet] += 1;
    }
    function getEpochMints(uint256 epochId, uint8 poolIndex, address user) external view returns (uint256) {
        return epochMints[epochId][poolIndex][user];
    }

    receive() external payable {}
}
