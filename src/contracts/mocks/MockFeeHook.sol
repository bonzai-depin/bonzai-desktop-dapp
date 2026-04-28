// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockFeeHook
 * @notice Mock BonzaiUniswapHook for testing token factories.
 *         Mirrors the real hook's 6-arg registerPool signature.
 */
contract MockFeeHook {
    struct Registration {
        address beneficiary;
        address companionNFT;
        uint256 companionTokenId;
        uint8 poolType;
        uint8 mintPoolIndex;
    }

    mapping(bytes32 => Registration) public registrations;
    bytes32[] public registeredPools;

    function registerPool(
        bytes32 poolId,
        address beneficiary,
        address companionNFT,
        uint256 companionTokenId,
        uint8 poolType,
        uint8 mintPoolIndex
    ) external {
        registrations[poolId] = Registration({
            beneficiary: beneficiary,
            companionNFT: companionNFT,
            companionTokenId: companionTokenId,
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
