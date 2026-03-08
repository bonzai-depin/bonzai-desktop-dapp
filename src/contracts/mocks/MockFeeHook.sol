// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockFeeHook
 * @notice Mock BonzaiUniswapHook for testing token factories
 */
contract MockFeeHook {
    struct Registration {
        address beneficiary;
        address companionOwner;
        uint8 poolType;
        uint8 mintPoolIndex;
    }

    mapping(bytes32 => Registration) public registrations;
    bytes32[] public registeredPools;

    function registerPool(
        bytes32 poolId,
        address beneficiary,
        address companionOwner,
        uint8 poolType,
        uint8 mintPoolIndex
    ) external {
        registrations[poolId] = Registration({
            beneficiary: beneficiary,
            companionOwner: companionOwner,
            poolType: poolType,
            mintPoolIndex: mintPoolIndex
        });
        registeredPools.push(poolId);
    }

    function getRegistration(bytes32 poolId) external view returns (Registration memory) {
        return registrations[poolId];
    }

    function totalRegistered() external view returns (uint256) {
        return registeredPools.length;
    }
}
